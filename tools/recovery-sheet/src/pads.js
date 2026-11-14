import { GROUP_LENGTH, PAD_LENGTH } from "../shared/schema.js";

const ALPHABET_LENGTH = 26;
const ACCEPT_BELOW = 234; // 26 × 9: discard the biased tail of an 8-bit sample.
const MAX_DRAWS_PER_PAD = 128;
const MAX_CONTRIBUTION_BYTES = 262_144;
/**
 * Randomness per pad. An 80-letter A–Z pad has 26^80 ≈ 2^376.04 values, so
 * it carries 376 bits (80 × log2 26, rounded down). A uniform pad needs a draw
 * of at least 377 bits; the tool draws 384 bits (48 bytes, the next whole
 * byte) and redraws in the rare case (about 0.33 %) that the value falls in the
 * biased tail, so every pad is exactly uniform.
 */
export const PAD_ENTROPY_BITS = 376;
export const BROWSER_SEED_BITS = 384;
const SEED_BYTES = BROWSER_SEED_BITS / 8;
const MAX_BLOCKS_PER_PAD = 8;
const USER_DOMAIN = "sharekeeper/recovery-sheet/user-stream/v3";
const PAD_SPACE = 26n ** BigInt(PAD_LENGTH);
// Largest multiple of 26^80 not above 2^384: values at or above it are
// rejected, so value mod 26^80 is uniform.
const ACCEPT_LIMIT = ((1n << BigInt(BROWSER_SEED_BITS)) / PAD_SPACE) * PAD_SPACE;

/**
 * Check the unformatted representation used in browser memory.
 */
export function isValidPad(pad) {
  return (
    typeof pad === "string" &&
    pad.length === PAD_LENGTH &&
    /^[A-Z]+$/.test(pad)
  );
}

/**
 * Format one pad for reading and transcription, without changing its letters.
 */
export function groupPad(pad) {
  if (!isValidPad(pad)) {
    throw new TypeError(
      `Pad must contain exactly ${PAD_LENGTH} uppercase A–Z letters.`,
    );
  }

  const groups = [];
  for (let offset = 0; offset < pad.length; offset += GROUP_LENGTH) {
    groups.push(pad.slice(offset, offset + GROUP_LENGTH));
  }
  return groups.join(" ");
}

/**
 * Generate a fresh, independently sampled 80-letter pad for each of 2–5 keepers.
 *
 * This random-only primitive is retained for tests and standalone callers.
 * The recovery-sheet UI uses generatePadsWithEntropy instead. Production
 * callers must use the default Web Crypto source; injection is for tests.
 * No insecure random-number fallback is used.
 *
 * The temporary random-byte buffer is cleared on success and failure. This is
 * best effort only: JavaScript strings are immutable, and copies, engine
 * internals, and garbage collection prevent guaranteed erasure from memory.
 * Callers must not log, persist, or transmit these pads.
 */
export function generatePads(count, cryptoSource = globalThis.crypto) {
  if (!Number.isInteger(count) || count < 2 || count > 5) {
    throw new RangeError("Keeper count must be an integer from 2 to 5.");
  }
  if (
    cryptoSource == null ||
    typeof cryptoSource.getRandomValues !== "function"
  ) {
    throw new Error(
      "Secure randomness is unavailable. Web Crypto getRandomValues is required.",
    );
  }

  const pads = [];
  const bytes = new Uint8Array(PAD_LENGTH);
  try {
    for (let padIndex = 0; padIndex < count; padIndex += 1) {
      let pad = "";
      let draws = 0;
      while (pad.length < PAD_LENGTH) {
        if (draws >= MAX_DRAWS_PER_PAD) {
          throw new Error(
            "Secure random generation exceeded its rejection-sampling limit.",
          );
        }
        draws += 1;
        cryptoSource.getRandomValues(bytes);
        for (const byte of bytes) {
          if (byte < ACCEPT_BELOW) {
            pad += String.fromCharCode(65 + (byte % ALPHABET_LENGTH));
            if (pad.length === PAD_LENGTH) break;
          }
        }
      }
      pads.push(pad);
    }
    return pads;
  } finally {
    bytes.fill(0);
  }
}

/**
 * Expand the user's movement/timing record into one 48-byte block for a
 * keeper pad: SHA-512 in counter mode over the whole record, with keeper,
 * block and chunk numbers as domain separation. The record is never first
 * compressed to a short hash. Block length is not a measure of its entropy.
 */
async function userBlock(subtle, contribution, padIndex, blockIndex) {
  const block = new Uint8Array(SEED_BYTES);
  const encoder = new TextEncoder();
  for (let chunk = 0, offset = 0; offset < SEED_BYTES; chunk += 1, offset += 64) {
    const prefix = encoder.encode(`${USER_DOMAIN}|keeper:${padIndex}|block:${blockIndex}|chunk:${chunk}|`);
    const input = new Uint8Array(prefix.byteLength + contribution.byteLength);
    let digest;
    try {
      input.set(prefix, 0);
      input.set(contribution, prefix.byteLength);
      digest = new Uint8Array(await subtle.digest("SHA-512", input));
      if (digest.byteLength !== 64) throw new Error("Web Crypto returned an invalid SHA-512 digest length.");
      block.set(digest.subarray(0, Math.min(64, SEED_BYTES - offset)), offset);
    } catch (error) {
      block.fill(0);
      throw error;
    } finally {
      input.fill(0);
      digest?.fill(0);
    }
  }
  return block;
}

/**
 * Map a 48-byte block to an 80-letter pad, or null if it falls in the
 * rejected tail. The block is read as a big-endian 384-bit integer N; if
 * N < ACCEPT_LIMIT, the pad is N mod 26^80 written as 80 base-26 digits
 * (A = 0), most significant first. BigInt values cannot be wiped.
 */
export function padFromBlock(block) {
  if (!(block instanceof Uint8Array) || block.length !== SEED_BYTES) throw new TypeError(`A ${SEED_BYTES}-byte block is required.`);
  let value = 0n;
  for (const byte of block) value = (value << 8n) | BigInt(byte);
  if (value >= ACCEPT_LIMIT) return null;
  value %= PAD_SPACE;
  const letters = new Array(PAD_LENGTH);
  for (let index = PAD_LENGTH - 1; index >= 0; index -= 1) {
    letters[index] = String.fromCharCode(65 + Number(value % 26n));
    value /= 26n;
  }
  return letters.join("");
}

/**
 * Combine a 384-bit browser CSPRNG draw with a 384-bit block derived from the
 * user's movement/timing record, for every keeper pad.
 *
 * For each pad, 48 fresh bytes from crypto.getRandomValues are XORed byte by
 * byte with a 48-byte user block (see userBlock), and the result is mapped to
 * 80 letters by padFromBlock. In about 0.33 % of cases the value falls in the
 * rejected tail and a further independent draw (with a new user block) is
 * made, so every one of the 26^80 pads is equally likely.
 *
 * Because the CSPRNG bytes are uniform and independent of the user block, the
 * XOR is uniform whatever the user block contains. If the browser generator
 * were weak, the user block would help only to the extent the user's input is
 * genuinely unknown and unpredictable; its length is not an entropy claim.
 * Browser randomness is cryptographic pseudorandomness, not a physical
 * true-random guarantee, and this is not a claim of information-theoretic
 * security.
 *
 * Mutable private byte buffers are cleared on success or failure. The caller
 * owns and must clear its original contribution if desired. JavaScript strings,
 * BigInt values and engine copies cannot be reliably erased by this API.
 * Callers must not log, persist, or transmit the resulting pads.
 */
export async function generatePadsWithEntropy(
  count,
  contributionBytes,
  cryptoSource = globalThis.crypto,
) {
  if (!Number.isInteger(count) || count < 2 || count > 5) {
    throw new RangeError("Keeper count must be an integer from 2 to 5.");
  }
  if (
    !(contributionBytes instanceof Uint8Array) ||
    contributionBytes.byteLength === 0 ||
    contributionBytes.byteLength > MAX_CONTRIBUTION_BYTES
  ) {
    throw new TypeError(
      `Entropy contribution must be a nonempty Uint8Array of at most ${MAX_CONTRIBUTION_BYTES} bytes.`,
    );
  }
  if (
    cryptoSource == null ||
    typeof cryptoSource.getRandomValues !== "function" ||
    typeof cryptoSource.subtle?.digest !== "function"
  ) {
    throw new Error(
      "Secure randomness and Web Crypto SubtleCrypto are required for entropy mixing.",
    );
  }

  // Snapshot before the first await so collector changes cannot alter this run.
  const contribution = new Uint8Array(contributionBytes);
  const subtle = cryptoSource.subtle;
  const pads = [];
  try {
    for (let padIndex = 0; padIndex < count; padIndex += 1) {
      let pad = null;
      for (let blockIndex = 0; pad === null && blockIndex < MAX_BLOCKS_PER_PAD; blockIndex += 1) {
        const seed = new Uint8Array(SEED_BYTES);
        let user;
        try {
          cryptoSource.getRandomValues(seed);
          user = await userBlock(subtle, contribution, padIndex, blockIndex);
          for (let index = 0; index < SEED_BYTES; index += 1) seed[index] ^= user[index];
          pad = padFromBlock(seed);
        } finally {
          seed.fill(0);
          user?.fill(0);
        }
      }
      if (pad === null || pad.length !== PAD_LENGTH) {
        throw new Error("Entropy mixing exceeded its rejection-sampling limit.");
      }
      pads.push(pad);
    }
    return pads;
  } finally {
    contribution.fill(0);
  }
}
