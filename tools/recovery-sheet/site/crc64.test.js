import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { crc64Hex, crc64Utf8, formatCrc64, MAX_CRC64_BYTES, normalizeCrc64Input } from "./crc64.js";

const encoder = new TextEncoder();

test("CRC-64/XZ matches the catalogue empty and 123456789 check values", () => {
  assert.equal(crc64Hex(new Uint8Array()), "0000000000000000");
  assert.equal(crc64Utf8(""), "0000000000000000");
  assert.equal(crc64Hex(encoder.encode("123456789")), "995DC9BBDF1939FA");
  assert.equal(crc64Utf8("123456789"), "995DC9BBDF1939FA");
});

test("output is exactly sixteen uppercase hexadecimal characters including leading zeroes", () => {
  assert.equal(crc64Utf8("hello world"), "53037ECDEF2352DA");
  assert.equal(crc64Utf8("é"), "D81587C9579A9684");
  for (const text of ["", "123456789", "hello world", "é", "雪🔐 café"]) {
    assert.match(crc64Utf8(text), /^[0-9A-F]{16}$/);
  }
});

test("UTF-8 includes Unicode and follows TextEncoder without Unicode normalization", () => {
  assert.equal(crc64Utf8("雪🔐 café"), "AE611E588D90D10A");
  assert.equal(crc64Utf8("é"), "D81587C9579A9684");
  assert.equal(crc64Utf8("e\u0301"), "DA6085C29397B904");
  assert.notEqual(crc64Utf8("é"), crc64Utf8("e\u0301"));
  for (const text of ["雪🔐 café", "\uFEFFABC", "\0", "\uD800", "\uDC00"]) {
    assert.equal(crc64Utf8(text), crc64Hex(encoder.encode(text)));
  }
  // TextEncoder's specified replacement for an unpaired surrogate is U+FFFD.
  assert.equal(crc64Utf8("\uD800"), crc64Utf8("\uFFFD"));
});

test("case, leading/trailing whitespace, and exact line endings are significant", () => {
  const variants = ["ABC", "abc", " ABC", "ABC ", "\tABC", "ABC\n", "ABC\r\n"];
  assert.equal(new Set(variants.map(crc64Utf8)).size, variants.length);
  assert.equal(crc64Utf8("A\nB"), "8DBC187570F36368");
  assert.equal(crc64Utf8("A\r\nB"), "CB329A2EB900E93B");
  assert.notEqual(crc64Utf8("A\nB"), crc64Utf8("A\r\nB"));
});

test("binary input includes zero and 255 and respects only the supplied view", () => {
  const bytes = new Uint8Array([0, 255, 128, 1, 0, 255]);
  const original = bytes.slice();
  assert.equal(crc64Hex(bytes), "673A9A30D193C375");
  assert.deepEqual(bytes, original);

  const surrounding = new Uint8Array([22, ...bytes, 33]);
  const view = surrounding.subarray(1, -1);
  assert.equal(crc64Hex(view), "673A9A30D193C375");
  assert.notEqual(crc64Hex(surrounding), crc64Hex(view));
  assert.equal(crc64Hex(Buffer.from(bytes)), "673A9A30D193C375");
});

test("helpers reject invalid input types instead of coercing them", () => {
  for (const input of [
    undefined, null, "", "123456789", 123, true, [], [0, 255], {},
    new ArrayBuffer(2), new DataView(new ArrayBuffer(2)),
    new Uint16Array([1, 2]), new Int8Array([0, -1]), new Uint8ClampedArray([0, 255]),
  ]) {
    assert.throws(() => crc64Hex(input), TypeError);
  }
  for (const input of [
    undefined, null, 123, true, [], {}, new String("ABC"), new Uint8Array(),
  ]) {
    assert.throws(() => crc64Utf8(input), TypeError);
  }
});

test("the 10 MiB byte limit is inclusive and overflow fails without shortening input", () => {
  assert.equal(MAX_CRC64_BYTES, 10 * 1024 * 1024);
  assert.equal(crc64Hex(new Uint8Array(MAX_CRC64_BYTES)), "C62CE7DCC535E976");
  assert.equal(crc64Utf8("A".repeat(MAX_CRC64_BYTES)), "3F29C86872D5BA32");

  const oversizedBytes = new Uint8Array(MAX_CRC64_BYTES + 1);
  oversizedBytes[oversizedBytes.length - 1] = 255;
  assert.throws(() => crc64Hex(oversizedBytes), { name: "RangeError", message: /10 MiB/ });
  assert.equal(oversizedBytes.length, MAX_CRC64_BYTES + 1);
  assert.equal(oversizedBytes[oversizedBytes.length - 1], 255);
  assert.throws(() => crc64Utf8("A".repeat(MAX_CRC64_BYTES + 1)), RangeError);
  // Character count alone is not a byte limit.
  assert.throws(() => crc64Utf8("é".repeat(MAX_CRC64_BYTES / 2 + 1)), RangeError);
  assert.throws(() => crc64Utf8("🔐".repeat(MAX_CRC64_BYTES / 4 + 1)), RangeError);
});

test("independent bitwise model covers binary patterns, Unicode, and varying byte lengths", () => {
  const fixtures = [
    new Uint8Array(),
    encoder.encode("123456789"),
    encoder.encode("hello world"),
    encoder.encode("雪🔐 café\r\n \t\0"),
    Uint8Array.from({ length: 256 }, (_, index) => index),
    Uint8Array.from({ length: 65537 }, (_, index) => (index * 73 + 19) & 255),
  ];
  // A deterministic test-only sequence, unrelated to any application randomness.
  let state = 0x12345678;
  for (let index = 0; index < 64; index += 1) {
    const bytes = new Uint8Array(index * 17);
    for (let offset = 0; offset < bytes.length; offset += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      bytes[offset] = state >>> 24;
    }
    fixtures.push(bytes);
  }

  // Independent bit-by-bit model straight from the catalogue parameters
  // (width 64, poly 0x42F0E1EBA9EA3693, init/xorout all ones, refin/refout true),
  // using BigInt and MSB-first shifting rather than the reflected lookup table.
  const MASK = (1n << 64n) - 1n;
  const POLY = 0x42F0E1EBA9EA3693n;
  const reflect = (value, width) => { let out = 0n; for (let bit = 0n; bit < width; bit += 1n) if ((value >> bit) & 1n) out |= 1n << (width - 1n - bit); return out; };
  const reference = (bytes) => {
    let crc = MASK;
    for (const byte of bytes) {
      crc ^= reflect(BigInt(byte), 8n) << 56n;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & (1n << 63n)) ? ((crc << 1n) ^ POLY) & MASK : (crc << 1n) & MASK;
    }
    return (reflect(crc, 64n) ^ MASK).toString(16).toUpperCase().padStart(16, "0");
  };
  const expected = fixtures.map(reference);
  assert.equal(expected.length, fixtures.length);
  assert.deepEqual(fixtures.map(crc64Hex), expected);
});

test("matches the CRC64 that xz records for the same bytes, when xz is installed", (t) => {
  const probe = spawnSync("xz", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) { t.skip("xz is not installed"); return; }
  for (const bytes of [encoder.encode("123456789"), encoder.encode("雪🔐 café"), Uint8Array.from({ length: 4099 }, (_, i) => (i * 131 + 7) & 255)]) {
    const packed = spawnSync("xz", ["--check=crc64", "--format=xz", "-c"], { input: bytes });
    assert.equal(packed.status, 0);
    const listed = spawnSync("sh", ["-c", "f=$(mktemp) && cat > \"$f\" && xz -lvv --robot \"$f\"; s=$?; rm -f \"$f\"; exit $s"], { input: packed.stdout, encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    const block = listed.stdout.split("\n").find((line) => line.startsWith("block\t"));
    assert.equal(block.split("\t")[10].toUpperCase(), crc64Hex(bytes));
  }
});

test("display form groups the 16 digits in fours; input accepts spaces or none", () => {
  assert.equal(formatCrc64("995DC9BBDF1939FA"), "995D C9BB DF19 39FA");
  assert.equal(formatCrc64("0000000000000000"), "0000 0000 0000 0000");
  for (const bad of ["995DC9BBDF1939F", "995dc9bbdf1939fa", "995D C9BB DF19 39FA", 123]) assert.throws(() => formatCrc64(bad), TypeError);
  for (const ok of ["995DC9BBDF1939FA", "995D C9BB DF19 39FA", " 995d c9bb\tdf19 39fa "]) assert.equal(normalizeCrc64Input(ok), "995DC9BBDF1939FA");
  for (const bad of ["", "0x995DC9BBDF1939FA", "995D C9BB DF19 39F", "995D-C9BB-DF19-39FA"]) assert.equal(normalizeCrc64Input(bad), "");
});
