import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { GROUP_LENGTH, PAD_LENGTH } from "../shared/schema.js";
import {
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

test("mixed API generates valid pads with one fresh 32-byte seed per keeper", async () => {
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
    assert.deepEqual(sizes, Array(count).fill(32));
  }
});

test("mixed API changes output when contribution or random seed changes", async () => {
  const baseline = await generatePadsWithEntropy(
    3,
    contribution(1),
    mixedSource(11),
  );
  const sameInputs = await generatePadsWithEntropy(
    3,
    contribution(1),
    mixedSource(11),
  );
  const changedContribution = await generatePadsWithEntropy(
    3,
    contribution(9),
    mixedSource(11),
  );
  const changedSeed = await generatePadsWithEntropy(
    3,
    contribution(1),
    mixedSource(12),
  );
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
    await assert.rejects(
      generatePadsWithEntropy(count, contribution(), source),
      /integer from 3 to 5/,
    );
  }
  assert.equal(source.calls, 0);
});

test("mixed API rejects empty, wrongly typed, or oversized contributions", async () => {
  const source = mixedSource();
  for (const input of [
    undefined,
    null,
    "",
    [1, 2, 3],
    new ArrayBuffer(3),
    new Uint8Array(),
    new Uint8Array(65_537),
  ]) {
    await assert.rejects(
      generatePadsWithEntropy(3, input, source),
      /nonempty Uint8Array of at most 65536 bytes/,
    );
  }
  assert.equal(source.calls, 0);
  const pads = await generatePadsWithEntropy(
    3,
    new Uint8Array(65_536),
    source,
  );
  assert.ok(pads.every(isValidPad));
});

test("mixed API fails closed without getRandomValues or complete SubtleCrypto", async () => {
  for (const source of [
    null,
    {},
    constantSource(),
    { subtle: webcrypto.subtle },
    { ...constantSource(), subtle: {} },
    { ...constantSource(), subtle: { digest() {}, importKey() {} } },
  ]) {
    await assert.rejects(
      generatePadsWithEntropy(3, contribution(), source),
      /Web Crypto SubtleCrypto are required/,
    );
  }
});

test("mixed API snapshots caller input and clears private byte buffers", async () => {
  const original = contribution();
  const snapshot = original.slice();
  const captures = { seeds: [], batches: [], input: null, salt: null };
  const source = {
    getRandomValues(bytes) {
      captures.seeds.push(bytes);
      bytes.fill(18);
      return bytes;
    },
    subtle: {
      digest(algorithm, bytes) {
        captures.input = bytes;
        assert.notEqual(bytes, original);
        assert.deepEqual(bytes, snapshot);
        original.fill(99);
        return webcrypto.subtle.digest(algorithm, bytes);
      },
      importKey(format, seed, algorithm, extractable, usages) {
        assert.equal(format, "raw");
        assert.equal(algorithm, "HKDF");
        assert.equal(extractable, false);
        assert.deepEqual(usages, ["deriveBits"]);
        return webcrypto.subtle.importKey(
          format,
          seed,
          algorithm,
          extractable,
          usages,
        );
      },
      async deriveBits(algorithm, key, bitLength) {
        captures.salt = algorithm.salt;
        assert.equal(algorithm.name, "HKDF");
        assert.equal(algorithm.hash, "SHA-256");
        assert.equal(bitLength, 256 * 8);
        assert.match(
          new TextDecoder().decode(algorithm.info),
          /^sharekeeper\/recovery-sheet\/pad\/v1\|keeper:[0-2]\|batch:0$/,
        );
        const result = await webcrypto.subtle.deriveBits(
          algorithm,
          key,
          bitLength,
        );
        captures.batches.push(new Uint8Array(result));
        return result;
      },
    },
  };
  const pads = await generatePadsWithEntropy(3, original, source);
  const expected = await generatePadsWithEntropy(3, snapshot, mixedSource(18));
  assert.deepEqual(pads, expected);
  assert.ok(original.every((byte) => byte === 99)); // Caller-owned, not erased.
  assert.ok(captures.input.every((byte) => byte === 0));
  assert.ok(captures.salt.every((byte) => byte === 0));
  for (const bytes of [...captures.seeds, ...captures.batches]) {
    assert.ok(bytes.every((byte) => byte === 0));
  }
});

test("mixed API clears seed and contribution buffers on import failure", async () => {
  const failure = new Error("Synthetic HKDF import failure");
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
        return webcrypto.subtle.digest(algorithm, bytes);
      },
      importKey() {
        throw failure;
      },
      deriveBits() {
        assert.fail("Derivation must not run after import failure.");
      },
    },
  };
  await assert.rejects(
    generatePadsWithEntropy(3, contribution(), source),
    (error) => error === failure,
  );
  assert.ok(capturedSeed.every((byte) => byte === 0));
  assert.ok(capturedInput.every((byte) => byte === 0));
});

test("mixed API rejects high bytes and bounds pathological HKDF output", async () => {
  let batches = 0;
  const source = mixedSource(1, {
    digest: (...args) => webcrypto.subtle.digest(...args),
    importKey: (...args) => webcrypto.subtle.importKey(...args),
    deriveBits() {
      batches += 1;
      return new Uint8Array(256).fill(234 + (batches % 22)).buffer;
    },
  });
  await assert.rejects(
    generatePadsWithEntropy(3, contribution(), source),
    /Entropy mixing exceeded its rejection-sampling limit/,
  );
  assert.equal(batches, 128);
  assert.equal(source.calls, 1);
});

test("mixed API separates retry batches and applies rejection before modulo", async () => {
  const contexts = [];
  const source = mixedSource(1, {
    digest: (...args) => webcrypto.subtle.digest(...args),
    importKey: (...args) => webcrypto.subtle.importKey(...args),
    deriveBits(algorithm) {
      const context = new TextDecoder().decode(algorithm.info);
      contexts.push(context);
      if (context.endsWith("batch:0")) {
        return new Uint8Array(256).fill(255).buffer;
      }
      const bytes = new Uint8Array(256);
      const sample = [234, 255, 0, 25, 26, 51, 52, 233];
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = sample[index % sample.length];
      }
      return bytes.buffer;
    },
  });
  const pads = await generatePadsWithEntropy(3, contribution(), source);
  const expected = "AZAZAZ".repeat(Math.ceil(PAD_LENGTH / 6)).slice(0, PAD_LENGTH);
  assert.deepEqual(pads, Array(3).fill(expected));
  assert.equal(new Set(contexts).size, 6);
  assert.ok(contexts[0].endsWith("keeper:0|batch:0"));
  assert.ok(contexts[1].endsWith("keeper:0|batch:1"));
});
