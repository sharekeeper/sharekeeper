import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as zlib from "node:zlib";
import { crc32Hex, crc32Utf8, MAX_CRC32_BYTES } from "./crc32.js";

const encoder = new TextEncoder();

test("CRC-32/ISO-HDLC matches the standard empty and 123456789 vectors", () => {
  assert.equal(crc32Hex(new Uint8Array()), "00000000");
  assert.equal(crc32Utf8(""), "00000000");
  assert.equal(crc32Hex(encoder.encode("123456789")), "CBF43926");
  assert.equal(crc32Utf8("123456789"), "CBF43926");
});

test("output is exactly eight uppercase hexadecimal characters including leading zeroes", () => {
  assert.equal(crc32Utf8("hello world"), "0D4A1185");
  assert.equal(crc32Utf8("é"), "0E048D3E");
  for (const text of ["", "123456789", "hello world", "é", "雪🔐 café"]) {
    assert.match(crc32Utf8(text), /^[0-9A-F]{8}$/);
  }
});

test("UTF-8 includes Unicode and follows TextEncoder without Unicode normalization", () => {
  assert.equal(crc32Utf8("雪🔐 café"), "30A60A22");
  assert.equal(crc32Utf8("é"), "0E048D3E");
  assert.equal(crc32Utf8("e\u0301"), "4CADFB2D");
  assert.notEqual(crc32Utf8("é"), crc32Utf8("e\u0301"));
  for (const text of ["雪🔐 café", "\uFEFFABC", "\0", "\uD800", "\uDC00"]) {
    assert.equal(crc32Utf8(text), crc32Hex(encoder.encode(text)));
  }
  // TextEncoder's specified replacement for an unpaired surrogate is U+FFFD.
  assert.equal(crc32Utf8("\uD800"), crc32Utf8("\uFFFD"));
});

test("case, leading/trailing whitespace, and exact line endings are significant", () => {
  const variants = ["ABC", "abc", " ABC", "ABC ", "\tABC", "ABC\n", "ABC\r\n"];
  assert.equal(new Set(variants.map(crc32Utf8)).size, variants.length);
  assert.equal(crc32Utf8("A\nB"), "EC24F6D3");
  assert.equal(crc32Utf8("A\r\nB"), "6809BB21");
  assert.notEqual(crc32Utf8("A\nB"), crc32Utf8("A\r\nB"));
});

test("binary input includes zero and 255 and respects only the supplied view", () => {
  const bytes = new Uint8Array([0, 255, 128, 1, 0, 255]);
  const original = bytes.slice();
  assert.equal(crc32Hex(bytes), "BA3F55AE");
  assert.deepEqual(bytes, original);

  const surrounding = new Uint8Array([22, ...bytes, 33]);
  const view = surrounding.subarray(1, -1);
  assert.equal(crc32Hex(view), "BA3F55AE");
  assert.notEqual(crc32Hex(surrounding), crc32Hex(view));
  assert.equal(crc32Hex(Buffer.from(bytes)), "BA3F55AE");
});

test("helpers reject invalid input types instead of coercing them", () => {
  for (const input of [
    undefined, null, "", "123456789", 123, true, [], [0, 255], {},
    new ArrayBuffer(2), new DataView(new ArrayBuffer(2)),
    new Uint16Array([1, 2]), new Int8Array([0, -1]), new Uint8ClampedArray([0, 255]),
  ]) {
    assert.throws(() => crc32Hex(input), TypeError);
  }
  for (const input of [
    undefined, null, 123, true, [], {}, new String("ABC"), new Uint8Array(),
  ]) {
    assert.throws(() => crc32Utf8(input), TypeError);
  }
});

test("the 10 MiB byte limit is inclusive and overflow fails without shortening input", () => {
  assert.equal(MAX_CRC32_BYTES, 10 * 1024 * 1024);
  assert.equal(crc32Hex(new Uint8Array(MAX_CRC32_BYTES)), "9ECA2ACC");
  assert.equal(crc32Utf8("A".repeat(MAX_CRC32_BYTES)), "CBD38184");

  const oversizedBytes = new Uint8Array(MAX_CRC32_BYTES + 1);
  oversizedBytes[oversizedBytes.length - 1] = 255;
  assert.throws(() => crc32Hex(oversizedBytes), { name: "RangeError", message: /10 MiB/ });
  assert.equal(oversizedBytes.length, MAX_CRC32_BYTES + 1);
  assert.equal(oversizedBytes[oversizedBytes.length - 1], 255);
  assert.throws(() => crc32Utf8("A".repeat(MAX_CRC32_BYTES + 1)), RangeError);
  // Character count alone is not a byte limit.
  assert.throws(() => crc32Utf8("é".repeat(MAX_CRC32_BYTES / 2 + 1)), RangeError);
  assert.throws(() => crc32Utf8("🔐".repeat(MAX_CRC32_BYTES / 4 + 1)), RangeError);
});

test("independent zlib cross-check covers binary patterns, Unicode, and varying byte lengths", () => {
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

  let expected;
  if (typeof zlib.crc32 === "function") {
    expected = fixtures.map((bytes) =>
      (zlib.crc32(bytes) >>> 0).toString(16).toUpperCase().padStart(8, "0"));
  } else {
    const calculation = spawnSync("python3", [
      "-c",
      'import json,sys,zlib; print(json.dumps([format(zlib.crc32(bytes(row)), "08X") for row in json.load(sys.stdin)]))',
    ], {
      input: JSON.stringify(fixtures.map((bytes) => Array.from(bytes))),
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(calculation.error);
    assert.equal(calculation.status, 0, calculation.stderr);
    expected = JSON.parse(calculation.stdout);
  }
  assert.equal(expected.length, fixtures.length);
  assert.deepEqual(fixtures.map(crc32Hex), expected);
});
