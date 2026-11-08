/**
 * 128-bit SLIP-39 master secret for the offline Shamir tool.
 *
 * masterSecret = CSPRNG(16 bytes) XOR first 16 bytes of
 *   SHA-512("sharekeeper/shamir-offline/master-secret/v1|" || contribution)
 *
 * The browser CSPRNG alone makes the result uniform; the movement-derived block
 * adds protection only to the extent it is unpredictable. 128 bits is the size
 * whose SLIP-39 shares have 20 words, matching the sheet's 20 groups of 4.
 */
export const MASTER_SECRET_BYTES = 16;
const DOMAIN = new TextEncoder().encode("sharekeeper/shamir-offline/master-secret/v1|");
const MAX_CONTRIBUTION_BYTES = 262_144;

export async function generateMasterSecret(contribution, cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.getRandomValues !== "function" || !cryptoApi?.subtle) {
    throw new Error("Web Crypto is unavailable. No secret was generated.");
  }
  if (!(contribution instanceof Uint8Array) || contribution.length === 0 || contribution.length > MAX_CONTRIBUTION_BYTES) {
    throw new TypeError("A non-empty movement contribution is required.");
  }
  const input = new Uint8Array(DOMAIN.length + contribution.length);
  const secret = new Uint8Array(MASTER_SECRET_BYTES);
  let digest;
  let issued = false;
  try {
    input.set(DOMAIN, 0);
    input.set(contribution, DOMAIN.length);
    digest = new Uint8Array(await cryptoApi.subtle.digest("SHA-512", input));
    input.fill(0);
    cryptoApi.getRandomValues(secret);
    if (secret.every((byte) => byte === secret[0])) throw new Error("The browser random generator returned a constant block. No secret was generated.");
    for (let index = 0; index < MASTER_SECRET_BYTES; index += 1) secret[index] ^= digest[index];
    issued = true;
    return secret;
  } finally {
    input.fill(0);
    digest?.fill(0);
    if (!issued) secret.fill(0);
  }
}

/** All k-element index subsets of 0..m-1, in lexicographic order. */
export function thresholdSubsets(m, k) {
  const result = [];
  const walk = (start, chosen) => {
    if (chosen.length === k) { result.push([...chosen]); return; }
    for (let index = start; index < m; index += 1) { chosen.push(index); walk(index + 1, chosen); chosen.pop(); }
  };
  walk(0, []);
  return result;
}
