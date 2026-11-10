import { HDKey, HARDENED_OFFSET } from "@scure/bip32";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";

/**
 * First native SegWit (P2WPKH, bc1q...) receive address of BIP-84 account 0,
 * path m/84'/0'/0'/0/0, for a SLIP-39 master secret with an empty passphrase.
 *
 * SLIP-0039 requires wallets to use the BIP-32 master seed as the SLIP-39
 * master secret, and an empty passphrase leaves that master secret as stored.
 * So the 16-byte master secret is the BIP-32 seed here.
 *
 * Only the public address is returned. The derived private keys are wiped
 * before returning; the caller still owns (and wipes) the master secret.
 */
export const FIRST_ADDRESS_PATH = "m/84'/0'/0'/0/0";
const H = HARDENED_OFFSET;
/** The same path as explicit child indexes: 84', 0', 0', 0, 0. */
export const FIRST_ADDRESS_INDEXES = Object.freeze([84 + H, 0 + H, 0 + H, 0, 0]);

/**
 * Walk the path one child at a time (rather than HDKey.derive, which drops
 * its intermediate nodes) so every node holding a private key, root through
 * leaf, is wiped in the finally block, on success and on failure. Copies made
 * inside the library or by the JavaScript engine cannot be wiped from here.
 */
export function firstBip84Address(masterSeed, { fromMasterSeed = (seed) => HDKey.fromMasterSeed(seed) } = {}) {
  if (!(masterSeed instanceof Uint8Array) || ![16, 32, 64].includes(masterSeed.length)) {
    throw new TypeError("The BIP-32 seed must be 16, 32 or 64 bytes.");
  }
  const nodes = [];
  try {
    let node = fromMasterSeed(masterSeed);
    nodes.push(node);
    for (const index of FIRST_ADDRESS_INDEXES) {
      node = node.deriveChild(index);
      nodes.push(node);
    }
    const publicKey = node.publicKey;
    if (!(publicKey instanceof Uint8Array) || publicKey.length !== 33) throw new Error("Address derivation failed.");
    const program = ripemd160(sha256(publicKey));
    return bech32.encode("bc", [0, ...bech32.toWords(program)]);
  } finally {
    for (const node of nodes) node?.wipePrivateData?.();
  }
}

/** Shape check for the address placed on the sheet (BIP-173, P2WPKH, mainnet). */
export function isP2wpkhAddress(value) {
  if (typeof value !== "string" || !/^bc1q[02-9ac-hj-np-z]{38}$/.test(value)) return false;
  try {
    const { prefix, words } = bech32.decode(value);
    return prefix === "bc" && words[0] === 0 && bech32.fromWords(words.slice(1)).length === 20;
  } catch {
    return false;
  }
}
