import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { checkMasterSecretHex, masterSecretFromHex, OWN_SECRET_HEX_DIGITS } from "../src/own-secret.js";
import { splitMasterSecret, combineMnemonics } from "../src/slip39.js";

const HEX = "0c94 90bc d8e3 3b6e 5f2f 6b04 7f29 1a8c";

test("accepts 32 hex digits with optional spaces, any case", () => {
  assert.equal(OWN_SECRET_HEX_DIGITS, 32);
  for (const v of [HEX, HEX.replace(/ /g, ""), HEX.toUpperCase(), " 0c 9490bcd8e33b6e5f2f6b047f291a8c "]) {
    assert.equal(checkMasterSecretHex(v).status, "ok", v);
    assert.deepEqual([...masterSecretFromHex(v)], [0x0c,0x94,0x90,0xbc,0xd8,0xe3,0x3b,0x6e,0x5f,0x2f,0x6b,0x04,0x7f,0x29,0x1a,0x8c]);
  }
});

test("rejects anything else", () => {
  assert.equal(checkMasterSecretHex("").status, "empty");
  assert.equal(checkMasterSecretHex("   ").status, "empty");
  assert.equal(checkMasterSecretHex("0c94").status, "short");
  assert.equal(checkMasterSecretHex(HEX + " 00").status, "long");
  assert.equal(checkMasterSecretHex("0".repeat(64)).status, "long");
  for (const bad of [HEX.replace("0c", "0g"), HEX.replace(/ /g, "-"), "0x" + HEX.replace(/ /g, ""), HEX + "\n", HEX.replace(/ /g, "\t"), "abandon ability able about"]) {
    assert.equal(checkMasterSecretHex(bad).status, "invalid", JSON.stringify(bad));
  }
  assert.equal(checkMasterSecretHex("0".repeat(32)).status, "weak");
  assert.equal(checkMasterSecretHex("F".repeat(16) + "f".repeat(16)).status, "weak");
  assert.throws(() => masterSecretFromHex("0c94"));
});

test("messages never echo the entered digits", () => {
  for (const v of [HEX, HEX.slice(0, 10), HEX + "1", HEX.replace("0c", "zz")]) {
    const { message } = checkMasterSecretHex(v);
    assert.ok(!message.includes("0c94") && !message.includes("90bc"), message);
  }
});

test("shares of a supplied secret recover exactly that secret", async () => {
  const secret = masterSecretFromHex(HEX);
  const mnemonics = await splitMasterSecret({ masterSecret: secret, threshold: 2, shareCount: 3, crypto: webcrypto });
  for (const pair of [[0, 1], [0, 2], [1, 2]]) {
    const recovered = await combineMnemonics(pair.map((i) => mnemonics[i]), "", webcrypto);
    assert.deepEqual([...recovered], [...secret]);
  }
});
