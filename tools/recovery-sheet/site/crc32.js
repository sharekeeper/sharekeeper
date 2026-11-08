/**
 * CRC-32/ISO-HDLC (IEEE): reflected polynomial 0xEDB88320,
 * initial value 0xFFFFFFFF, final XOR 0xFFFFFFFF.
 * An accidental-corruption checksum, not an authenticity or security check.
 */
export const MAX_CRC32_BYTES = 10 * 1024 * 1024;

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xEDB88320 : 0);
  }
  CRC32_TABLE[index] = value >>> 0;
}

/** Hash exactly the supplied byte view, without changing its contents. */
export function crc32Hex(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("CRC32 input must be a Uint8Array.");
  }
  if (bytes.byteLength > MAX_CRC32_BYTES) {
    throw new RangeError(`CRC32 input must not exceed ${MAX_CRC32_BYTES} bytes (10 MiB).`);
  }

  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/** Encode with TextEncoder UTF-8, with no trimming or other normalization. */
export function crc32Utf8(text) {
  if (typeof text !== "string") {
    throw new TypeError("CRC32 text input must be a string.");
  }
  // UTF-8 cannot use fewer bytes than the input's UTF-16 code-unit count.
  // Reject obvious overflow before allocating the encoded byte array.
  if (text.length > MAX_CRC32_BYTES) {
    throw new RangeError(`CRC32 input must not exceed ${MAX_CRC32_BYTES} bytes (10 MiB).`);
  }
  return crc32Hex(new TextEncoder().encode(text));
}
