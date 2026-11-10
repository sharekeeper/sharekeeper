import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import { ciphertextCrc32, decryptCiphertext, encryptPrefixes, firstCipherGroups } from "../src/cipher.js";
import { generateMasterSecret, MASTER_SECRET_BYTES, thresholdSubsets } from "../src/master-secret.js";
import { createKeeperCiphertextPdf } from "../src/keeper-pdf.js";
import { createRecoveryPdf, CRC_CELL, CRC_DIGIT_SIZE, PREFIX_CELL, PREFIX_LETTER_SIZE } from "../src/pdf.js";
import { blankKeeper } from "../shared/schema.js";
import { crc32Hex } from "../site/crc32.js";

const P = "ACADACIDACNEACRYADULAGEDAMAZANCEAPARAQUAARMYAUTHAXISBEAMBENCBEST"
  + "BLAZBONDBUDGCALM"; // 80 letters, obviously synthetic test material
const K = "Z".repeat(80);

test("cipher is per-letter (P + K) mod 26 with A = 0 and decrypts back", () => {
  assert.equal(P.length, 80);
  assert.equal(encryptPrefixes("A".repeat(80), "B".repeat(80)), "B".repeat(80));
  assert.equal(encryptPrefixes("Z".repeat(80), "B".repeat(80)), "A".repeat(80));
  const c = encryptPrefixes(P, K);
  // + Z (25) is − 1 mod 26
  assert.equal(c.slice(0, 4), "ZBZC");
  assert.equal(decryptCiphertext(c, K), P);
  for (let trial = 0; trial < 200; trial += 1) {
    const rand = (n) => Array.from(webcrypto.getRandomValues(new Uint8Array(n)), (b) => String.fromCharCode(65 + (b % 26))).join("");
    const p = rand(80); const k = rand(80);
    assert.equal(decryptCiphertext(encryptPrefixes(p, k), k), p);
  }
  for (const bad of ["", "a".repeat(80), "A".repeat(79), "A".repeat(81), `${"A".repeat(79)}1`, null]) {
    assert.throws(() => encryptPrefixes(bad, K));
    assert.throws(() => encryptPrefixes(P, bad));
  }
});

test("ciphertext CRC32 is CRC-32/ISO-HDLC of the 80 ASCII letters, 8 uppercase hex", () => {
  // Standard check value for CRC-32/ISO-HDLC.
  assert.equal(crc32Hex(new TextEncoder().encode("123456789")), "CBF43926");
  const c = encryptPrefixes(P, K);
  const crc = ciphertextCrc32(c);
  assert.match(crc, /^[0-9A-F]{8}$/);
  assert.equal(crc, crc32Hex(new TextEncoder().encode(c)));
  assert.notEqual(crc, ciphertextCrc32(`${c.slice(0, 79)}${c[79] === "A" ? "B" : "A"}`));
  assert.equal(firstCipherGroups(c), c.slice(0, 8));
});

test("master secret is 16 bytes, needs input and Web Crypto, and differs per call", async () => {
  const contribution = new Uint8Array([2, 1, 2, 3]);
  const a = await generateMasterSecret(contribution, webcrypto);
  const b = await generateMasterSecret(contribution, webcrypto);
  assert.equal(a.length, MASTER_SECRET_BYTES);
  assert.notDeepEqual(a, b);
  // With a fixed CSPRNG block r, the result is r XOR the SHA-512 prefix of the domain-separated input.
  const counter = { getRandomValues: (array) => { array.forEach((_, i) => { array[i] = i; }); return array; }, subtle: webcrypto.subtle };
  const fixed = await generateMasterSecret(contribution, counter);
  const digest = new Uint8Array(await webcrypto.subtle.digest("SHA-512", new Uint8Array([...new TextEncoder().encode("sharekeeper/shamir-offline/master-secret/v1|"), 2, 1, 2, 3])));
  assert.deepEqual(fixed, digest.slice(0, 16).map((b, i) => b ^ i));
  // A constant RNG block is refused.
  await assert.rejects(() => generateMasterSecret(contribution, { getRandomValues: (a) => a.fill(7), subtle: webcrypto.subtle }), /constant/);
  await assert.rejects(() => generateMasterSecret(new Uint8Array(0), webcrypto));
  await assert.rejects(() => generateMasterSecret(contribution, {}));
});

test("master secret failure paths wipe every buffer they touched", async () => {
  const contribution = new Uint8Array([2, 9, 8, 7]);
  // 1. digest rejects: the hashed input buffer must be zero.
  let seenInput;
  await assert.rejects(() => generateMasterSecret(contribution, {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: { digest: async (_a, input) => { seenInput = input; throw new Error("digest failed"); } },
  }), /digest failed/);
  assert.ok(seenInput.length > 0 && seenInput.every((b) => b === 0));
  // 2. RNG fills partially then throws: digest and secret buffers must be zero.
  let seenSecret; let seenDigest;
  await assert.rejects(() => generateMasterSecret(contribution, {
    getRandomValues: (array) => { seenSecret = array; array.fill(0xAB, 0, 8); throw new Error("rng failed"); },
    subtle: { digest: async (a, input) => { const out = await webcrypto.subtle.digest(a, input); seenDigest = new Uint8Array(out); return seenDigest.buffer; } },
  }), /rng failed/);
  assert.ok(seenSecret.every((b) => b === 0), "partial secret wiped");
  assert.ok(seenDigest.every((b) => b === 0), "digest wiped");
  assert.deepEqual([...contribution], [2, 9, 8, 7], "caller input untouched");
});

test("threshold subsets enumerate every n-of-m set", () => {
  assert.equal(thresholdSubsets(5, 3).length, 10);
  assert.equal(thresholdSubsets(5, 5).length, 1);
  assert.equal(thresholdSubsets(2, 2).length, 1);
  assert.deepEqual(thresholdSubsets(4, 2), [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
});

function keepers(count) {
  return Array.from({ length: count }, (_, i) => ({ ...blankKeeper(`k${i + 1}`), name: `TEST ONLY Keeper ${i + 1}`, phone: "+1 202 555 0100" }));
}

function streamsOf(document, page) {
  const contents = page.node.Contents();
  const refs = typeof contents.asArray === "function" ? contents.asArray() : [contents];
  return refs.map((ref) => new TextDecoder("latin1").decode(decodePDFRawStream(document.context.lookup(ref)).decode()));
}

function runs(document, page, overlay) {
  const fonts = page.node.Resources().lookup(PDFName.of("Font"));
  const maps = new Map();
  return [...overlay.matchAll(/BT\n([\s\S]*?)\nET/g)].map(([, block]) => {
    const [, name, size] = block.match(/\/(\S+) ([\d.]+) Tf/);
    const [, x, y] = block.match(/([-\d.e]+) ([-\d.e]+) Tm/);
    const [, encoded] = block.match(/<([0-9A-F]*)> Tj/);
    if (!maps.has(name)) {
      const cmap = new TextDecoder().decode(decodePDFRawStream(fonts.lookup(PDFName.of(name)).lookup(PDFName.of("ToUnicode"))).decode());
      maps.set(name, new Map([...cmap.matchAll(/^<([0-9A-F]+)> <([0-9A-F]+)>$/gm)].map(([, code, u]) => [code, u.match(/.{4}/g).map((v) => String.fromCharCode(parseInt(v, 16))).join("")])));
    }
    const value = (encoded.match(/.{4}/g) ?? []).map((code) => maps.get(name).get(code)).join("");
    return { value, size: Number(size), x: Number(x), y: Number(y) };
  });
}

test("recovery sheet fills first 2 cipher groups and CRC32 in their template boxes", async () => {
  for (const count of [3, 4, 5]) {
    const pads = Array.from({ length: count }, (_, i) => String.fromCharCode(66 + i).repeat(80));
    const texts = pads.map((pad) => encryptPrefixes(P, pad));
    const groups = texts.map(firstCipherGroups);
    const crcs = texts.map(ciphertextCrc32);
    const bytes = await createRecoveryPdf({ keepers: keepers(count), pads, threshold: 2, cipherGroups: groups, ciphertextCrcs: crcs });
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 3);
    for (const page of document.getPages()) {
    const overlay = streamsOf(document, page).at(-1);
    const all = runs(document, page, overlay);
    const prefixRuns = all.filter((r) => r.size === PREFIX_LETTER_SIZE);
    // Contacts can also be drawn at 13 pt; restrict to the prefix and CRC rows.
    const inPrefix = prefixRuns.filter((r) => [0, 1, 2, 3, 4].some((slot) => r.y > PREFIX_CELL.y - slot * 200 && r.y < PREFIX_CELL.y - slot * 200 + PREFIX_CELL.height));
    const inCrc = all.filter((r) => r.size === CRC_DIGIT_SIZE && r.x >= CRC_CELL.x && [0, 1, 2, 3, 4].some((slot) => r.y > CRC_CELL.y - slot * 200 && r.y < CRC_CELL.y - slot * 200 + CRC_CELL.height));
    assert.equal(inPrefix.filter((r) => r.x < CRC_CELL.x).length, count * 8);
    assert.equal(inCrc.length, count * 8);
    for (let slot = 0; slot < count; slot += 1) {
      const letters = inPrefix.filter((r) => r.x < CRC_CELL.x && r.y < PREFIX_CELL.y - slot * 200 + PREFIX_CELL.height && r.y > PREFIX_CELL.y - slot * 200);
      assert.equal(letters.map((r) => r.value).join(""), groups[slot]);
      letters.forEach((r, i) => {
        const cellX = PREFIX_CELL.xs[Math.floor(i / 4)] + (i % 4) * PREFIX_CELL.width;
        assert.ok(r.x > cellX && r.x < cellX + PREFIX_CELL.width, `prefix letter ${i} inside its cell`);
      });
      const digits = inCrc.filter((r) => r.y < CRC_CELL.y - slot * 200 + CRC_CELL.height && r.y > CRC_CELL.y - slot * 200);
      assert.equal(digits.map((r) => r.value).join(""), crcs[slot]);
      digits.forEach((r, i) => assert.ok(r.x > CRC_CELL.x + i * CRC_CELL.width && r.x < CRC_CELL.x + (i + 1) * CRC_CELL.width));
    }
    }
  }
});

test("recovery sheet rejects malformed cipher groups or CRCs", async () => {
  const pads = ["B".repeat(80), "C".repeat(80), "D".repeat(80)];
  const base = { keepers: keepers(3), pads, threshold: 2 };
  const G = ["ABCDEFGH", "ABCDEFGH", "ABCDEFGH"]; const C = ["00000000", "00000000", "00000000"];
  await createRecoveryPdf({ ...base, cipherGroups: G, ciphertextCrcs: C }); // the valid baseline is accepted
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G }));
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: ["abcdefgh", ...G.slice(1)], ciphertextCrcs: C }));
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G, ciphertextCrcs: ["0000000g", ...C.slice(1)] }));
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G.slice(1), ciphertextCrcs: C.slice(1) }));
});

test("hand-out is one PDF with one page per keeper, each page holding only that keeper's name, ciphertext and CRC", async () => {
  const pads = ["B".repeat(80), "C".repeat(80), "D".repeat(80)];
  const texts = pads.map((pad) => encryptPrefixes(P, pad));
  const people = keepers(3);
  const bytes = await createKeeperCiphertextPdf({ keepers: people, ciphertexts: texts, threshold: 2 });
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 3);
  document.getPages().forEach((page, index) => {
    assert.equal(page.getWidth(), 612);
    assert.equal(page.getHeight(), 792);
    const text = runs(document, page, streamsOf(document, page).join("\n")).map((r) => r.value);
    assert.equal(text.filter((v) => /^[A-Z]$/.test(v)).join(""), texts[index]);
    assert.ok(text.includes(ciphertextCrc32(texts[index])));
    assert.ok(text.includes(`TEST ONLY Keeper ${index + 1}`));
    assert.ok(text.some((v) => v.includes(`SHARE 0${index + 1}  |  2 OF 3`)));
    const joined = text.join("\n");
    // No pad or plaintext anywhere; no other keeper's name or ciphertext on this page.
    assert.ok(!joined.includes(pads[index]) && !joined.includes(P));
    texts.forEach((other, j) => { if (j !== index) { assert.ok(!joined.includes(ciphertextCrc32(other))); assert.ok(!joined.includes(people[j].name)); } });
  });
  const ok = { keepers: people, ciphertexts: texts, threshold: 2 };
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, ciphertexts: texts.slice(0, 2) }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, threshold: 4 }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, threshold: 3 })); // n must be at most m − 1
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, threshold: 1 }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, ciphertexts: ["a".repeat(80), ...texts.slice(1)] }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, keepers: [{ name: " " }, ...people.slice(1)] }));
  await assert.rejects(() => createKeeperCiphertextPdf({ keepers: people.slice(0, 2), ciphertexts: texts.slice(0, 2), threshold: 1 }));
});
