import { GROUP_LENGTH, PAD_LENGTH } from "../shared/schema.js";

const ALPHABET_LENGTH = 26;
const ACCEPT_BELOW = 234; // 26 × 9: discard the biased tail of an 8-bit sample.
const MAX_DRAWS_PER_PAD = 128;
const MAX_CONTRIBUTION_BYTES = 262_144;
/** Fresh browser CSPRNG seed per keeper pad: 1600 bits. */
export const BROWSER_SEED_BITS = 1600;
const SEED_BYTES = BROWSER_SEED_BITS / 8;
const MAX_BLOCKS_PER_PAD = 8;
const USER_DOMAIN = "sharekeeper/recovery-sheet/user-stream/v2";

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
 * Expand the user's movement/timing record into one 200-byte block for a
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
 * Combine a 1600-bit browser CSPRNG seed with a 1600-bit-long block derived from
 * the user's movement/timing record, for every keeper pad.
 *
 * For each pad, 200 fresh bytes from crypto.getRandomValues are XORed byte by
 * byte with a 200-byte user block (see userBlock), and the combined bytes are
 * rejection-sampled directly into A–Z letters (bytes 234–255 are discarded, so
 * no letter is favoured). About 183 of 200 bytes are accepted on average,
 * far more than the 80 letters needed; a further independent 200-byte block is
 * drawn only in the unlikely case that a block runs short.
 *
 * Because the CSPRNG bytes are uniform and independent of the user block, the
 * XOR is uniform whatever the user block contains. If the browser generator
 * were weak, the user block would help only to the extent the user's input is
 * genuinely unknown and unpredictable; its 200-byte length is not an entropy
 * claim. There is no intermediate short key or 256-bit hash. Browser
 * randomness is cryptographic pseudorandomness, not a physical true-random
 * guarantee, and this is not a claim of information-theoretic security.
 *
 * Mutable private byte buffers are cleared on success or failure. The caller
 * owns and must clear its original contribution if desired. JavaScript strings
 * and engine copies cannot be reliably erased by this API. Callers must not
 * log, persist, or transmit the resulting pads.
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
      let pad = "";
      for (let blockIndex = 0; pad.length < PAD_LENGTH && blockIndex < MAX_BLOCKS_PER_PAD; blockIndex += 1) {
        const seed = new Uint8Array(SEED_BYTES);
        let user;
        try {
          cryptoSource.getRandomValues(seed);
          user = await userBlock(subtle, contribution, padIndex, blockIndex);
          for (let index = 0; index < SEED_BYTES && pad.length < PAD_LENGTH; index += 1) {
            const byte = seed[index] ^ user[index];
            if (byte < ACCEPT_BELOW) pad += String.fromCharCode(65 + (byte % ALPHABET_LENGTH));
          }
        } finally {
          seed.fill(0);
          user?.fill(0);
        }
      }
      if (pad.length !== PAD_LENGTH) {
        throw new Error("Entropy mixing exceeded its rejection-sampling limit.");
      }
      pads.push(pad);
    }
    return pads;
  } finally {
    contribution.fill(0);
  }
}
