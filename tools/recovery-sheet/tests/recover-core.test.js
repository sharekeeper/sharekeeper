import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { analyzeShare, letterIssue, normalizeLetters, recoverFirstAddress, summarizeSets } from "../src/recover-core.js";
import { splitMasterSecret, wordPrefixes } from "../src/slip39.js";
import { ciphertextCrc64, encryptPrefixes } from "../src/cipher.js";
import { firstBip84Address } from "../src/btc-address.js";
import { formatCrc64 } from "../site/crc64.js";

const secret = Uint8Array.from({ length: 16 }, (_, i) => (i * 29 + 5) & 255);
const pads = ["Q", "R", "S"].map((letter, i) => Array.from({ length: 80 }, (_, j) => String.fromCharCode(65 + ((j * (i + 3) + letter.charCodeAt(0)) % 26))).join(""));
const group = (text) => text.match(/.{4}/g).join(" ");

async function fixture() {
  const mnemonics = await splitMasterSecret({ masterSecret: secret, threshold: 2, shareCount: 3, crypto: webcrypto });
  const ciphertexts = mnemonics.map((m, i) => encryptPrefixes(wordPrefixes(m), pads[i]));
  return { mnemonics, ciphertexts };
}

test("letters are normalised and length-checked", () => {
  assert.equal(normalizeLetters(" abcd efgh\n-ijkl "), "ABCDEFGHIJKL");
  assert.match(letterIssue("Pad", ""), /not entered/);
  assert.match(letterIssue("Pad", "ABC1"), /only the letters/);
  assert.match(letterIssue("Pad", "ABCD"), /4 of 80/);
  assert.equal(letterIssue("Pad", "A".repeat(80)), "");
});

test("a correct share decrypts, validates and matches its CRC64 and first groups", async () => {
  const { mnemonics, ciphertexts } = await fixture();
  for (let i = 0; i < 3; i += 1) {
    const report = analyzeShare({ ciphertext: group(ciphertexts[i]).toLowerCase(), pad: group(pads[i]), expectedCrc: formatCrc64(ciphertextCrc64(ciphertexts[i])), expectedGroups: ciphertexts[i].slice(0, 8) });
    assert.equal(report.ready, true, report.issues.join(" "));
    assert.equal(report.crcStatus, "match");
    assert.equal(report.groupsStatus, "match");
    assert.equal(report.mnemonic, mnemonics[i]);
    assert.equal(report.share.memberIndex, i);
    assert.equal(report.share.memberThreshold, 2);
  }
});

test("copy mistakes are caught: CRC64 mismatch, wrong group, failed checksum", async () => {
  const { ciphertexts } = await fixture();
  const c = ciphertexts[0];
  const flipped = c.slice(0, 41) + (c[41] === "A" ? "B" : "A") + c.slice(42);
  const crcReport = analyzeShare({ ciphertext: flipped, pad: pads[0], expectedCrc: ciphertextCrc64(c) });
  assert.equal(crcReport.crcStatus, "mismatch");
  assert.equal(crcReport.ready, false);
  // Without an expected CRC the decryption itself must still fail (word or checksum).
  const bare = analyzeShare({ ciphertext: flipped, pad: pads[0] });
  assert.equal(bare.ready, false);
  assert.ok(bare.issues.some((issue) => /Group 11|checksum/.test(issue)), bare.issues.join(" "));
  assert.equal(bare.mnemonic, "");
  // Wrong pad entirely.
  const wrongPad = analyzeShare({ ciphertext: c, pad: pads[1] });
  assert.equal(wrongPad.ready, false);
  assert.equal(wrongPad.mnemonic, "");
  // Wrong first groups.
  const groups = analyzeShare({ ciphertext: c, pad: pads[0], expectedGroups: "AAAAAAAA" });
  assert.equal(groups.groupsStatus, "mismatch");
  assert.equal(groups.ready, false);
});

test("sets need threshold distinct members; duplicates are not counted twice", async () => {
  const { ciphertexts } = await fixture();
  const reports = [0, 0, 1].map((i) => analyzeShare({ ciphertext: ciphertexts[i], pad: pads[i] }));
  const [set] = summarizeSets(reports);
  assert.deepEqual(set.members.sort(), [0, 1]);
  assert.deepEqual(set.duplicates, [1]);
  assert.equal(set.enough, true);
  assert.equal(summarizeSets([reports[0]])[0].enough, false);
});

test("a recovered set gives the original first address; the secret is never returned", async () => {
  const { mnemonics } = await fixture();
  const expected = firstBip84Address(secret);
  const result = await recoverFirstAddress({ mnemonics: [mnemonics[2], mnemonics[0]], expectedAddress: expected, crypto: webcrypto });
  assert.deepEqual(Object.keys(result).sort(), ["address", "expectedStatus"]);
  assert.equal(result.address, expected);
  assert.equal(result.expectedStatus, "match");
  const other = await recoverFirstAddress({ mnemonics: mnemonics.slice(0, 2), passphrase: "not empty", expectedAddress: expected, crypto: webcrypto });
  assert.equal(other.expectedStatus, "mismatch", "a different passphrase gives a different wallet");
  await assert.rejects(() => recoverFirstAddress({ mnemonics: mnemonics.slice(0, 1), crypto: webcrypto }));
});
