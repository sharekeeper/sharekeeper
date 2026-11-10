// Writes the published blank sample: the supplied template with the CRC64
// field applied (see blankSamplePdf in src/pdf.js). Deterministic output;
// tests/pdf.test.js checks the committed file matches a fresh build.
import { writeFile } from "node:fs/promises";
import { blankSamplePdf } from "../src/pdf.js";

const target = new URL("../../../templates/recovery/sharekeeper-recovery-sheet-sample-crc64.pdf", import.meta.url);
await writeFile(target, await blankSamplePdf());
console.log(`Wrote ${target.pathname}`);
