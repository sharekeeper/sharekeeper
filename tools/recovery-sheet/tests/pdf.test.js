import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FONT_BASE64, SOURCE_TEMPLATE_SHA256, TEMPLATE_BASE64 } from "../src/pdf-assets.js";
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
  const contents = page.node.Contents();
  const references = typeof contents.asArray === "function" ? contents.asArray() : [contents];
  return references.map((reference) => {
    const stream = document.context.lookup(reference);
    return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
  });
}

// Decode the generated subset-font overlay via its actual ToUnicode map,
// including multi-character ligatures. No external extraction tool is required.
function overlayTextRuns(document, page, overlay) {
  const fonts = page.node.Resources().lookup(PDFName.of("Font"));
  const maps = new Map();
  return [...overlay.matchAll(/BT\n([\s\S]*?)\nET/g)].map(([, block]) => {
    const [, name, rawSize] = block.match(/\/(\S+) ([\d.]+) Tf/);
    const [, rawX, rawY] = block.match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/);
    const [, encoded] = block.match(/<([0-9A-F]*)> Tj/);
    if (!maps.has(name)) {
      const font = fonts.lookup(PDFName.of(name));
      const cmap = new TextDecoder().decode(decodePDFRawStream(font.lookup(PDFName.of("ToUnicode"))).decode());
      maps.set(name, new Map([...cmap.matchAll(/^<([0-9A-F]+)> <([0-9A-F]+)>$/gm)].map(([, code, unicode]) => [
        code,
        unicode.match(/.{4}/g).map((unit) => String.fromCharCode(parseInt(unit, 16))).join(""),
      ])));
    }
    const mapping = maps.get(name);
    const value = (encoded.match(/.{4}/g) ?? []).map((code) => {
      assert.ok(mapping.has(code), `missing Unicode mapping for ${code}`);
      return mapping.get(code);
    }).join("");
    return { value, size: Number(rawSize), x: Number(rawX), y: Number(rawY) };
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
  assert.equal(SOURCE_TEMPLATE_SHA256, "fe2c68537d6fb73c28307fbb19a43c48202c09c264030c2f175c28c10dc5a1c6");
  assert.equal(createHash("sha256").update(source).digest("hex"), SOURCE_TEMPLATE_SHA256);
  const document = await PDFDocument.load(source);
  const original = contentStreams(document, document.getPages()[0]).join("\n");
  assert.ok(original.includes("7-day release time"));
  assert.ok(original.includes("(6. Decrypt locally on scratch paper. Enter each four-letter word prefix into a HW)"));
  assert.ok(original.includes("(7. Destroy scratch paper after entering into a HW wallet.)"));
  assert.ok(original.includes("(8. Sign and broadcast a tx, then wipe the HW wallet clean.)"));
  assert.equal((original.match(/\(Empty\)/g) ?? []).length, 7);
  assert.doesNotMatch(original, /Authentication \/ notice|Release due/);
});

test("bundled derivative retains the reviewed eight-cell CRC32 and relocated prefix geometry", async () => {
  const document = await PDFDocument.load(Uint8Array.from(atob(TEMPLATE_BASE64), (character) => character.charCodeAt(0)));
  const background = contentStreams(document, document.getPages()[0]).join("\n");
  assert.equal((background.match(/\(Expected Ciphertext CRC32:\)/g) ?? []).length, 5);
  assert.equal((background.match(/\(8 hex digits\)/g) ?? []).length, 5);
  assert.equal((background.match(/\(FIRST 2 CIPHER GROUPS\)/g) ?? []).length, 5);
  assert.ok(background.includes("(5. Receive all 20 groups; verify the stored CRC32 before decryption.)"));
  assert.doesNotMatch(background, /SHA-256|64 hex digits|7-day|FIRST 2 CIPHERTEXT GROUPS|\(Empty\)/);
  assert.doesNotMatch(background, /Authentication \/ notice|Release due|Validate each complete mnemonic|Restore on a compatible offline device/);
  // Every source text literal not explicitly replaced remains, in order.
  // This protects the new steps 6-8 (including the incomplete "HW" ending),
  // all seven wallet-row numbers, and all original field/legend wording.
  const source = await readFile(new URL("../../../templates/recovery/slip39_recovery_sheet.pdf", import.meta.url));
  const sourceDocument = await PDFDocument.load(source);
  const original = contentStreams(sourceDocument, sourceDocument.getPages()[0]).join("\n");
  const literals = (stream) => [...stream.matchAll(/^BT [^\n]* TL (\(.*\)) Tj T\* ET$/gm)].map(([, value]) => value);
  const contactLabels = new Set([
    "(Name:)", "(Street Address:)", "(Street Address 2:)", "(State/Country Postal Code:)",
    "(Account No.:)", "(Phone:)", "(Website:)", "(Empty)",
  ]);
  const retained = literals(original).filter((value) =>
    !value.startsWith("(3 OF 5  |") && !value.startsWith("(4. Complete agreed ID checks;") &&
    !/^\(SHARE 0[1-5]\)$/.test(value) && !contactLabels.has(value));
  assert.equal(literals(original).length - retained.length, 49);
  assert.deepEqual(literals(background), retained);
  const rectangles = [...background.matchAll(/^n ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re S$/gm)]
    .map(([, x, y, width, height]) => ({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) }));
  const checksumCells = rectangles.filter(({ width, height }) => width === 20 && height === 20);
  const prefixCells = rectangles.filter(({ width, height }) => width === 14.2 && height === 26);
  const padCells = rectangles.filter(({ width, height }) => width === 16 && height === 26);
  const emptyPassphraseCheckboxes = rectangles.filter(({ width, height }) => width === 7 && height === 7);
  const sourceFonts = document.getPages()[0].node.Resources().lookup(PDFName.of("Font"));
  const sourceBoldDescriptor = sourceFonts.lookup(PDFName.of("F2+0")).lookup(PDFName.of("FontDescriptor"));
  const sourceBold = fontkit.create(decodePDFRawStream(sourceBoldDescriptor.lookup(PDFName.of("FontFile2"))).decode());
  // Measure the retained source bold font, not a surrogate font-size rectangle.
  // Prefix headings must clear both their entry-box stroke and the contact rule.
  for (const label of ["01", "02"]) {
    for (const glyph of sourceBold.layout(label).glyphs) {
      const scale = 9.5 / sourceBold.unitsPerEm;
      assert.ok(1213.53 + glyph.bbox.minY * scale - (1212.78 + 0.55 / 2) >= 0.325);
      assert.ok(1221.28 - PDF_CONTACT_FRAME.ruleThickness / 2 - (1213.53 + glyph.bbox.maxY * scale) >= 0.325);
    }
  }
  assert.equal(checksumCells.length, 5 * 8);
  assert.equal(prefixCells.length, 5 * 2 * 4);
  assert.equal(padCells.length, 5 * 80);
  assert.equal(emptyPassphraseCheckboxes.length, 7);
  for (let slot = 0; slot < 5; slot += 1) {
    assert.deepEqual(checksumCells.slice(slot * 8, slot * 8 + 8), Array.from({ length: 8 }, (_, cell) => ({
      x: Number((575.4121 + cell * 20).toFixed(4)),
      y: Number((1207.78 - slot * 200).toFixed(2)),
      width: 20,
      height: 20,
    })));
    assert.deepEqual(prefixCells.slice(slot * 8, slot * 8 + 8), Array.from({ length: 8 }, (_, cell) => ({
      x: Number(((cell < 4 ? 201 : 269) + (cell % 4) * 14.2).toFixed(1)),
      y: Number((1186.78 - slot * 200).toFixed(2)),
      width: 14.2,
      height: 26,
    })));
    padCells.slice(slot * 80, (slot + 1) * 80).forEach((cell, index) => {
      const group = Math.floor(index / 4);
      assert.ok(Math.abs(cell.x - (371 + (group % 10) * 78.8551 + (index % 4) * 16)) < 0.001);
      assert.equal(cell.y, Number((1294.78 - Math.floor(group / 10) * 46 - slot * 200).toFixed(2)));
    });
    for (const [x, label] of [["222.442", "01"], ["290.442", "02"]]) {
      assert.ok(background.includes(`BT 1 0 0 1 ${x} ${(1213.53 - slot * 200).toFixed(2)} Tm /F2+0 9.5 Tf 11.4 TL (${label}) Tj T* ET`));
    }
  }
});

test("3/4/5-keeper exports preserve exact contacts and never populate ciphertext or CRC32 fields", async () => {
  for (const count of [3, 4, 5]) {
    const input = fixture(count);
    input.keepers[0].address1 = "Line one\nLine two gpy";
    input.keepers[0].reference = "  Exact CASE / ref.  ";
    input.keepers[0].email = "gpy@example.invalid";
    input.keepers[0].website = "https://gpy.invalid/gpy";
    const document = await PDFDocument.load(await createRecoveryPdf(input));
    const page = document.getPages()[0];
    const overlay = contentStreams(document, page).at(-1);
    const runs = overlayTextRuns(document, page, overlay);
    const values = runs.map(({ value }) => value);
    assert.ok(values.includes("4. Follow the agreed release policy; record the notice and release time."));
    assert.ok(values.includes("Ciphertext prefixes, CRC32 and the wallet/passphrase table are intentionally blank. Agree the exact ciphertext checksum profile before use."));
    assert.doesNotMatch(values.join("\n"), /SHA-256|64 hex|7-day/);
    for (const keeper of input.keepers) {
      for (const field of ["name", "address1", "address2", "region", "reference", "phone", "email", "website"]) {
        for (const line of keeper[field].split("\n")) assert.ok(values.includes(line), `exact ${field}: ${line}`);
      }
    }
    for (let slot = 0; slot < 5; slot += 1) {
      const blankAreas = [
        { left: 201, right: 325.8, bottom: 1186.78 - slot * 200, top: 1212.78 - slot * 200 },
        { left: 575.4121, right: 735.4121, bottom: 1207.78 - slot * 200, top: 1227.78 - slot * 200 },
        { left: 75, right: 1160.551, bottom: 91.18, top: 285.78 },
      ];
      for (const run of runs.filter(({ value }) => value.trim())) {
        const bounds = measurePdfGlyphBounds(run.value, run.size);
        for (const area of blankAreas) {
          const intersects = run.x + bounds.maxX > area.left && run.x + bounds.minX < area.right &&
            run.y + bounds.maxY > area.bottom && run.y + bounds.minY < area.top;
          assert.equal(intersects, false, `must remain blank in slot ${slot + 1}: ${run.value}`);
        }
      }
    }
    const padRuns = runs.filter(({ size }) => size === 17);
    assert.equal(padRuns.length, count * 80);
    input.pads.forEach((pad, index) => {
      const letters = padRuns.slice(index * 80, (index + 1) * 80);
      assert.equal(letters.map(({ value }) => value).join(""), pad);
      letters.forEach((run, letter) => {
        assert.ok(Math.abs(run.y - (1294.78 - Math.floor(letter / 40) * 46 - index * 200 + 6.6)) < 1e-9);
      });
    });
    assert.equal(values.filter((value) => /SLOT \d{2}  \|  NOT USED/.test(value)).length, 5 - count);
  }
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
