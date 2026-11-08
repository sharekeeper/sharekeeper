/**
 * SLIP-0039: Shamir's Secret-Sharing for Mnemonic Codes.
 *
 * Spec:      https://github.com/satoshilabs/slips/blob/master/slip-0039.md
 * Reference: https://github.com/trezor/python-shamir-mnemonic (v0.3.0)
 *
 * Pure ES module with no dependencies. All cryptography goes through an
 * injected Web Crypto object (`crypto`, with `getRandomValues` and `subtle`):
 * `globalThis.crypto` in browsers and in Node >= 20.
 *
 * Scope: share creation is single-level only: T-of-N with 2 <= T <= N <= 16
 * as one group (group threshold 1, group count 1), for 128- or 256-bit master
 * secrets. Combining is a full SLIP-39 decoder and accepts any valid share
 * set, including multi-group sets and 1-of-1 shares.
 *
 * Randomness is drawn in exactly the same order and sizes as the reference
 * implementation (2 bytes for the identifier, then T-2 random share values of
 * n bytes each, then n-4 bytes for the digest's random part), so with the same
 * byte stream both produce identical mnemonics; tests/slip39.test.js checks
 * this against vendored output of the Python implementation.
 *
 * Hygiene: intermediate Uint8Arrays holding secret material are overwritten
 * with zeros once they are no longer needed. JavaScript cannot guarantee this
 * (strings, CryptoKey objects, engine copies and GC are out of reach), so it
 * is best effort only. Nothing here logs, and error messages never include
 * mnemonic words or secret bytes: they name positions and parameters only.
 *
 * Multiplication of secret bytes in GF(256) uses a branch-free shift-and-add
 * routine rather than log/exp lookups indexed by secret values. The log/exp
 * tables (generator x + 1, Rijndael polynomial, built exactly as in the
 * reference) are used only for the Lagrange basis coefficients, which depend
 * on the public share indices. Results are identical; the tests check the
 * two multiplication methods against each other for all 65,536 pairs.
 */
import { WORDLIST } from "./slip39-wordlist.js";

export const RADIX_BITS = 10;
export const RADIX = 1 << RADIX_BITS;
export const ID_LENGTH_BITS = 15;
export const EXTENDABLE_FLAG_LENGTH_BITS = 1;
export const ITERATION_EXP_LENGTH_BITS = 4;
export const ID_EXP_LENGTH_WORDS = 2;
export const CHECKSUM_LENGTH_WORDS = 3;
export const METADATA_LENGTH_WORDS = ID_EXP_LENGTH_WORDS + 2 + CHECKSUM_LENGTH_WORDS; // 7
export const MIN_STRENGTH_BITS = 128;
export const MIN_MNEMONIC_LENGTH_WORDS = METADATA_LENGTH_WORDS + Math.ceil(MIN_STRENGTH_BITS / RADIX_BITS); // 20
export const MAX_SHARE_COUNT = 16;
export const DIGEST_LENGTH_BYTES = 4;
export const BASE_ITERATION_COUNT = 10000;
export const ROUND_COUNT = 4;
export const SECRET_INDEX = 255;
export const DIGEST_INDEX = 254;
export const CUSTOMIZATION_STRING_ORIG = "shamir";
export const CUSTOMIZATION_STRING_EXTENDABLE = "shamir_extendable";
export const PREFIX_LENGTH = 4;

/** Defaults for new shares: ext = 1 (as the spec requires for new shares), e = 1 (2 x 10000 PBKDF2 iterations). */
export const DEFAULT_EXTENDABLE = true;
export const DEFAULT_ITERATION_EXPONENT = 1;

export class Slip39Error extends Error {
  constructor(message) {
    super(message);
    this.name = "Slip39Error";
  }
}

const fail = (message) => {
  throw new Slip39Error(message);
};

/* ------------------------------------------------------------------ */
/* Wordlist                                                            */
/* ------------------------------------------------------------------ */

const WORD_INDEX = new Map(WORDLIST.map((word, index) => [word, index]));
const PREFIX_INDEX = new Map(WORDLIST.map((word, index) => [word.slice(0, PREFIX_LENGTH), index]));
if (WORDLIST.length !== RADIX || WORD_INDEX.size !== RADIX || PREFIX_INDEX.size !== RADIX) {
  throw new Error("SLIP-39 wordlist is corrupt");
}

/**
 * Resolves one typed token to a word index. Accepts a full wordlist word or
 * any leading fragment of a word that is at least 4 letters long (4 letters
 * identify a word uniquely). Case-insensitive. Returns -1 if unknown.
 */
function tokenToIndex(token) {
  const lower = token.toLowerCase();
  const exact = WORD_INDEX.get(lower);
  if (exact !== undefined) return exact;
  if (lower.length >= PREFIX_LENGTH) {
    const candidate = PREFIX_INDEX.get(lower.slice(0, PREFIX_LENGTH));
    if (candidate !== undefined && WORDLIST[candidate].startsWith(lower)) return candidate;
  }
  return -1;
}

function mnemonicToIndices(mnemonic) {
  if (typeof mnemonic !== "string") fail("Mnemonic must be a string");
  const trimmed = mnemonic.trim();
  if (trimmed === "") fail("Mnemonic is empty");
  const tokens = trimmed.split(/\s+/);
  const indices = new Array(tokens.length).fill(0);
  try {
    for (let i = 0; i < tokens.length; i += 1) {
      const index = tokenToIndex(tokens[i]);
      if (index < 0) fail(`Word ${i + 1} is not in the SLIP-39 wordlist`);
      indices[i] = index;
    }
    return indices;
  } catch (error) {
    indices.fill(0);
    throw error;
  }
}

/**
 * Splits a mnemonic on whitespace and returns the canonical lowercase words.
 * Each token may be a full word or a leading fragment of at least 4 letters.
 * Does not verify the checksum; use decodeMnemonic for that.
 */
export function mnemonicToWords(mnemonic) {
  const indices = mnemonicToIndices(mnemonic);
  const words = indices.map((index) => WORDLIST[index]);
  indices.fill(0);
  return words;
}

/**
 * The first 4 letters of every word, uppercased and concatenated. Every
 * SLIP-39 word has at least 4 letters and a unique 4-letter prefix, so this
 * is lossless. A 20-word share (128-bit secret) gives 80 letters; a 33-word
 * share gives 132. The mnemonic is fully validated (checksum, padding) first.
 */
export function wordPrefixes(mnemonic) {
  const share = decodeMnemonic(mnemonic);
  share.value.fill(0);
  return mnemonicToWords(mnemonic)
    .map((word) => word.slice(0, PREFIX_LENGTH).toUpperCase())
    .join("");
}

/**
 * Inverse of wordPrefixes: turns a string of 4-letter prefixes (whitespace and
 * hyphens ignored, any case) back into a space-separated mnemonic. Does not
 * verify the checksum; pass the result to decodeMnemonic/combineMnemonics.
 */
export function mnemonicFromPrefixes(prefixes) {
  if (typeof prefixes !== "string") fail("Prefixes must be a string");
  const letters = prefixes.replace(/[\s-]+/g, "").toLowerCase();
  if (!/^[a-z]*$/.test(letters)) fail("Prefixes may contain only letters A-Z");
  if (letters.length === 0 || letters.length % PREFIX_LENGTH !== 0) {
    fail(`Prefix string must be a non-empty multiple of ${PREFIX_LENGTH} letters (got ${letters.length})`);
  }
  const words = [];
  for (let i = 0; i < letters.length; i += PREFIX_LENGTH) {
    const index = PREFIX_INDEX.get(letters.slice(i, i + PREFIX_LENGTH));
    if (index === undefined) fail(`Prefix ${i / PREFIX_LENGTH + 1} does not match any SLIP-39 word`);
    words.push(WORDLIST[index]);
  }
  return words.join(" ");
}

/* ------------------------------------------------------------------ */
/* RS1024 checksum                                                     */
/* ------------------------------------------------------------------ */

const RS1024_GEN = [
  0xe0e040, 0x1c1c080, 0x3838100, 0x7070200, 0xe0e0009, 0x1c0c2412, 0x38086c24, 0x3090fc48, 0x21b1f890, 0x3f3f120,
];

function rs1024Polymod(values) {
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 20;
    chk = ((chk & 0xfffff) << 10) ^ v;
    for (let i = 0; i < 10; i += 1) chk ^= RS1024_GEN[i] & -((b >>> i) & 1);
  }
  return chk;
}

const asciiCodes = (s) => Array.from(s, (c) => c.charCodeAt(0));
const customizationString = (extendable) =>
  asciiCodes(extendable ? CUSTOMIZATION_STRING_EXTENDABLE : CUSTOMIZATION_STRING_ORIG);

function rs1024CreateChecksum(data, extendable) {
  const values = [...customizationString(extendable), ...data, 0, 0, 0];
  const polymod = rs1024Polymod(values) ^ 1;
  values.fill(0);
  return [(polymod >>> 20) & 1023, (polymod >>> 10) & 1023, polymod & 1023];
}

function rs1024VerifyChecksum(data, extendable) {
  const values = [...customizationString(extendable), ...data];
  const ok = rs1024Polymod(values) === 1;
  values.fill(0);
  return ok;
}

/* ------------------------------------------------------------------ */
/* Bit packing (big-endian), no BigInt so buffers can be cleared       */
/* ------------------------------------------------------------------ */

/** Left-pads 8n bits with zeros to wordCount * 10 bits and splits into 10-bit values. */
function bytesToWordIndices(bytes, wordCount) {
  const padding = wordCount * RADIX_BITS - bytes.length * 8;
  if (padding < 0 || padding >= RADIX_BITS) throw new Error("internal: bad word count");
  const out = [];
  let acc = 0;
  let accBits = padding;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    accBits += 8;
    while (accBits >= RADIX_BITS) {
      accBits -= RADIX_BITS;
      out.push((acc >>> accBits) & (RADIX - 1));
      acc &= (1 << accBits) - 1;
    }
  }
  acc = 0;
  return out;
}

/** Concatenates 10-bit values, drops `paddingBits` leading bits (which must be 0) and returns the bytes. */
function wordIndicesToBytes(indices, paddingBits) {
  const totalBits = indices.length * RADIX_BITS;
  const out = new Uint8Array((totalBits - paddingBits) / 8);
  let acc = 0;
  let accBits = 0;
  let skip = paddingBits;
  let paddingOr = 0;
  let pos = 0;
  for (const index of indices) {
    acc = (acc << RADIX_BITS) | index;
    accBits += RADIX_BITS;
    if (skip > 0) {
      const take = Math.min(skip, accBits);
      paddingOr |= acc >>> (accBits - take);
      accBits -= take;
      acc &= (1 << accBits) - 1;
      skip -= take;
    }
    while (accBits >= 8) {
      accBits -= 8;
      out[pos] = (acc >>> accBits) & 0xff;
      pos += 1;
      acc &= (1 << accBits) - 1;
    }
  }
  acc = 0;
  if (paddingOr !== 0) {
    out.fill(0);
    return null;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Share encoding                                                      */
/* ------------------------------------------------------------------ */

/**
 * Parses and validates one share mnemonic (word validity, length, padding
 * length and bits, RS1024 checksum, group threshold <= group count).
 * Thresholds and counts are returned as actual values (not minus one).
 * `value` is a fresh Uint8Array holding the share value; callers should
 * fill(0) it when done.
 */
export function decodeMnemonic(mnemonic) {
  const data = mnemonicToIndices(mnemonic);
  try {
    if (data.length < MIN_MNEMONIC_LENGTH_WORDS) {
      fail(`Invalid mnemonic length: a share must have at least ${MIN_MNEMONIC_LENGTH_WORDS} words (got ${data.length})`);
    }
    const paddingBits = (RADIX_BITS * (data.length - METADATA_LENGTH_WORDS)) % 16;
    if (paddingBits > 8) fail(`Invalid mnemonic length: ${data.length} words is not a valid share length`);

    const idExp = (data[0] << RADIX_BITS) | data[1];
    const identifier = idExp >>> (EXTENDABLE_FLAG_LENGTH_BITS + ITERATION_EXP_LENGTH_BITS);
    const extendable = ((idExp >>> ITERATION_EXP_LENGTH_BITS) & 1) === 1;
    const iterationExponent = idExp & ((1 << ITERATION_EXP_LENGTH_BITS) - 1);

    if (!rs1024VerifyChecksum(data, extendable)) {
      fail("Invalid mnemonic checksum: at least one word is wrong or the words are out of order");
    }

    const params = (data[2] << RADIX_BITS) | data[3];
    const groupIndex = (params >>> 16) & 15;
    const groupThreshold = ((params >>> 12) & 15) + 1;
    const groupCount = ((params >>> 8) & 15) + 1;
    const memberIndex = (params >>> 4) & 15;
    const memberThreshold = (params & 15) + 1;
    if (groupThreshold > groupCount) fail("Invalid mnemonic: group threshold cannot be greater than group count");

    const valueWords = data.slice(ID_EXP_LENGTH_WORDS + 2, data.length - CHECKSUM_LENGTH_WORDS);
    let value;
    try {
      value = wordIndicesToBytes(valueWords, paddingBits);
    } finally {
      valueWords.fill(0);
    }
    if (value === null) fail("Invalid mnemonic padding: the padding bits of the share value are not zero");

    return {
      identifier,
      extendable,
      iterationExponent,
      groupIndex,
      groupThreshold,
      groupCount,
      memberIndex,
      memberThreshold,
      value,
      wordCount: data.length,
    };
  } finally {
    data.fill(0);
  }
}

function encodeShare(share) {
  const idExp =
    (share.identifier << (EXTENDABLE_FLAG_LENGTH_BITS + ITERATION_EXP_LENGTH_BITS)) |
    ((share.extendable ? 1 : 0) << ITERATION_EXP_LENGTH_BITS) |
    share.iterationExponent;
  const params =
    (share.groupIndex << 16) |
    ((share.groupThreshold - 1) << 12) |
    ((share.groupCount - 1) << 8) |
    (share.memberIndex << 4) |
    (share.memberThreshold - 1);
  const valueWordCount = Math.ceil((share.value.length * 8) / RADIX_BITS);
  const valueWords = bytesToWordIndices(share.value, valueWordCount);
  let data = [];
  let all = [];
  try {
    data = [(idExp >>> 10) & 1023, idExp & 1023, (params >>> 10) & 1023, params & 1023, ...valueWords];
    const checksum = rs1024CreateChecksum(data, share.extendable);
    all = [...data, ...checksum];
    return all.map((index) => WORDLIST[index]).join(" ");
  } finally {
    valueWords.fill(0);
    data.fill(0);
    all.fill(0);
  }
}

/* ------------------------------------------------------------------ */
/* GF(256) and Shamir                                                  */
/* ------------------------------------------------------------------ */

// Exactly as the reference: powers of the generator x + 1 modulo x^8 + x^4 + x^3 + x + 1.
const EXP_TABLE = new Uint8Array(255);
const LOG_TABLE = new Uint8Array(256);
{
  let poly = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP_TABLE[i] = poly;
    LOG_TABLE[poly] = i;
    poly = (poly << 1) ^ poly;
    if (poly & 0x100) poly ^= 0x11b;
  }
}

/** Branch-free GF(256) multiplication (Rijndael polynomial), used for secret-dependent bytes. */
function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i += 1) {
    p ^= a & -(b & 1);
    a = ((a << 1) ^ (0x1b & -((a >>> 7) & 1))) & 0xff;
    b >>>= 1;
  }
  return p;
}

const mod255 = (v) => ((v % 255) + 255) % 255;

/**
 * Lagrange interpolation over GF(256), byte-wise: returns f(x) given points
 * [{ x, data }]. Indices must be distinct and all values the same length.
 */
function interpolate(shares, x) {
  const xs = new Set(shares.map((share) => share.x));
  if (xs.size !== shares.length) fail("Invalid set of shares: share indices must be unique");
  const lengths = new Set(shares.map((share) => share.data.length));
  if (lengths.size !== 1) fail("Invalid set of shares: all share values must have the same length");
  const known = shares.find((share) => share.x === x);
  if (known) return known.data.slice();

  const result = new Uint8Array(shares[0].data.length);
  let logProd = 0;
  for (const share of shares) logProd += LOG_TABLE[share.x ^ x];
  for (const share of shares) {
    let logBasis = logProd - LOG_TABLE[share.x ^ x];
    for (const other of shares) if (other !== share) logBasis -= LOG_TABLE[share.x ^ other.x];
    const coefficient = EXP_TABLE[mod255(logBasis)];
    const data = share.data;
    for (let k = 0; k < result.length; k += 1) result[k] ^= gfMul(data[k], coefficient);
  }
  return result;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(subtle, keyBytes, message) {
  const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", key, message));
}

async function createDigest(subtle, randomPart, sharedSecret) {
  const mac = await hmacSha256(subtle, randomPart, sharedSecret);
  try {
    return mac.slice(0, DIGEST_LENGTH_BYTES);
  } finally {
    mac.fill(0);
  }
}

function randomBytes(crypto, length) {
  const bytes = new Uint8Array(length);
  try {
    crypto.getRandomValues(bytes);
  } catch (error) {
    bytes.fill(0); // the RNG may have partially filled the buffer before failing
    throw error;
  }
  // Cheap guard against a stubbed or broken RNG (all bytes equal in a buffer of
  // >= 12 bytes has probability < 2^-88 for a working RNG). Consumes no extra randomness.
  if (length >= 12 && bytes.every((byte) => byte === bytes[0])) {
    bytes.fill(0);
    fail("Random number generator failure");
  }
  return bytes;
}

/** SplitSecret(T, N, S) from the spec. Returns [{ x, data }] for x = 0..N-1. */
async function splitSecret(crypto, threshold, shareCount, secret) {
  if (!(threshold >= 1 && threshold <= shareCount && shareCount <= MAX_SHARE_COUNT)) {
    fail("Invalid threshold or share count");
  }
  if (secret.length * 8 < MIN_STRENGTH_BITS || secret.length % 2 !== 0) fail("Invalid secret length");
  if (threshold === 1) {
    return Array.from({ length: shareCount }, (_, x) => ({ x, data: secret.slice() }));
  }
  const n = secret.length;
  const shares = [];
  let randomPart;
  let digest;
  let digestShare;
  try {
    for (let x = 0; x < threshold - 2; x += 1) shares.push({ x, data: randomBytes(crypto, n) });
    randomPart = randomBytes(crypto, n - DIGEST_LENGTH_BYTES);
    digest = await createDigest(crypto.subtle, randomPart, secret);
    digestShare = new Uint8Array(n);
    digestShare.set(digest, 0);
    digestShare.set(randomPart, DIGEST_LENGTH_BYTES);
    const base = [...shares, { x: DIGEST_INDEX, data: digestShare }, { x: SECRET_INDEX, data: secret }];
    for (let x = threshold - 2; x < shareCount; x += 1) shares.push({ x, data: interpolate(base, x) });
    return shares;
  } catch (error) {
    for (const share of shares) share.data.fill(0);
    throw error;
  } finally {
    randomPart?.fill(0);
    digest?.fill(0);
    digestShare?.fill(0);
  }
}

/** RecoverSecret(T, shares) from the spec, including the digest check. */
async function recoverSecret(subtle, threshold, shares) {
  if (threshold === 1) return shares[0].data.slice();
  let secret;
  let digestShare;
  let randomPart;
  let digest;
  try {
    secret = interpolate(shares, SECRET_INDEX);
    digestShare = interpolate(shares, DIGEST_INDEX);
    randomPart = digestShare.slice(DIGEST_LENGTH_BYTES);
    digest = await createDigest(subtle, randomPart, secret);
    if (!constantTimeEqual(digest, digestShare.subarray(0, DIGEST_LENGTH_BYTES))) {
      fail("Invalid digest of the shared secret: the shares do not belong together or one has been altered");
    }
    const result = secret;
    secret = undefined; // hand ownership to the caller; not wiped below
    return result;
  } finally {
    secret?.fill(0);
    digestShare?.fill(0);
    randomPart?.fill(0);
    digest?.fill(0);
  }
}

/* ------------------------------------------------------------------ */
/* Feistel encryption of the master secret                             */
/* ------------------------------------------------------------------ */

function passphraseBytes(passphrase) {
  if (typeof passphrase !== "string") fail("Passphrase must be a string");
  const bytes = new Uint8Array(passphrase.length);
  for (let i = 0; i < passphrase.length; i += 1) {
    const code = passphrase.charCodeAt(i);
    if (code < 32 || code > 126) {
      bytes.fill(0);
      fail("Passphrase must contain only printable ASCII characters (code points 32-126)");
    }
    bytes[i] = code;
  }
  return bytes;
}

function saltPrefix(identifier, extendable) {
  if (extendable) return new Uint8Array(0);
  const prefix = new Uint8Array(CUSTOMIZATION_STRING_ORIG.length + 2);
  prefix.set(asciiCodes(CUSTOMIZATION_STRING_ORIG), 0);
  prefix[prefix.length - 2] = (identifier >>> 8) & 0xff;
  prefix[prefix.length - 1] = identifier & 0xff;
  return prefix;
}

/** F(i, R) = PBKDF2-HMAC-SHA256(password = i || P, salt = salt_prefix || R, (10000 << e) / 4 iterations, |R| bytes). */
async function roundFunction(subtle, i, passphrase, iterationExponent, prefix, r) {
  const password = new Uint8Array(1 + passphrase.length);
  password[0] = i;
  password.set(passphrase, 1);
  const salt = new Uint8Array(prefix.length + r.length);
  salt.set(prefix, 0);
  salt.set(r, prefix.length);
  try {
    const key = await subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
    const iterations = (BASE_ITERATION_COUNT << iterationExponent) / ROUND_COUNT;
    const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, r.length * 8);
    return new Uint8Array(bits);
  } finally {
    password.fill(0);
    salt.fill(0);
  }
}

async function feistel(subtle, input, passphrase, iterationExponent, identifier, extendable, rounds) {
  if (input.length % 2 !== 0) fail("The length of the master secret in bytes must be an even number");
  const half = input.length / 2;
  const prefix = saltPrefix(identifier, extendable);
  let l = input.slice(0, half);
  let r = input.slice(half);
  try {
    for (const i of rounds) {
      const f = await roundFunction(subtle, i, passphrase, iterationExponent, prefix, r);
      try {
        const next = new Uint8Array(half);
        for (let k = 0; k < half; k += 1) next[k] = l[k] ^ f[k];
        l.fill(0);
        l = r;
        r = next;
      } finally {
        f.fill(0);
      }
    }
    const out = new Uint8Array(input.length);
    out.set(r, 0);
    out.set(l, half);
    return out;
  } finally {
    l.fill(0);
    r.fill(0);
    prefix.fill(0);
  }
}

const ENCRYPT_ROUNDS = [0, 1, 2, 3];
const DECRYPT_ROUNDS = [3, 2, 1, 0];

function encryptMasterSecret(subtle, masterSecret, passphrase, iterationExponent, identifier, extendable) {
  return feistel(subtle, masterSecret, passphrase, iterationExponent, identifier, extendable, ENCRYPT_ROUNDS);
}

function decryptMasterSecret(subtle, ems, passphrase, iterationExponent, identifier, extendable) {
  return feistel(subtle, ems, passphrase, iterationExponent, identifier, extendable, DECRYPT_ROUNDS);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const isUint8Array = (v) => v instanceof Uint8Array || Object.prototype.toString.call(v) === "[object Uint8Array]";
const isIntInRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function requireSubtle(crypto) {
  const subtle = crypto?.subtle;
  if (!subtle || typeof subtle.importKey !== "function" || typeof subtle.deriveBits !== "function" || typeof subtle.sign !== "function") {
    fail("A Web Crypto object with crypto.subtle is required");
  }
  return subtle;
}

/**
 * Splits a 16- or 32-byte master secret into `shareCount` SLIP-39 mnemonics,
 * any `threshold` of which recover it. Single-level scheme only: one group
 * (GT = 1, G = 1), member threshold T with 2 <= T <= N, member indices
 * 0 .. N-1. Threshold 1 is rejected. Returns the mnemonics in member-index order.
 *
 * Before returning, every mnemonic is decoded again and its fields checked; the
 * EMS is recovered (with digest check when T >= 2) from shareCount cyclic
 * windows of `threshold` consecutive shares, so every share takes part; then
 * the EMS is decrypted once and compared with the input.
 */
export async function splitMasterSecret({
  masterSecret,
  threshold,
  shareCount,
  passphrase = "",
  iterationExponent = DEFAULT_ITERATION_EXPONENT,
  extendable = DEFAULT_EXTENDABLE,
  crypto,
} = {}) {
  if (!isUint8Array(masterSecret) || (masterSecret.length !== 16 && masterSecret.length !== 32)) {
    fail("Master secret must be a Uint8Array of 16 or 32 bytes");
  }
  if (!isIntInRange(shareCount, 2, MAX_SHARE_COUNT)) fail(`Share count must be an integer from 2 to ${MAX_SHARE_COUNT}`);
  if (!isIntInRange(threshold, 2, shareCount)) fail("Threshold must be an integer from 2 to the share count");
  if (!isIntInRange(iterationExponent, 0, 15)) fail("Iteration exponent must be an integer from 0 to 15");
  if (typeof extendable !== "boolean") fail("extendable must be a boolean");
  if (typeof crypto?.getRandomValues !== "function") fail("A Web Crypto object with getRandomValues is required");
  const subtle = requireSubtle(crypto);

  // Every intermediate buffer is registered here as soon as it exists and is
  // zeroed in the finally block on success and on every failure path. Only the
  // returned mnemonic strings survive. The caller's masterSecret is never written.
  const wipe = [];
  try {
    const pass = passphraseBytes(passphrase);
    wipe.push(pass);
    const idBytes = new Uint8Array(2);
    wipe.push(idBytes);
    crypto.getRandomValues(idBytes);
    const identifier = ((idBytes[0] << 8) | idBytes[1]) & ((1 << ID_LENGTH_BITS) - 1);
    idBytes.fill(0);

    const ems = await encryptMasterSecret(subtle, masterSecret, pass, iterationExponent, identifier, extendable);
    wipe.push(ems);

    // GenerateShares from the spec with GT = 1 and a single (T, N) group.
    const groups = [[threshold, shareCount]];
    const groupShares = await splitSecret(crypto, 1, groups.length, ems);
    for (const share of groupShares) wipe.push(share.data);
    const shares = []; // { fields, value }
    for (let g = 0; g < groups.length; g += 1) {
      const [memberThreshold, memberCount] = groups[g];
      const members = await splitSecret(crypto, memberThreshold, memberCount, groupShares[g].data);
      for (const member of members) {
        wipe.push(member.data);
        shares.push({
          fields: { identifier, extendable, iterationExponent, groupIndex: g, groupThreshold: 1, groupCount: groups.length, memberIndex: member.x, memberThreshold },
          value: member.data,
        });
      }
    }
    const mnemonics = shares.map(({ fields, value }) => encodeShare({ ...fields, value }));

    // Self-check before handing anything out.
    const decoded = [];
    for (const mnemonic of mnemonics) {
      const share = decodeMnemonic(mnemonic);
      wipe.push(share.value);
      decoded.push(share);
    }
    decoded.forEach((share, i) => {
      const { fields, value } = shares[i];
      for (const key of Object.keys(fields)) {
        if (share[key] !== fields[key]) throw new Error("SLIP-39 self-check failed: share encoding mismatch");
      }
      if (!constantTimeEqual(share.value, value)) throw new Error("SLIP-39 self-check failed: share encoding mismatch");
    });
    for (let start = 0; start < shareCount; start += 1) {
      const window = Array.from({ length: threshold }, (_, k) => decoded[(start + k) % shareCount]);
      const recovered = await recoverSecret(subtle, threshold, window.map((s) => ({ x: s.memberIndex, data: s.value })));
      wipe.push(recovered);
      const ok = constantTimeEqual(recovered, ems);
      recovered.fill(0);
      if (!ok) throw new Error("SLIP-39 self-check failed: shares do not recover the encrypted master secret");
    }
    const roundTrip = await decryptMasterSecret(subtle, ems, pass, iterationExponent, identifier, extendable);
    wipe.push(roundTrip);
    const ok = constantTimeEqual(roundTrip, masterSecret);
    roundTrip.fill(0);
    if (!ok) throw new Error("SLIP-39 self-check failed: decryption does not return the master secret");

    return mnemonics;
  } finally {
    for (const bytes of wipe) bytes.fill(0);
  }
}

/**
 * Recovers the master secret from SLIP-39 mnemonics. Validates every share
 * (words, length, padding, checksum), requires matching identifier, ext flag,
 * iteration exponent, group threshold, group count and length, exactly GT
 * groups and exactly T_i distinct members per group, and verifies the digest
 * at every level with T >= 2. Throws Slip39Error on any failure.
 *
 * Exact duplicates of the same share (same member index and value) are
 * counted once, as in the reference implementation. A wrong passphrase cannot
 * be detected: it yields a different, valid-looking secret.
 */
export async function combineMnemonics(mnemonics, passphrase = "", crypto) {
  if (!Array.isArray(mnemonics) || mnemonics.length === 0) fail("The list of mnemonics is empty");
  const subtle = requireSubtle(crypto);
  // Every intermediate buffer is registered as soon as it exists and zeroed in
  // the finally block; only the returned master secret survives.
  const wipe = [];
  try {
    const pass = passphraseBytes(passphrase);
    wipe.push(pass);
    const shares = mnemonics.map((mnemonic, i) => {
      try {
        const share = decodeMnemonic(mnemonic);
        wipe.push(share.value);
        return share;
      } catch (error) {
        if (error instanceof Slip39Error) fail(`Mnemonic ${i + 1}: ${error.message}`);
        throw error;
      }
    });

    const first = shares[0];
    for (const share of shares) {
      if (share.identifier !== first.identifier || share.extendable !== first.extendable || share.iterationExponent !== first.iterationExponent) {
        fail("Invalid set of mnemonics: all mnemonics must begin with the same 2 words (identifier, extendable flag and iteration exponent differ)");
      }
      if (share.groupThreshold !== first.groupThreshold || share.groupCount !== first.groupCount) {
        fail("Invalid set of mnemonics: all mnemonics must have the same group threshold and group count");
      }
      if (share.value.length !== first.value.length) fail("Invalid set of mnemonics: all mnemonics must have the same length");
    }

    const groups = new Map();
    for (const share of shares) {
      let group = groups.get(share.groupIndex);
      if (!group) {
        group = [];
        groups.set(share.groupIndex, group);
      }
      if (group.length > 0 && group[0].memberThreshold !== share.memberThreshold) {
        fail(`Invalid set of mnemonics: member thresholds in group ${share.groupIndex + 1} do not match`);
      }
      const same = group.find((other) => other.memberIndex === share.memberIndex);
      if (same) {
        if (!constantTimeEqual(same.value, share.value)) {
          fail(`Invalid set of mnemonics: two different shares have member index ${share.memberIndex + 1} in group ${share.groupIndex + 1}`);
        }
        continue; // exact duplicate
      }
      group.push(share);
    }

    const groupThreshold = first.groupThreshold;
    if (groups.size < groupThreshold) {
      fail(`Insufficient number of mnemonic groups: ${groupThreshold} required, ${groups.size} provided`);
    }
    if (groups.size > groupThreshold) {
      fail(`Wrong number of mnemonic groups: exactly ${groupThreshold} required, ${groups.size} provided`);
    }
    for (const [groupIndex, group] of groups) {
      const required = group[0].memberThreshold;
      if (group.length < required) {
        fail(`Insufficient number of mnemonics${groups.size > 1 ? ` in group ${groupIndex + 1}` : ""}: ${required} required, ${group.length} provided`);
      }
      if (group.length > required) {
        fail(`Wrong number of mnemonics${groups.size > 1 ? ` in group ${groupIndex + 1}` : ""}: exactly ${required} required, ${group.length} provided`);
      }
    }

    const groupShares = [];
    for (const [groupIndex, group] of groups) {
      const data = await recoverSecret(subtle, group[0].memberThreshold, group.map((s) => ({ x: s.memberIndex, data: s.value })));
      wipe.push(data);
      groupShares.push({ x: groupIndex, data });
    }
    const ems = await recoverSecret(subtle, groupThreshold, groupShares);
    wipe.push(ems);
    return await decryptMasterSecret(subtle, ems, pass, first.iterationExponent, first.identifier, first.extendable);
  } finally {
    for (const bytes of wipe) bytes.fill(0);
  }
}

/** Internals exposed for tests only. Not part of the supported API. */
export const _internals = Object.freeze({
  EXP_TABLE,
  LOG_TABLE,
  gfMul,
  interpolate,
  rs1024Polymod,
  rs1024CreateChecksum,
  rs1024VerifyChecksum,
  bytesToWordIndices,
  wordIndicesToBytes,
  encodeShare,
  splitSecret,
  recoverSecret,
  encryptMasterSecret,
  decryptMasterSecret,
});
