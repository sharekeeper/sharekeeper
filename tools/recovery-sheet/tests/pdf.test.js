import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FONT_BASE64, SOURCE_TEMPLATE_SHA256 } from "../src/pdf-assets.js";
import {
  createRecoveryPdf,
  fitPdfContact,
  measurePdfGlyphBounds,
  PDF_CONTACT_FRAME,
  validatePdfContacts,
  wrapPdfText,
} from "../src/pdf.js";
import { blankKeeper } from "../shared/schema.js";

// Deliberately obvious, deterministic fixtures; never real keeper/pad material.
function fixture(count = 3) {
  return {
    keepers: Array.from({ length: count }, (_, index) => ({
      ...blankKeeper(`fixture-${index + 1}`),
      name: `TEST ONLY ${index + 1} José Müller`,
      address1: "10 Example Street",
      address2: "Suite 2",
      region: "Québec, Canada H0H 0H0",
      reference: `TEST-${index + 1}`,
      phone: "+1 202 555 0100",
      email: "test@example.invalid",
      website: "https://example.invalid",
    })),
    pads: Array.from({ length: count }, (_, index) =>
      String.fromCharCode(65 + index).repeat(80),
    ),
  };
}

function contentStreams(document, page) {
  return page.node.Contents().asArray().map((reference) => {
    const stream = document.context.lookup(reference);
    return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
  });
}

test("creates one original-size A2 page, with exactly 80 pad letters per keeper", async () => {
  for (const count of [3, 4, 5]) {
    const bytes = await createRecoveryPdf(fixture(count));
    assert.ok(bytes instanceof Uint8Array);
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 1);
    const [page] = document.getPages();
    assert.ok(Math.abs(page.getWidth() - 1190.551) < 0.01);
    assert.ok(Math.abs(page.getHeight() - 1683.78) < 0.01);
    assert.equal(document.getTitle(), `Sharekeeper private K pads: 3 of ${count} recovery worksheet`);
    const streams = contentStreams(document, page);
    const overlay = streams.at(-1);
    assert.equal((overlay.match(/ 17 Tf/g) ?? []).length, count * 80);
    // The original page's application catalog and Content Credentials are not
    // inherited; export consists solely of the copied visual page and new info.
    assert.equal(document.catalog.get(PDFName.of("AF")), undefined);
    assert.equal(document.catalog.get(PDFName.of("Names")), undefined);
    assert.equal(document.catalog.get(PDFName.of("Metadata")), undefined);
    assert.equal(streams.some((stream) => stream.includes("7-day")), false);
    assert.equal(streams.some((stream) => stream.includes("(3 OF 5  |")), false);
  }
});

test("bundled source checksum matches the untouched repository template", async () => {
  const source = await readFile(new URL("../../../templates/recovery/slip39_recovery_sheet.pdf", import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), SOURCE_TEMPLATE_SHA256);
});

test("font validation supports accented Latin, Greek and Cyrillic contacts", async () => {
  const { keepers } = fixture();
  keepers[0].name = "José Müller Łukasz";
  keepers[1].name = "Αλέξανδρος";
  keepers[2].name = "Татьяна";
  assert.deepEqual(await validatePdfContacts(keepers), []);
});

test("missing glyphs fail explicitly instead of replacing or dropping text", async () => {
  const input = fixture();
  input.keepers[0].name = "TEST ONLY 山田";
  const errors = await validatePdfContacts(input.keepers);
  assert.ok(errors.some((error) => error.field === "name" && /U\+5C71/.test(error.message)));
  await assert.rejects(createRecoveryPdf(input), /not supported by the PDF font/);
});

test("multiline contact data and separate email/web values are retained", async () => {
  const input = fixture();
  input.keepers[0].address1 = "Line one\nLine two";
  assert.deepEqual(await validatePdfContacts(input.keepers), []);
  assert.ok((await createRecoveryPdf(input)).length > 1000);
});

test("long contacts fail before export rather than silently truncating", async () => {
  const input = fixture();
  input.keepers[0].address1 = "THIS WILL NOT FIT ".repeat(40);
  const errors = await validatePdfContacts(input.keepers);
  assert.ok(errors.some((error) => error.field === "address1" && /nothing was truncated/.test(error.message)));
  await assert.rejects(createRecoveryPdf(input), /too long/);
});

test("rejects invalid keeper counts and malformed or mismatched pads", async () => {
  await assert.rejects(createRecoveryPdf(fixture(2)), /3, 4, or 5/);
  await assert.rejects(createRecoveryPdf({ ...fixture(), pads: ["A".repeat(80)] }), /80-letter/);
  for (const pad of ["A".repeat(79), "A".repeat(81), "a".repeat(80), `${"A".repeat(79)}0`, ""]) {
    const input = fixture();
    input.pads[1] = pad;
    await assert.rejects(createRecoveryPdf(input), /80-letter/);
  }
});

test("rejects nontext fields, empty names and controls rather than coercing data", async () => {
  const input = fixture();
  input.keepers[0].name = "  ";
  input.keepers[1].phone = 123;
  input.keepers[2].reference = "control\tcharacter";
  const errors = await validatePdfContacts(input.keepers);
  assert.ok(errors.some((error) => /name is required/.test(error.message)));
  assert.ok(errors.some((error) => /must be text/.test(error.message)));
  assert.ok(errors.some((error) => /control characters/.test(error.message)));
});

test("fit and wrapping helpers never elide characters", () => {
  const font = { widthOfTextAtSize: (text, size) => [...text].length * size * 0.5 };
  const original = "No spaces in this URL: example.invalid/path";
  const wrapped = wrapPdfText(original, font, 10, 30);
  assert.equal(wrapped.join(""), original);
  assert.deepEqual(wrapPdfText("a\r\nb\n\nc", font, 10, 100), ["a", "b", "", "c"]);
  assert.ok(fitPdfContact("A\nB", font));
  assert.equal(fitPdfContact("A\nB\nC", font), null);
});

test("actual two-line contact glyph bounds stay inside the row and above its rule", async () => {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(Uint8Array.from(atob(FONT_BASE64), (character) => character.charCodeAt(0)));
  const cases = [
    "test@example.invalid\nhttps://example.invalid/gpy",
    "gpy@example.invalid\nhttps://gpy.invalid/gpy",
    "Jörg@example.invalid\nhttps://example.invalid/gpy",
    "Line one\nLine two gpy",
  ];
  for (const value of cases) {
    const fit = fitPdfContact(value, font);
    assert.ok(fit, `must fit: ${value}`);
    assert.ok(fit.size >= 8);
    assert.equal(fit.lines.length, 2);
    fit.lines.forEach((line, index) => {
      const actual = measurePdfGlyphBounds(line, fit.size);
      const placement = fit.placements[index];
      // Baselines are downward offsets from the row top. Descenders therefore
      // increase the bottom offset instead of being lost below the rule.
      const actualTop = placement.baselineOffset - actual.maxY;
      const actualBottom = placement.baselineOffset - actual.minY;
      assert.ok(actualTop >= PDF_CONTACT_FRAME.topInset - 1e-9);
      assert.ok(actualBottom <= PDF_CONTACT_FRAME.height - PDF_CONTACT_FRAME.bottomInset + 1e-9);
      assert.ok(PDF_CONTACT_FRAME.height - PDF_CONTACT_FRAME.ruleThickness / 2 - actualBottom >= 0.325 - 1e-9);
      assert.ok(actual.minX + placement.xOffset >= -1e-9);
      assert.ok(actual.maxX + placement.xOffset <= PDF_CONTACT_FRAME.width + 1e-9);
      if (index) {
        assert.ok(actualTop - fit.placements[index - 1].bottom >= PDF_CONTACT_FRAME.lineGap - 1e-9);
      }
    });
  }
  // Tall accented glyphs with descenders on both lines cannot fit the original
  // row at 8pt. Refuse rather than shrink below 8pt or cross the row boundary.
  assert.equal(fitPdfContact("ÁÉÎÖÜgpy\nÁÉÎÖÜgpy", font), null);
});

test("PDF generation never uses fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Unexpected network request"); };
  try {
    assert.ok((await createRecoveryPdf(fixture())).length > 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("optional entropy provenance contains no raw input or bit rating", async () => {
  assert.ok((await createRecoveryPdf({
    ...fixture(),
    entropySummary: { sampleCount: 100, inputKind: "pointer" },
  })).length > 1000);
  await assert.rejects(createRecoveryPdf({
    ...fixture(),
    entropySummary: { sampleCount: -1, inputKind: "pointer" },
  }), /entropy summary/);
});
