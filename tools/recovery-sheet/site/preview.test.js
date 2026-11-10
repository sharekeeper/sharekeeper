import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("public sheet preview is derived from the current CRC64 blank sample", async () => {
  const provenance = JSON.parse(await readFile(new URL("./assets/recovery-sheet-preview.provenance.json", import.meta.url), "utf8"));
  const source = await readFile(new URL(`../../../${provenance.sourceRepositoryPath}`, import.meta.url));
  const original = await readFile(new URL(`../../../${provenance.derivedFrom.path}`, import.meta.url));
  assert.equal(provenance.sourceRepositoryPath, "templates/recovery/sharekeeper-recovery-sheet-sample-crc64.pdf");
  assert.equal(sha256(original), provenance.derivedFrom.sha256, "The supplied template must stay unchanged.");
  const preview = await readFile(new URL(`./assets/${provenance.previewFile}`, import.meta.url));
  assert.equal(sha256(source), provenance.sourceSha256, "Regenerate the visible preview when the canonical blank sheet changes.");
  assert.equal(sha256(preview), provenance.previewSha256, "Preview bytes must match the recorded, inspected rendering.");
  assert.equal(provenance.width, 1160);
  assert.equal(provenance.height, 1500);
  assert.equal(provenance.sourcePage, 1);
});
