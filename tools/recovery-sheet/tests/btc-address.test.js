import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { firstBip84Address, isP2wpkhAddress, FIRST_ADDRESS_PATH } from "../src/btc-address.js";
import { webcrypto } from "node:crypto";
import { splitMasterSecret, combineMnemonics } from "../src/slip39.js";

test("BIP-84 published test vector: first receive address of account 0", () => {
  // BIP-84 test vector mnemonic; BIP-39 seed = PBKDF2-HMAC-SHA512(mnemonic, "mnemonic", 2048, 64).
  const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const seed = new Uint8Array(pbkdf2Sync(mnemonic, "mnemonic", 2048, 64, "sha512"));
  assert.equal(FIRST_ADDRESS_PATH, "m/84'/0'/0'/0/0");
  assert.equal(firstBip84Address(seed), "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
});

test("a 16-byte SLIP-39 master secret is used directly as the BIP-32 seed", () => {
  const secret = Uint8Array.from({ length: 16 }, (_, i) => i);
  const address = firstBip84Address(secret);
  // Independently computed with the Python embit library (HDKey.from_seed, m/84h/0h/0h/0/0, p2wpkh).
  assert.equal(address, "bc1qpux3z758ulsxg69eptaakukraanqwtdxe5yy4c");
  assert.ok(isP2wpkhAddress(address));
  assert.equal(address.length, 42);
  assert.equal(firstBip84Address(secret), address, "deterministic");
  assert.deepEqual(secret, Uint8Array.from({ length: 16 }, (_, i) => i), "input untouched");
  const other = secret.slice(); other[15] ^= 1;
  assert.notEqual(firstBip84Address(other), address);
});

test("the address from recombined shares (empty passphrase) matches the original secret's", async () => {
  const secret = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 255);
  const shares = await splitMasterSecret({ masterSecret: secret, threshold: 2, shareCount: 3, crypto: webcrypto });
  const recovered = await combineMnemonics(shares.slice(1), "", webcrypto);
  assert.equal(firstBip84Address(new Uint8Array(recovered)), firstBip84Address(secret));
});

test("rejects bad seeds and validates address shape", () => {
  for (const bad of [undefined, "00", new Uint8Array(15), new Uint8Array(20), [1, 2, 3]]) assert.throws(() => firstBip84Address(bad));
  assert.ok(isP2wpkhAddress("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"));
  for (const bad of ["bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyv", "BC1QCR8TE4KR609GCAWUTMRZA0J4XV80JY8Z306FYU", "tb1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT", "", null]) {
    assert.equal(isP2wpkhAddress(bad), false, String(bad));
  }
});
