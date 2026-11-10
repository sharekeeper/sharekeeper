import test from "node:test";
import assert from "node:assert/strict";
import { modeFromHash, resolveHashChange } from "../src/mode.js";

test("hash selects the mode; recover anchors stay in recover", () => {
  assert.equal(modeFromHash("#recover"), "recover");
  assert.equal(modeFromHash("#recover-main"), "recover");
  for (const hash of ["", "#", "#create", "#main-content", "#recovery", undefined]) assert.equal(modeFromHash(hash), "create");
});

test("an active create session cannot be left by a hash change", () => {
  assert.deepEqual(resolveHashChange({ hash: "#recover", current: "create", locked: true }), { mode: "create", revert: true });
  assert.deepEqual(resolveHashChange({ hash: "#recover", current: "create", locked: false }), { mode: "recover", revert: false });
  assert.deepEqual(resolveHashChange({ hash: "#main-content", current: "create", locked: true }), { mode: "create", revert: false });
  assert.deepEqual(resolveHashChange({ hash: "", current: "recover", locked: false }), { mode: "create", revert: false });
  assert.deepEqual(resolveHashChange({ hash: "#recover-main", current: "recover", locked: false }), { mode: "recover", revert: false });
});
