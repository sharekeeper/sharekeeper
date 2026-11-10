import { crc64Hex } from "../site/crc64.js";
import { PAD_LENGTH } from "../shared/schema.js";

/**
 * The sheet's own cipher: per letter, C = (P + K) mod 26 and P = (C - K) mod 26,
 * with A = 0 … Z = 25. P is the 80-letter string of 4-letter word prefixes of a
 * 20-word SLIP-39 share; K is that sharekeeper's private pad.
 */
const LETTERS = /^[A-Z]{80}$/;

function check(name, value) {
  if (typeof value !== "string" || value.length !== PAD_LENGTH || !LETTERS.test(value)) {
    throw new TypeError(`${name} must be exactly ${PAD_LENGTH} uppercase A–Z letters.`);
  }
}

function combine(a, b, sign) {
  let out = "";
  for (let index = 0; index < PAD_LENGTH; index += 1) {
    const value = (a.charCodeAt(index) - 65 + sign * (b.charCodeAt(index) - 65) + 26) % 26;
    out += String.fromCharCode(65 + value);
  }
  return out;
}

export function encryptPrefixes(plaintext, pad) {
  check("Plaintext prefixes", plaintext);
  check("Pad", pad);
  return combine(plaintext, pad, 1);
}

export function decryptCiphertext(ciphertext, pad) {
  check("Ciphertext", ciphertext);
  check("Pad", pad);
  return combine(ciphertext, pad, -1);
}

/**
 * Ciphertext checksum profile used on the sheet: CRC-64/XZ over the 80
 * ciphertext letters as ASCII uppercase, no spaces or line breaks, shown as
 * 16 uppercase hex digits. The Tools-page calculator gives the same
 * value when the 80 letters are pasted as text.
 */
export function ciphertextCrc64(ciphertext) {
  check("Ciphertext", ciphertext);
  return crc64Hex(new TextEncoder().encode(ciphertext));
}

/** The first two 4-letter cipher groups, as written in FIRST 2 CIPHER GROUPS. */
export function firstCipherGroups(ciphertext) {
  check("Ciphertext", ciphertext);
  return ciphertext.slice(0, 8);
}
