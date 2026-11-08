#!/usr/bin/env node
/**
 * Offline, approval-only export. This module never submits, publishes, or edits
 * the directory source. Keep its input in private storage outside this repo.
 */
import { link, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPLICATION_LIMITS, PUBLIC_PROVIDER_FIELDS, SERVICES, assertPublicDirectory, safeWebsite,
} from "../site/directory.js";

const RECORD_FIELDS = Object.freeze([
  "reviewStatus", "publicationApproved", "reviewedBy", "reviewedAt",
  "sourceSubmissionRef", "publicListing",
]);
const LISTING_FIELDS = Object.freeze(PUBLIC_PROVIDER_FIELDS.filter(
  (key) => key !== "status" && key !== "reviewedOn",
));
const REQUIRED_TEXT = Object.freeze([
  "id", "businessName", "website", "jurisdiction", "serviceArea", "description",
]);
const LIMITS = Object.freeze({ ...APPLICATION_LIMITS, id: 100 });
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 1000;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/u;

export class ExportValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExportValidationError";
  }
}

function reject(message) {
  throw new ExportValidationError(message);
}

function plainRecord(value, fields, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    reject(`${context}: expected a plain record.`);
  }
  // Accessors, symbols, hidden fields and inherited objects are not JSON records.
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !fields.includes(key)
    || !Object.getOwnPropertyDescriptor(value, key).enumerable
    || !("value" in Object.getOwnPropertyDescriptor(value, key)))) {
    reject(`${context}: unknown or non-data fields are forbidden.`);
  }
}

function text(value, max, required, context) {
  if (typeof value !== "string" || value.length > max || CONTROLS.test(value)
    || value !== value.trim() || (required && !value)) {
    reject(`${context}: invalid, blank, oversized, or non-plain text.`);
  }
}

function reviewDate(value, now, context) {
  text(value, 40, true, context);
  // A date or timezone-qualified ISO timestamp only; never locale date guessing.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) reject(`${context}: expected an ISO date or timezone-qualified timestamp.`);
  const [, year, month, day, hour, minute, second] = match;
  const calendar = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number(year) < 1 || !Number.isFinite(calendar.valueOf())
    || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)
    || (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59))) {
    reject(`${context}: impossible calendar date or time.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)
    || (hour === undefined ? value > now.toISOString().slice(0, 10) : timestamp > now.valueOf())) {
    reject(`${context}: invalid or future review date.`);
  }
  // Preserve the reviewer's explicit calendar date, including timestamp offsets.
  return value.slice(0, 10);
}

function validateWebsite(value, context) {
  if (!safeWebsite(value) || /[\s\\]/u.test(value)) reject(`${context}: unsafe website.`);
  const url = new URL(value);
  // Public listing destinations cannot be local hosts, bare intranet names or IPs.
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".") || host.startsWith("[")
    || /^\d+(?:\.\d+){3}$/.test(host)
    || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host)) {
    reject(`${context}: website must name a public HTTPS host.`);
  }
}

/**
 * Input schema: { schemaVersion: 1, records: [{
 *   reviewStatus: "Approved", publicationApproved: true,
 *   reviewedBy: string, reviewedAt: ISO date/timestamp, sourceSubmissionRef: string,
 *   publicListing: { id, businessName, website, jurisdiction, serviceArea,
 *     address?, publicEmail?, publicPhone?, services: string[], description }
 * }] }. No applicant consent/status is treated as reviewer approval.
 *
 * Throws on any invalid row; never filters, truncates, or partially exports.
 * The caller must keep private review records out of public source control.
 */
export function buildApprovedPublicExport(input, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) reject("Invalid validation clock.");
  plainRecord(input, ["schemaVersion", "records"], "Review batch");
  if (input.schemaVersion !== 1 || !Array.isArray(input.records)
    || input.records.length === 0 || input.records.length > MAX_RECORDS) {
    reject("Review batch: unsupported schema or invalid record count.");
  }
  const sources = new Set();
  const ids = new Set();
  const output = [];
  for (let index = 0; index < input.records.length; index += 1) {
    const context = `Record ${index + 1}`;
    const record = input.records[index];
    plainRecord(record, RECORD_FIELDS, context);
    if (record.reviewStatus !== "Approved" || record.publicationApproved !== true) {
      reject(`${context}: explicit reviewer approval and boolean publication approval are required.`);
    }
    text(record.reviewedBy, 160, true, `${context} reviewer`);
    text(record.sourceSubmissionRef, 512, true, `${context} submission reference`);
    const reviewedOn = reviewDate(record.reviewedAt, now, `${context} review date`);
    if (sources.has(record.sourceSubmissionRef)) reject(`${context}: duplicate submission reference.`);
    sources.add(record.sourceSubmissionRef);
    const listing = record.publicListing;
    plainRecord(listing, LISTING_FIELDS, `${context} public listing`);
    for (const key of LISTING_FIELDS.filter((field) => field !== "services")) {
      if (REQUIRED_TEXT.includes(key) || Object.hasOwn(listing, key)) {
        text(listing[key], LIMITS[key], REQUIRED_TEXT.includes(key), `${context} public ${key}`);
      }
    }
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(listing.id)) reject(`${context}: invalid public identifier.`);
    if (ids.has(listing.id)) reject(`${context}: duplicate public identifier.`);
    ids.add(listing.id);
    validateWebsite(listing.website, context);
    if (!Array.isArray(listing.services) || listing.services.length === 0
      || listing.services.length > SERVICES.length
      || listing.services.some((service) => typeof service !== "string" || !SERVICES.includes(service))
      || new Set(listing.services).size !== listing.services.length) {
      reject(`${context}: invalid or duplicate service categories.`);
    }
    const candidate = {};
    // Validation above rejects every extra key BEFORE allowlisted construction.
    for (const key of PUBLIC_PROVIDER_FIELDS) {
      if (key === "status") candidate[key] = "approved";
      else if (key === "reviewedOn") candidate[key] = reviewedOn;
      else if (Object.hasOwn(listing, key)) candidate[key] = key === "services" ? [...listing[key]] : listing[key];
    }
    output.push(candidate);
  }
  try {
    assertPublicDirectory(output);
  } catch {
    // Do not include library errors that could later expose application values.
    reject("Public directory boundary rejected the candidate; no export was written.");
  }
  return output;
}

function isWithin(root, path) {
  const difference = relative(root, path);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

/**
 * Creates a NEW local candidate atomically, without replacing existing files,
 * with mode 0600. The parent directory must be private and trusted.
 * Output must be outside the entire repository, including symlink destinations.
 * Nothing is uploaded, published, committed, or copied to providers.json.
 */
export async function exportApprovedPublicFile(inputPath, outputPath) {
  try {
    return await exportFile(inputPath, outputPath);
  } catch (error) {
    if (error instanceof ExportValidationError) throw error;
    // Both API callers and the CLI receive errors without private filesystem paths.
    reject("Export failed: check private input and new output paths and permissions.");
  }
}

async function exportFile(inputPath, outputPath) {
  if (typeof inputPath !== "string" || !inputPath || typeof outputPath !== "string" || !outputPath) {
    reject("Explicit private input and candidate output paths are required.");
  }
  const input = await realpath(resolve(inputPath));
  const outputParent = await realpath(dirname(resolve(outputPath)));
  const output = resolve(outputParent, basename(resolve(outputPath)));
  const root = await realpath(REPOSITORY_ROOT);
  if (input === output) reject("Input and output paths must be distinct.");
  if (isWithin(root, input)) reject("Private input must be outside the repository.");
  if (isWithin(root, output)) reject("Candidate output must be outside the repository.");
  const source = await open(input, "r");
  let raw;
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) reject("Private input must be a bounded regular JSON file.");
    raw = await source.readFile("utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_INPUT_BYTES) reject("Private input exceeds the size limit.");
  } finally {
    await source.close();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    reject("Private input is not valid JSON.");
  }
  const entries = buildApprovedPublicExport(parsed);
  // Stage in a private directory on the SAME filesystem. A hard link makes the
  // final filename visible only after successful write and close, and refuses
  // existing files, hard links, and symlinks without replacing them.
  const staging = await mkdtemp(join(outputParent, ".provider-export-"));
  try {
    const stagedFile = join(staging, "candidate.json");
    const target = await open(stagedFile, "wx", 0o600);
    try {
      await target.writeFile(`${JSON.stringify(entries, null, 2)}\n`, "utf8");
      await target.sync();
    } finally {
      await target.close();
    }
    await link(stagedFile, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { count: entries.length };
}

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Dry export only: node scripts/export-approved-providers.mjs --input /private/reviews.json --output /private/public-candidate.json");
    return;
  }
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output") {
    console.error("Usage: node scripts/export-approved-providers.mjs --input PRIVATE_JSON --output NEW_CANDIDATE_JSON");
    process.exitCode = 1;
    return;
  }
  try {
    const { count } = await exportApprovedPublicFile(args[1], args[3]);
    console.log(`Dry export complete: ${count} public candidate record(s). Nothing was published.`);
  } catch (error) {
    console.error(error instanceof ExportValidationError ? error.message : "Export failed: check private input and new output paths and permissions.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
