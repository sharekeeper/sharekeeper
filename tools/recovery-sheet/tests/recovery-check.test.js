import test from "node:test";
import assert from "node:assert/strict";
import { checkSubsets } from "../src/recovery-check.js";

const secret = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const subsets = [[0, 1], [0, 2], [1, 2]];
const mnemonics = ["a", "b", "c"];

function tracker(make = () => secret.slice()) {
  const issued = [];
  return { issued, combine: async () => { const buffer = make(); issued.push(buffer); return buffer; } };
}

test("all recovered buffers are zeroed after a passing check", async () => {
  const { issued, combine } = tracker();
  await checkSubsets({ mnemonics, masterSecret: secret, subsets, address: "A", combine, deriveAddress: () => "A" });
  assert.equal(issued.length, 3);
  issued.forEach((buffer) => assert.ok(buffer.every((b) => b === 0)));
});

test("a throwing address derivation still zeroes the recovered buffer", async () => {
  const { issued, combine } = tracker();
  await assert.rejects(() => checkSubsets({ mnemonics, masterSecret: secret, subsets, address: "A", combine, deriveAddress: () => { throw new Error("boom"); } }), /boom/);
  assert.equal(issued.length, 1);
  assert.ok(issued[0].every((b) => b === 0));
});

test("an address mismatch or a wrong secret fails and zeroes the buffer", async () => {
  let t = tracker();
  await assert.rejects(() => checkSubsets({ mnemonics, masterSecret: secret, subsets, address: "A", combine: t.combine, deriveAddress: () => "B" }), /Address check failed/);
  assert.ok(t.issued[0].every((b) => b === 0));
  t = tracker(() => { const b = secret.slice(); b[3] ^= 1; return b; });
  await assert.rejects(() => checkSubsets({ mnemonics, masterSecret: secret, subsets, address: "A", combine: t.combine, deriveAddress: () => "A" }), /Recovery check failed/);
  assert.equal(t.issued.length, 1);
  assert.ok(t.issued[0].every((b) => b === 0));
  assert.deepEqual(secret, Uint8Array.from({ length: 16 }, (_, i) => i + 1), "caller's master secret untouched");
});
