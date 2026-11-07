import { GROUP_LENGTH, PAD_LENGTH } from "../shared/schema.js";

const ALPHABET_LENGTH = 26;
const ACCEPT_BELOW = 234; // 26 × 9: discard the biased tail of an 8-bit sample.
const MAX_DRAWS_PER_PAD = 128;
const MAX_CONTRIBUTION_BYTES = 65_536;
const SEED_BYTES = 32;
const HKDF_BATCH_BYTES = 256;
const HKDF_DOMAIN = "sharekeeper/recovery-sheet/pad/v1";

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
 * Generate a fresh, independently sampled 80-letter pad for each of 3–5 keepers.
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
  if (!Number.isInteger(count) || count < 3 || count > 5) {
    throw new RangeError("Keeper count must be an integer from 3 to 5.");
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
 * Mix a bounded movement/timing contribution with fresh Web Crypto randomness.
 *
 * The contribution is copied and SHA-256 hashed once. Each keeper gets a fresh
 * 32-byte random seed, imported as a nonextractable HKDF key. HKDF-SHA-256 uses
 * the contribution hash as salt and versioned keeper/batch context as info.
 * Each 256-byte batch is rejection-sampled into uppercase letters.
 *
 * Gestures are supplemental input, not an estimated number of entropy bits,
 * and never replace the required secure random source. This is computational
 * key derivation, not a claim of information-theoretic one-time-pad security.
 *
 * Mutable private byte buffers are cleared on success or failure. The caller
 * owns and must clear its original contribution if desired. JavaScript strings,
 * CryptoKey internals, and engine copies cannot be reliably erased by this API.
 * Callers must not log, persist, or transmit the resulting pads.
 */
export async function generatePadsWithEntropy(
  count,
  contributionBytes,
  cryptoSource = globalThis.crypto,
) {
  if (!Number.isInteger(count) || count < 3 || count > 5) {
    throw new RangeError("Keeper count must be an integer from 3 to 5.");
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
    typeof cryptoSource.subtle?.digest !== "function" ||
    typeof cryptoSource.subtle?.importKey !== "function" ||
    typeof cryptoSource.subtle?.deriveBits !== "function"
  ) {
    throw new Error(
      "Secure randomness and Web Crypto SubtleCrypto are required for entropy mixing.",
    );
  }

  // Snapshot before the first await so collector changes cannot alter this run.
  const contribution = new Uint8Array(contributionBytes);
  const subtle = cryptoSource.subtle;
  const encoder = new TextEncoder();
  const pads = [];
  let contributionHash;
  try {
    contributionHash = new Uint8Array(
      await subtle.digest("SHA-256", contribution),
    );
    if (contributionHash.byteLength !== 32) {
      throw new Error("Web Crypto returned an invalid SHA-256 digest length.");
    }

    for (let padIndex = 0; padIndex < count; padIndex += 1) {
      const seed = new Uint8Array(SEED_BYTES);
      try {
        cryptoSource.getRandomValues(seed);
        const key = await subtle.importKey("raw", seed, "HKDF", false, [
          "deriveBits",
        ]);
        seed.fill(0);

        let pad = "";
        for (
          let batchIndex = 0;
          pad.length < PAD_LENGTH && batchIndex < MAX_DRAWS_PER_PAD;
          batchIndex += 1
        ) {
          const info = encoder.encode(
            `${HKDF_DOMAIN}|keeper:${padIndex}|batch:${batchIndex}`,
          );
          const bytes = new Uint8Array(
            await subtle.deriveBits(
              {
                name: "HKDF",
                hash: "SHA-256",
                salt: contributionHash,
                info,
              },
              key,
              HKDF_BATCH_BYTES * 8,
            ),
          );
          try {
            if (bytes.byteLength !== HKDF_BATCH_BYTES) {
              throw new Error("Web Crypto returned an invalid HKDF output length.");
            }
            for (const byte of bytes) {
              if (byte < ACCEPT_BELOW) {
                pad += String.fromCharCode(65 + (byte % ALPHABET_LENGTH));
                if (pad.length === PAD_LENGTH) break;
              }
            }
          } finally {
            bytes.fill(0);
          }
        }
        if (pad.length !== PAD_LENGTH) {
          throw new Error(
            "Entropy mixing exceeded its rejection-sampling limit.",
          );
        }
        pads.push(pad);
      } finally {
        seed.fill(0);
      }
    }
    return pads;
  } finally {
    contribution.fill(0);
    contributionHash?.fill(0);
  }
}
