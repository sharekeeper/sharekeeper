import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  approvedProviders, filterProviders, hostedFormUrl, safeWebsite,
  emptyApplication, applicationErrors, PUBLIC_PROVIDER_FIELDS, assertPublicDirectory,
} from "./directory.js";

const synthetic = {
  id: "synthetic-test-only", status: "approved", businessName: "Synthetic test fixture",
  website: "https://example.org/", jurisdiction: "Test jurisdiction", serviceArea: "Test area",
  services: ["Encrypted-share custody"], description: "Explicitly synthetic fixture, never production directory data.",
  privateReview: { contactEmail: "private@example.org" }, reviewNotes: "Do not publish",
  reviewerContactName: "Private", secret: "not public",
};

test("publication requires explicit approved status and required public fields", () => {
  assert.deepEqual(approvedProviders([{ ...synthetic, status: "pending" }]), []);
  assert.deepEqual(approvedProviders([{ ...synthetic, status: "rejected" }]), []);
  assert.deepEqual(approvedProviders([{ ...synthetic, businessName: "" }]), []);
  assert.deepEqual(approvedProviders([{ ...synthetic, website: "javascript:alert(1)" }]), []);
  assert.deepEqual(approvedProviders(null), []);
  assert.equal(approvedProviders([synthetic]).length, 1);
});

test("public-field allowlist excludes private application and unknown fields", () => {
  const [entry] = approvedProviders([synthetic]);
  assert.deepEqual(Object.keys(entry), PUBLIC_PROVIDER_FIELDS);
  assert.equal("privateReview" in entry, false);
  assert.equal("reviewNotes" in entry, false);
  assert.equal("secret" in entry, false);
});

test("filters combine search terms, jurisdiction, and service and reset naturally", () => {
  const entries = approvedProviders([synthetic]);
  assert.equal(filterProviders(entries, { query: "fixture test" }).length, 1);
  assert.equal(filterProviders(entries, { query: "missing" }).length, 0);
  assert.equal(filterProviders(entries, { jurisdiction: "Elsewhere" }).length, 0);
  assert.equal(filterProviders(entries, { service: "Notarization" }).length, 0);
  assert.equal(filterProviders(entries, {}).length, 1);
  assert.equal(filterProviders([], { query: "anything" }).length, 0);
});

test("only explicitly configured native Google responder URLs can load", () => {
  assert.equal(hostedFormUrl(null), "");
  assert.equal(hostedFormUrl("https://example.org/forms/d/e/id/viewform"), "");
  assert.equal(hostedFormUrl("https://docs.google.com/forms/d/e/test-id/formResponse"), "");
  assert.equal(hostedFormUrl("https://docs.google.com/forms/d/e/test-id/viewform?entry.1=private"), "https://docs.google.com/forms/d/e/test-id/viewform");
  assert.equal(hostedFormUrl("https://docs.google.com/forms/d/test-id/viewform"), "https://docs.google.com/forms/d/test-id/viewform");
});

test("safe public websites prohibit executable, insecure, and credential URLs", () => {
  assert.equal(safeWebsite("javascript:alert(1)"), "");
  assert.equal(safeWebsite("http://example.org"), "");
  assert.equal(safeWebsite("https://private:password@example.org"), "");
  assert.equal(safeWebsite("https://example.org"), "https://example.org/");
});

test("local application draft is explicitly not submitted and validates both boundaries", () => {
  const draft = emptyApplication();
  assert.equal(draft.submissionStatus, "not-submitted");
  assert.ok(applicationErrors(draft).businessName);
  draft.publicListing = {
    ...draft.publicListing, businessName: "Synthetic test fixture", website: "https://example.org",
    jurisdiction: "Test jurisdiction", serviceArea: "Test area", services: ["Notarization"],
    description: "Synthetic fixture used in unit tests only.",
  };
  draft.privateReview = { contactName: "Synthetic contact", contactEmail: "private@example.org", reviewNotes: "" };
  draft.consent = { publishApprovedPublicFields: true, authorizedRepresentative: true };
  assert.deepEqual(applicationErrors(draft), {});
  assert.equal(draft.submissionStatus, "not-submitted");
  assert.equal("contactEmail" in draft.publicListing, false);
  assert.equal("reviewNotes" in draft.publicListing, false);
});

test("production directory source contains no private or unapproved records", async () => {
  const production = JSON.parse(await readFile(new URL("./providers.json", import.meta.url), "utf8"));
  assert.equal(assertPublicDirectory(production), true);
  assert.throws(() => assertPublicDirectory([synthetic]), /non-public field/);
  const { privateReview, reviewNotes, reviewerContactName, secret, ...publicOnly } = synthetic;
  assert.equal(assertPublicDirectory([publicOnly]), true);
  assert.throws(() => assertPublicDirectory([{ ...publicOnly, status: "pending" }]), /only approved/);
  assert.throws(() => assertPublicDirectory([{ ...publicOnly, businessName: { privateReview: { contactEmail: "private@example.org" } } }]), /plain strings/);
  assert.throws(() => assertPublicDirectory([{ ...publicOnly, services: [{ privateReview: "not public" }] }]), /invalid service/);
  assert.throws(() => assertPublicDirectory([{ ...publicOnly, businessName: "X".repeat(161) }]), /maximum length/);
  assert.equal(approvedProviders([{ ...publicOnly, businessName: "X".repeat(161) }]).length, 0);
});

test("overlong application input is preserved and visibly rejected rather than clipped", () => {
  const draft = emptyApplication();
  draft.publicListing.businessName = "X".repeat(161);
  draft.privateReview.reviewNotes = "Y".repeat(2001);
  const errors = applicationErrors(draft);
  assert.match(errors.businessName, /160 characters.*not been shortened/);
  assert.match(errors.reviewNotes, /2000 characters.*not been shortened/);
  assert.equal(draft.publicListing.businessName.length, 161);
  assert.equal(draft.privateReview.reviewNotes.length, 2001);
});
