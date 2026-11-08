import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { GROUP_LENGTH, PAD_LENGTH } from "../shared/schema.js";
import {
  BROWSER_SEED_BITS,
  generatePads,
  generatePadsWithEntropy,
  groupPad,
  isValidPad,
} from "../src/pads.js";

// All injected bytes below are synthetic test fixtures, not real pad material.
function constantSource(byte = 0) {
  return {
    calls: 0,
    getRandomValues(bytes) {
      this.calls += 1;
      assert.ok(bytes instanceof Uint8Array);
      bytes.fill(byte);
      return bytes;
    },
  };
}

test("generates exactly 3, 4, or 5 full-length A–Z pads using Web Crypto", () => {
  for (const count of [3, 4, 5]) {
    const pads = generatePads(count, webcrypto);
    assert.equal(pads.length, count);
    for (const pad of pads) {
      assert.equal(pad.length, PAD_LENGTH);
      assert.match(pad, /^[A-Z]+$/);
      assert.equal(isValidPad(pad), true);
    }
  }
});

test("rejects every byte from 234 through 255 before modulo mapping", () => {
  const accepted = [0, 25, 26, 51, 52, 233];
  const source = {
    calls: 0,
    getRandomValues(bytes) {
      this.calls += 1;
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] =
          this.calls === 1
            ? 234 + (index % 22)
            : accepted[index % accepted.length];
      }
      return bytes;
    },
  };

  const pads = generatePads(3, source);
  const expected = "AZAZAZ".repeat(Math.ceil(PAD_LENGTH / 6)).slice(0, PAD_LENGTH);
  assert.deepEqual(pads, [expected, expected, expected]);
  assert.equal(source.calls, 4);
});

test("maps each accepted byte to its correct A–Z letter", () => {
  const source = {
    next: 0,
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = this.next++ % 234;
      }
      return bytes;
    },
  };
  const pads = generatePads(3, source);
  const expected = Array.from({ length: PAD_LENGTH * 3 }, (_, index) =>
    String.fromCharCode(65 + ((index % 234) % 26)),
  ).join("");
  assert.equal(pads.join(""), expected);
});

test("samples each pad and each invocation afresh without deduplication", () => {
  const source = {
    calls: 0,
    getRandomValues(bytes) {
      bytes.fill(this.calls++);
      return bytes;
    },
  };
  assert.deepEqual(generatePads(3, source), [
    "A".repeat(PAD_LENGTH),
    "B".repeat(PAD_LENGTH),
    "C".repeat(PAD_LENGTH),
  ]);
  assert.deepEqual(generatePads(3, source), [
    "D".repeat(PAD_LENGTH),
    "E".repeat(PAD_LENGTH),
    "F".repeat(PAD_LENGTH),
  ]);
  assert.equal(source.calls, 6);

  // Equal random results are allowed; no derivation or uniqueness filter is used.
  const repeated = generatePads(3, constantSource(0));
  assert.deepEqual(repeated, Array(3).fill("A".repeat(PAD_LENGTH)));
});

test("rejects invalid counts before requesting randomness", () => {
  const source = constantSource();
  for (const count of [
    undefined,
    null,
    "3",
    true,
    0,
    2,
    6,
    -3,
    3.5,
    NaN,
    Infinity,
    -Infinity,
    {},
  ]) {
    assert.throws(() => generatePads(count, source), {
      name: "RangeError",
      message: /integer from 3 to 5/,
    });
  }
  assert.equal(source.calls, 0);
});

test("fails closed when secure randomness is unavailable", () => {
  for (const source of [null, {}, { getRandomValues: 1 }]) {
    assert.throws(() => generatePads(3, source), /Secure randomness is unavailable/);
  }
});

test("propagates secure-source failure and clears its temporary byte buffer", () => {
  const failure = new Error("Synthetic secure-source failure");
  let captured;
  const source = {
    getRandomValues(bytes) {
      captured = bytes;
      bytes.fill(42);
      throw failure;
    },
  };
  assert.throws(() => generatePads(3, source), (error) => error === failure);
  assert.ok(captured.every((byte) => byte === 0));
});

test("bounds a pathological source that never returns an acceptable byte", () => {
  const source = constantSource(255);
  assert.throws(
    () => generatePads(3, source),
    /exceeded its rejection-sampling limit/,
  );
  assert.ok(source.calls > 0);
  assert.ok(source.calls <= 128);
});

test("clears its temporary byte buffer after successful generation", () => {
  let captured;
  const source = {
    getRandomValues(bytes) {
      captured = bytes;
      bytes.fill(25);
      return bytes;
    },
  };
  assert.deepEqual(generatePads(3, source), Array(3).fill("Z".repeat(PAD_LENGTH)));
  assert.ok(captured.every((byte) => byte === 0));
});

test("groups pads in fours without dropping or changing letters", () => {
  const pad = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(4).slice(0, PAD_LENGTH);
  const formatted = groupPad(pad);
  const groups = formatted.split(" ");
  assert.equal(groups.length, PAD_LENGTH / GROUP_LENGTH);
  assert.ok(groups.every((group) => group.length === GROUP_LENGTH));
  assert.equal(groups[0], "ABCD");
  assert.equal(formatted.replaceAll(" ", ""), pad);
});

test("validation and grouping reject malformed pads", () => {
  for (const pad of [
    null,
    undefined,
    [],
    80,
    "",
    "A".repeat(PAD_LENGTH - 1),
    "A".repeat(PAD_LENGTH + 1),
    "a".repeat(PAD_LENGTH),
    `${"A".repeat(PAD_LENGTH - 1)}0`,
    `${"A".repeat(PAD_LENGTH - 1)} `,
    `${"A".repeat(PAD_LENGTH - 1)}\n`,
    `${"A".repeat(PAD_LENGTH - 1)}É`,
  ]) {
    assert.equal(isValidPad(pad), false);
    assert.throws(() => groupPad(pad), {
      name: "TypeError",
      message: /exactly 80 uppercase/,
    });
  }
});

function mixedSource(byte = 0, subtle = webcrypto.subtle) {
  return { ...constantSource(byte), subtle };
}

function contribution(value = 1) {
  return new Uint8Array([value, 2, 3, 4, 5, 6]);
}

// Independent reference: SHA-512 counter-mode user block, XOR, rejection.
async function referencePads(count, input, seedFor) {
  const pads = [];
  for (let keeper = 0; keeper < count; keeper += 1) {
    let pad = "";
    for (let block = 0; pad.length < PAD_LENGTH; block += 1) {
      const user = new Uint8Array(200);
      for (let chunk = 0; chunk * 64 < 200; chunk += 1) {
        const prefix = new TextEncoder().encode(`sharekeeper/recovery-sheet/user-stream/v2|keeper:${keeper}|block:${block}|chunk:${chunk}|`);
        const digest = createHash("sha512").update(prefix).update(input).digest();
        user.set(digest.subarray(0, Math.min(64, 200 - chunk * 64)), chunk * 64);
      }
      const seed = seedFor(keeper, block);
      for (let index = 0; index < 200 && pad.length < PAD_LENGTH; index += 1) {
        const byte = seed[index] ^ user[index];
        if (byte < 234) pad += String.fromCharCode(65 + (byte % 26));
      }
    }
    pads.push(pad);
  }
  return pads;
}

test("mixed API draws one fresh 1600-bit (200-byte) browser seed per keeper", async () => {
  assert.equal(BROWSER_SEED_BITS, 1600);
  for (const count of [3, 4, 5]) {
    const sizes = [];
    const source = {
      subtle: webcrypto.subtle,
      getRandomValues(bytes) {
        sizes.push(bytes.byteLength);
        return webcrypto.getRandomValues(bytes);
      },
    };
    const pads = await generatePadsWithEntropy(count, contribution(), source);
    assert.equal(pads.length, count);
    assert.ok(pads.every(isValidPad));
    assert.deepEqual(sizes, Array(count).fill(200));
  }
});

test("mixed API equals XOR of the browser seed and the SHA-512 user block, then rejection", async () => {
  const input = new Uint8Array(4001).map((_, index) => (index * 37 + 11) & 255);
  const seeds = [];
  const source = {
    subtle: webcrypto.subtle,
    getRandomValues(bytes) {
      webcrypto.getRandomValues(bytes);
      seeds.push(bytes.slice());
      return bytes;
    },
  };
  const pads = await generatePadsWithEntropy(5, input, source);
  let call = 0;
  assert.deepEqual(pads, await referencePads(5, input, () => seeds[call++]));
});

test("mixed API output is uniform-letter even when the user block is constant", async () => {
  // With a zero browser seed the pad is exactly the user block's letters;
  // with a fixed user record, distinct browser seeds still give distinct pads.
  const fixed = contribution(7);
  const zero = await generatePadsWithEntropy(3, fixed, mixedSource(0));
  assert.deepEqual(zero, await referencePads(3, fixed, () => new Uint8Array(200)));
  const a = await generatePadsWithEntropy(3, fixed);
  const b = await generatePadsWithEntropy(3, fixed);
  assert.notDeepEqual(a, b);
});

test("mixed API changes output when contribution or random seed changes", async () => {
  const baseline = await generatePadsWithEntropy(3, contribution(1), mixedSource(11));
  const sameInputs = await generatePadsWithEntropy(3, contribution(1), mixedSource(11));
  const changedContribution = await generatePadsWithEntropy(3, contribution(9), mixedSource(11));
  const changedSeed = await generatePadsWithEntropy(3, contribution(1), mixedSource(12));
  assert.deepEqual(baseline, sameInputs);
  for (let index = 0; index < baseline.length; index += 1) {
    assert.notEqual(baseline[index], changedContribution[index]);
    assert.notEqual(baseline[index], changedSeed[index]);
  }
  // Keeper-domain separation works even with a repeated synthetic seed.
  assert.equal(new Set(baseline).size, 3);
});

test("mixed API rejects invalid counts before hashing or requesting randomness", async () => {
  const source = mixedSource();
  for (const count of [undefined, null, "3", 2, 6, 3.5, NaN, Infinity]) {
    await assert.rejects(generatePadsWithEntropy(count, contribution(), source), /integer from 3 to 5/);
  }
  assert.equal(source.calls, 0);
});

test("mixed API rejects empty, wrongly typed, or oversized contributions", async () => {
  const source = mixedSource();
  for (const input of [undefined, null, "", [1, 2, 3], new ArrayBuffer(3), new Uint8Array(), new Uint8Array(262_145)]) {
    await assert.rejects(generatePadsWithEntropy(3, input, source), /nonempty Uint8Array of at most 262144 bytes/);
  }
  assert.equal(source.calls, 0);
  const pads = await generatePadsWithEntropy(3, new Uint8Array(262_144), source);
  assert.ok(pads.every(isValidPad));
});

test("mixed API fails closed without getRandomValues or SubtleCrypto digest", async () => {
  for (const source of [null, {}, constantSource(), { subtle: webcrypto.subtle }, { ...constantSource(), subtle: {} }]) {
    await assert.rejects(generatePadsWithEntropy(3, contribution(), source), /Web Crypto SubtleCrypto are required/);
  }
});

test("mixed API snapshots caller input and clears private byte buffers", async () => {
  const original = contribution();
  const snapshot = original.slice();
  const captures = { seeds: [], inputs: [], digests: [] };
  const source = {
    getRandomValues(bytes) {
      captures.seeds.push(bytes);
      bytes.fill(18);
      return bytes;
    },
    subtle: {
      async digest(algorithm, bytes) {
        assert.equal(algorithm, "SHA-512");
        captures.inputs.push(bytes);
        original.fill(99);
        const result = await webcrypto.subtle.digest(algorithm, bytes);
        return result;
      },
    },
  };
  const pads = await generatePadsWithEntropy(3, original, source);
  const expected = await generatePadsWithEntropy(3, snapshot, mixedSource(18));
  assert.deepEqual(pads, expected);
  assert.ok(original.every((byte) => byte === 99)); // Caller-owned, not erased.
  assert.equal(captures.inputs.length, 3 * 4);
  for (const bytes of [...captures.seeds, ...captures.inputs]) {
    assert.ok(bytes.every((byte) => byte === 0));
  }
});

test("mixed API clears seed and inputs on digest failure", async () => {
  const failure = new Error("Synthetic digest failure");
  let capturedSeed;
  let capturedInput;
  const source = {
    getRandomValues(bytes) {
      capturedSeed = bytes;
      bytes.fill(12);
      return bytes;
    },
    subtle: {
      digest(algorithm, bytes) {
        capturedInput = bytes;
        throw failure;
      },
    },
  };
  await assert.rejects(generatePadsWithEntropy(3, contribution(), source), (error) => error === failure);
  assert.ok(capturedSeed.every((byte) => byte === 0));
  assert.ok(capturedInput.every((byte) => byte === 0));
});

test("mixed API rejects high bytes and bounds a pathological source", async () => {
  // Choose browser bytes so every combined byte is >= 234 (always rejected).
  const input = contribution();
  const reference = [];
  for (let block = 0; block < 8; block += 1) {
    const user = new Uint8Array(200);
    for (let chunk = 0; chunk * 64 < 200; chunk += 1) {
      const prefix = new TextEncoder().encode(`sharekeeper/recovery-sheet/user-stream/v2|keeper:0|block:${block}|chunk:${chunk}|`);
      user.set(createHash("sha512").update(prefix).update(input).digest().subarray(0, Math.min(64, 200 - chunk * 64)), chunk * 64);
    }
    reference.push(user);
  }
  let calls = 0;
  const source = {
    subtle: webcrypto.subtle,
    getRandomValues(bytes) {
      const user = reference[calls];
      calls += 1;
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = user[index] ^ 255;
      return bytes;
    },
  };
  await assert.rejects(generatePadsWithEntropy(3, input, source), /Entropy mixing exceeded its rejection-sampling limit/);
  assert.equal(calls, 8);
});
