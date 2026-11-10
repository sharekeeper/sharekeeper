import { HDKey } from "@scure/bip32";
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

export function firstBip84Address(masterSeed) {
  if (!(masterSeed instanceof Uint8Array) || ![16, 32, 64].includes(masterSeed.length)) {
    throw new TypeError("The BIP-32 seed must be 16, 32 or 64 bytes.");
  }
  const root = HDKey.fromMasterSeed(masterSeed);
  let child;
  try {
    child = root.derive(FIRST_ADDRESS_PATH);
    const publicKey = child.publicKey;
    if (!(publicKey instanceof Uint8Array) || publicKey.length !== 33) throw new Error("Address derivation failed.");
    const program = ripemd160(sha256(publicKey));
    return bech32.encode("bc", [0, ...bech32.toWords(program)]);
  } finally {
    child?.wipePrivateData();
    root.wipePrivateData();
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
