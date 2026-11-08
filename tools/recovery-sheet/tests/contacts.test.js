import { test } from "node:test";
import assert from "node:assert/strict";
import { blankKeeper } from "../shared/schema.js";
import { contactErrors } from "../src/contacts.js";

test("a name and a contact channel are required", () => {
  assert.ok(contactErrors(blankKeeper(1)).name);
  assert.ok(contactErrors(blankKeeper(1)).phone);
  assert.deepEqual(contactErrors({ ...blankKeeper(1), name: "Example Keeper", phone: "+1 202 555 0101" }), {});
});
test("each supported contact channel can be used without inventing optional data", () => {
  for (const [field, value] of [["phone", "555-0100"], ["website", "https://example.org"], ["address1", "1 Example Street"]]) {
    assert.deepEqual(contactErrors({ ...blankKeeper(1), name: "Élodie", [field]: value }), {});
  }
});
test("control characters are rejected and there is no email field", () => {
  assert.equal("email" in blankKeeper(1), false);
  assert.ok(contactErrors({ ...blankKeeper(1), name: "Example\nName", phone: "555-0100" }).name);
});
test("contact length limits reject overflow without truncation", () => {
  assert.ok(contactErrors({ ...blankKeeper(1), name: "A".repeat(81), phone: "555-0100" }).name);
});
