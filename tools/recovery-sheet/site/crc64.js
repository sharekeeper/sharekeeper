/**
 * CRC-64/XZ (alias CRC-64/GO-ECMA): ECMA-182 polynomial 0x42F0E1EBA9EA3693,
 * processed reflected (0xC96C5795D7870F42), initial value and final XOR
 * 0xFFFFFFFFFFFFFFFF. Check value for "123456789" is 995DC9BBDF1939FA.
 * An accidental-corruption checksum, not an authenticity or security check.
 *
 * The 64-bit register is held as two unsigned 32-bit halves so the hot loop
 * uses plain integer arithmetic (no BigInt).
 */
export const MAX_CRC64_BYTES = 10 * 1024 * 1024;
export const CRC64_NAME = "CRC-64/XZ";

const POLY_HI = 0xC96C5795;
const POLY_LO = 0xD7870F42;
const TABLE_HI = new Uint32Array(256);
const TABLE_LO = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let hi = 0;
  let lo = index;
  for (let bit = 0; bit < 8; bit += 1) {
    const carry = lo & 1;
    lo = ((lo >>> 1) | ((hi & 1) << 31)) >>> 0;
    hi >>>= 1;
    if (carry) {
      hi = (hi ^ POLY_HI) >>> 0;
      lo = (lo ^ POLY_LO) >>> 0;
    }
  }
  TABLE_HI[index] = hi;
  TABLE_LO[index] = lo;
}

const hex32 = (value) => (value >>> 0).toString(16).toUpperCase().padStart(8, "0");

/** Hash exactly the supplied byte view, without changing its contents. */
export function crc64Hex(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("CRC64 input must be a Uint8Array.");
  }
  if (bytes.byteLength > MAX_CRC64_BYTES) {
    throw new RangeError(`CRC64 input must not exceed ${MAX_CRC64_BYTES} bytes (10 MiB).`);
  }
  let hi = 0xFFFFFFFF;
  let lo = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    const slot = (lo ^ bytes[index]) & 0xFF;
    lo = (((lo >>> 8) | (hi << 24)) ^ TABLE_LO[slot]) >>> 0;
    hi = ((hi >>> 8) ^ TABLE_HI[slot]) >>> 0;
  }
  return hex32(hi ^ 0xFFFFFFFF) + hex32(lo ^ 0xFFFFFFFF);
}

/** Encode with TextEncoder UTF-8, with no trimming or other normalization. */
export function crc64Utf8(text) {
  if (typeof text !== "string") {
    throw new TypeError("CRC64 text input must be a string.");
  }
  // UTF-8 cannot use fewer bytes than the input's UTF-16 code-unit count.
  // Reject obvious overflow before allocating the encoded byte array.
  if (text.length > MAX_CRC64_BYTES) {
    throw new RangeError(`CRC64 input must not exceed ${MAX_CRC64_BYTES} bytes (10 MiB).`);
  }
  return crc64Hex(new TextEncoder().encode(text));
}
