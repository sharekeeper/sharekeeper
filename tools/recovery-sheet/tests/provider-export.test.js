import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, open, readFile, readdir, writeFile, rm, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildApprovedPublicExport, exportApprovedPublicFile, ExportValidationError,
} from "../scripts/export-approved-providers.mjs";
import { PUBLIC_PROVIDER_FIELDS, SERVICES, assertPublicDirectory } from "../site/directory.js";

const clock = { now: new Date("2026-11-07T12:00:00Z") };
const sentinel = "SYNTHETIC_PRIVATE_SENTINEL";
const fixture = () => ({
  schemaVersion: 1,
  records: [{
    reviewStatus: "Approved", publicationApproved: true,
    reviewedBy: `${sentinel}_REVIEWER`,
    reviewedAt: "2026-11-06T17:30:00-05:00",
    sourceSubmissionRef: `${sentinel}_SOURCE_001`,
    publicListing: {
      id: "synthetic-test-only", businessName: "Synthetic fixture only",
      website: "https://example.org/", jurisdiction: "Synthetic jurisdiction",
      serviceArea: "Synthetic area", address: "Synthetic public address",
      publicEmail: "synthetic-public@example.org", publicPhone: "+1 202 555 0100",
      services: ["Recovery coordination"], description: "Synthetic fixture; never an actual applicant.",
    },
  }],
});
const transform = (fn) => { const value = fixture(); fn(value.records[0], value); return value; };
const rejected = (input) => assert.throws(
  () => buildApprovedPublicExport(input, clock),
  (error) => error instanceof ExportValidationError && !error.message.includes(sentinel),
);

test("approved export uses the existing public boundary and never leaks reviewer metadata", () => {
  const input = fixture();
  const output = buildApprovedPublicExport(input, clock);
  assert.equal(assertPublicDirectory(output), true);
  assert.deepEqual(Object.keys(output[0]), PUBLIC_PROVIDER_FIELDS);
  assert.equal(output[0].status, "approved");
  assert.equal(output[0].reviewedOn, "2026-11-06");
  assert.ok(!JSON.stringify(output).includes(sentinel));
  assert.equal(input.records[0].reviewStatus, "Approved");
  output[0].services.push("Other");
  assert.equal(input.records[0].publicListing.services.length, 1);
});

test("approval matrix fails closed without interpreting applicant claims", () => {
  for (const value of [undefined, null, false, true, "", "approved", "APPROVED", "Pending", "Rejected", " Approved"]) {
    rejected(transform((record) => { record.reviewStatus = value; }));
  }
  for (const value of [undefined, null, false, 1, "true", "TRUE", "Approved", {}, []]) {
    rejected(transform((record) => { record.publicationApproved = value; }));
  }
  rejected(transform((record) => {
    delete record.publicationApproved;
    record.consent = { publishApprovedPublicFields: true };
  }));
  rejected(transform((record) => { record.publicListing.status = "approved"; }));
  rejected(transform((record) => { record.publicListing.reviewedOn = "2026-11-06"; }));
  rejected(transform((record, batch) => {
    batch.records.push({ ...structuredClone(record), reviewStatus: "Pending" });
  }));
});

test("review metadata is required, bounded, calendar-valid and not in the future", () => {
  for (const key of ["reviewedBy", "sourceSubmissionRef", "reviewedAt"]) {
    for (const value of [undefined, null, "", " ", {}, [], 123, "x\nprivate", ` ${sentinel}`, "x".repeat(600)]) {
      rejected(transform((record) => { record[key] = value; }));
    }
  }
  for (const reviewedAt of [
    "0000-01-01", "2026-02-29", "2024-02-30", "2026-04-31", "2026-13-01",
    "11/06/2026", "2026-11-06T12:00:00", "2026-11-06T24:00:00Z",
    "2026-11-06T12:60:00Z", "2026-11-06T12:00:60Z", "2026-11-08",
    "2026-11-07T12:00:01Z", "2026-11-06T12:00:00+99:00",
  ]) rejected(transform((record) => { record.reviewedAt = reviewedAt; }));
  for (const reviewedAt of ["2024-02-29", "2026-11-07", "2026-11-07T11:59:59.999Z"]) {
    assert.equal(buildApprovedPublicExport(transform((record) => { record.reviewedAt = reviewedAt; }), clock)[0].reviewedOn, reviewedAt.slice(0, 10));
  }
});

test("schema, duplicate sources and duplicate ids reject the whole batch", () => {
  for (const input of [null, [], {}, { schemaVersion: "1", records: [] }, { schemaVersion: 2, records: [] }, { schemaVersion: 1, records: {} }]) rejected(input);
  rejected({ ...fixture(), privateNotes: sentinel });
  rejected(transform((record, batch) => {
    batch.records.push({ ...structuredClone(record), publicListing: { ...record.publicListing, id: "different-synthetic-id" } });
  }));
  rejected(transform((record, batch) => {
    batch.records.push({ ...structuredClone(record), sourceSubmissionRef: "different-synthetic-source" });
  }));
  rejected({ schemaVersion: 1, records: Array(1001).fill(fixture().records[0]) });
  rejected({ schemaVersion: 1, records: [] });
});

test("privacy and injection matrix rejects unknown, nested, hidden and inherited data", () => {
  for (const key of ["privateReview", "contactName", "contactEmail", "reviewNotes", "rawAnswers", "consent", "secret", "constructor", "__proto__"]) {
    rejected(transform((record) => { Object.defineProperty(record.publicListing, key, { value: sentinel, enumerable: true }); }));
    rejected(transform((record) => { Object.defineProperty(record, key, { value: sentinel, enumerable: true }); }));
  }
  for (const key of PUBLIC_PROVIDER_FIELDS.filter((field) => !["status", "reviewedOn"].includes(field))) {
    rejected(transform((record) => { record.publicListing[key] = { privateReview: sentinel }; }));
  }
  rejected(transform((record) => {
    Object.defineProperty(record.publicListing, "hidden", { value: sentinel });
  }));
  rejected(transform((record) => {
    Object.defineProperty(record.publicListing, "businessName", { get() { throw Error(sentinel); }, enumerable: true });
  }));
  rejected(transform((record) => { Object.setPrototypeOf(record.publicListing, { secret: sentinel }); }));
  rejected(transform((record) => { record.publicListing[Symbol("private")] = sentinel; }));
});

test("public fields and unsafe website matrix reject instead of clipping or filtering", () => {
  const limits = { id: 100, businessName: 160, website: 500, jurisdiction: 160, serviceArea: 300, address: 400, publicEmail: 254, publicPhone: 80, description: 1200 };
  for (const [key, max] of Object.entries(limits)) {
    rejected(transform((record) => { record.publicListing[key] = "x".repeat(max + 1); }));
    rejected(transform((record) => { record.publicListing[key] = "x\u0000"; }));
  }
  for (const key of ["id", "businessName", "website", "jurisdiction", "serviceArea", "description", "services"]) {
    rejected(transform((record) => { delete record.publicListing[key]; }));
    rejected(transform((record) => { record.publicListing[key] = ""; }));
  }
  for (const website of [
    "javascript:alert(1)", "data:text/html,test", "file:///tmp/private", "http://example.org",
    "https://user:password@example.org", "https://example.org\\@evil.example",
    "https://localhost", "https://sub.localhost", "https://127.0.0.1", "https://[::1]",
    "https://192.168.1.1", "https://intranet", "https://foo.internal", "https://example.org/\nprivate",
  ]) rejected(transform((record) => { record.publicListing.website = website; }));
  for (const services of [[], ["Unknown"], ["Notarization", "Notarization"], [{ private: sentinel }], "Other"]) {
    rejected(transform((record) => { record.publicListing.services = services; }));
  }
  rejected(transform((record) => { record.publicListing.publicEmail = "not-an-email"; }));
  const allServices = transform((record) => { record.publicListing.services = [...SERVICES]; });
  assert.equal(buildApprovedPublicExport(allServices, clock)[0].services.length, SERVICES.length);
});

test("dry file export creates only a new private-mode candidate and refuses overwrite/symlinks", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "synthetic-provider-export-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, "private.json");
  const output = join(dir, "candidate.json");
  const raw = JSON.stringify(fixture());
  await writeFile(input, raw, { mode: 0o600 });
  assert.deepEqual(await exportApprovedPublicFile(input, output), { count: 1 });
  assert.ok(!(await readFile(output, "utf8")).includes(sentinel));
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal(await readFile(input, "utf8"), raw);
  await assert.rejects(exportApprovedPublicFile(input, input));
  await assert.rejects(exportApprovedPublicFile(input, output));
  const link = join(dir, "alias.json");
  await symlink(input, link);
  await assert.rejects(exportApprovedPublicFile(input, link));
  await assert.rejects(exportApprovedPublicFile(input, fileURLToPath(new URL("../site/synthetic-candidate.json", import.meta.url))), /outside the repository/);
  const repositoryLink = join(dir, "repository");
  await symlink(fileURLToPath(new URL("../site/", import.meta.url)), repositoryLink);
  await assert.rejects(exportApprovedPublicFile(input, join(repositoryLink, "synthetic-candidate.json")), /outside the repository/);
  // Use existing synthetic test source only; reject before reading/parsing it.
  const repositoryInput = fileURLToPath(import.meta.url);
  await assert.rejects(exportApprovedPublicFile(repositoryInput, join(dir, "rejected-input.json")), (error) => {
    assert.ok(error instanceof ExportValidationError);
    assert.equal(error.message, "Private input must be outside the repository.");
    assert.ok(!error.message.includes(repositoryInput));
    return true;
  });
  const inputAlias = join(dir, "repository-input-alias.json");
  await symlink(repositoryInput, inputAlias);
  await assert.rejects(exportApprovedPublicFile(inputAlias, join(dir, "rejected-alias.json")), /Private input must be outside the repository/);
  await assert.rejects(stat(join(dir, "rejected-input.json")), { code: "ENOENT" });
  await assert.rejects(stat(join(dir, "rejected-alias.json")), { code: "ENOENT" });
});

test("CLI errors reveal neither invalid JSON content nor private paths and write no partial batch", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "synthetic-provider-cli-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL("../scripts/export-approved-providers.mjs", import.meta.url));
  const input = join(dir, `${sentinel}.json`);
  const output = join(dir, "candidate.json");
  const run = promisify(execFile);
  const mixedApproval = transform((record, batch) => {
    batch.records.push({
      ...structuredClone(record), reviewStatus: "Pending",
      sourceSubmissionRef: "synthetic-pending-source",
      publicListing: { ...record.publicListing, id: "synthetic-pending" },
    });
  });
  for (const content of [
    `{"${sentinel}":`,
    JSON.stringify(transform((record) => { record.reviewedBy = { secret: sentinel }; })),
    JSON.stringify(mixedApproval),
    JSON.stringify({ schemaVersion: 1, records: [] }),
  ]) {
    await writeFile(input, content);
    await assert.rejects(run(process.execPath, [cli, "--input", input, "--output", output]), (error) => {
      assert.equal(error.code, 1);
      assert.ok(!error.stderr.includes(sentinel));
      assert.ok(!error.stderr.includes(dir));
      assert.equal(error.stdout, "");
      return true;
    });
    await assert.rejects(stat(output), { code: "ENOENT" });
  }
  await assert.rejects(run(process.execPath, [cli, "--input", join(dir, sentinel), "--output", output]), (error) => {
    assert.ok(!error.stderr.includes(sentinel));
    return true;
  });
  await writeFile(input, JSON.stringify(fixture()));
  const result = await run(process.execPath, [cli, "--input", input, "--output", output]);
  assert.match(result.stdout, /1 public candidate record.*Nothing was published/);
  assert.equal(result.stderr, "");
});

test("write/sync/close failures leave no candidate or staging files and API filesystem errors are redacted", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "synthetic-provider-io-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, `${sentinel}.json`);
  const output = join(dir, "candidate.json");
  await writeFile(input, JSON.stringify(fixture()));
  const probe = await open(input, "r");
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const originalWrite = prototype.writeFile;
  for (const failure of ["write", "sync", "close"]) {
    prototype.writeFile = async function (data, ...args) {
      if (failure === "write") {
        await originalWrite.call(this, data.slice(0, 20), ...args);
        throw Object.assign(new Error(`${sentinel} ${input}`), { code: "ENOSPC" });
      }
      if (failure === "close") {
        const close = this.close.bind(this);
        this.close = async () => {
          await close();
          throw new Error(`${sentinel} ${input}`);
        };
      } else {
        this.sync = async () => { throw new Error(`${sentinel} ${input}`); };
      }
      return originalWrite.call(this, data, ...args);
    };
    try {
      await assert.rejects(exportApprovedPublicFile(input, output), (error) => {
        assert.ok(error instanceof ExportValidationError);
        assert.ok(!error.message.includes(sentinel));
        assert.ok(!error.message.includes(dir));
        return true;
      });
    } finally {
      prototype.writeFile = originalWrite;
    }
    await assert.rejects(stat(output), { code: "ENOENT" });
    assert.deepEqual(await readdir(dir), [`${sentinel}.json`]);
  }
  // Atomic publication failure (EEXIST) must preserve the existing final and
  // remove the otherwise complete staged candidate.
  await writeFile(output, "synthetic-existing-final-must-stay");
  await assert.rejects(exportApprovedPublicFile(input, output), ExportValidationError);
  assert.equal(await readFile(output, "utf8"), "synthetic-existing-final-must-stay");
  assert.deepEqual((await readdir(dir)).sort(), [`${sentinel}.json`, "candidate.json"].sort());
  await assert.rejects(exportApprovedPublicFile(join(dir, "missing-private.json"), output), (error) => {
    assert.ok(error instanceof ExportValidationError);
    assert.ok(!error.message.includes(dir));
    assert.ok(!error.message.includes("missing-private"));
    return true;
  });
});
