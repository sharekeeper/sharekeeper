import test from "node:test";
import assert from "node:assert/strict";
import { PDFDict, PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FONT_BASE64, SOURCE_TEMPLATE_SHA256, TEMPLATE_BASE64 } from "../src/pdf-assets.js";
import {
  CONTACT_FIELDS,
  createRecoveryPdf,
  fitPdfContact,
  measurePdfGlyphBounds,
  PAD_CELL,
  PAD_LETTER_SIZE,
  PDF_CONTACT_FRAME,
  TEMPLATE_CONTACT_ROWS,
  validatePdfContacts,
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
      region: "Québec H0H 0H0",
      reference: `TEST-${index + 1}`,
      phone: "+1 202 555 0100",
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

const SOURCE_URL = new URL("../../../templates/recovery/slip39_recovery_sheet.pdf", import.meta.url);

// The sheet drawing itself, wherever the template nests it (page content or a
// scaled form XObject), found independently of the generator's own locator.
function sheetStreams(document, resources, seen = new Set()) {
  const found = [];
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return found;
  for (const [, ref] of xobjects.entries()) {
    if (seen.has(String(ref))) continue;
    seen.add(String(ref));
    const stream = document.context.lookup(ref);
    const text = new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
    if (text.includes("SHAREKEEPER SLIP-39 RECOVERY SHEET")) found.push(text);
    found.push(...sheetStreams(document, stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), seen));
  }
  return found;
}

async function sourceStream() {
  const document = await PDFDocument.load(await readFile(SOURCE_URL));
  const page = document.getPages()[0];
  const streams = [...contentStreams(document, page).filter((text) => text.includes("SHAREKEEPER SLIP-39 RECOVERY SHEET")),
    ...sheetStreams(document, page.node.Resources())];
  assert.equal(streams.length, 1);
  return streams[0];
}

test("bundled template is the supplied sample PDF byte for byte", async () => {
  const source = await readFile(SOURCE_URL);
  assert.equal(SOURCE_TEMPLATE_SHA256, "8bc121acfea77e62f98d797141e3fe1108f9fe4b20218c72b6a611699bf9961d");
  assert.equal(createHash("sha256").update(source).digest("hex"), SOURCE_TEMPLATE_SHA256);
  const bundled = Uint8Array.from(atob(TEMPLATE_BASE64), (character) => character.charCodeAt(0));
  assert.equal(createHash("sha256").update(bundled).digest("hex"), SOURCE_TEMPLATE_SHA256);
});

test("the template's contact rows and pad cells are where the generator writes", async () => {
  const original = await sourceStream();
  const rules = [...original.matchAll(/^n ([\d.]+) ([\d.]+) m 335 \2 l S$/gm)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
  assert.equal(rules.length, 35);
  for (let slot = 0; slot < 5; slot += 1) {
    for (const row of TEMPLATE_CONTACT_ROWS) {
      assert.ok(rules.some(({ x, y }) => Math.abs(x - row.ruleStart) < 0.01 && Math.abs(y - (row.ruleY - slot * 200)) < 0.001),
        `${row.label} rule, slot ${slot + 1}`);
    }
  }
  for (const row of TEMPLATE_CONTACT_ROWS) {
    assert.equal(original.split(`(${row.label}:)`).length - 1, 5, row.label);
  }
  const padCells = [...original.matchAll(/^n ([\d.]+) ([\d.]+) 16 26 re S$/gm)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
  assert.equal(padCells.length, 400);
  padCells.forEach((cell, index) => {
    const slot = Math.floor(index / 80);
    const group = Math.floor((index % 80) / 4);
    assert.ok(Math.abs(cell.x - (PAD_CELL.x + (group % 10) * PAD_CELL.groupPitch + (index % 4) * PAD_CELL.width)) < 0.001);
    assert.ok(Math.abs(cell.y - (PAD_CELL.y - Math.floor(group / 10) * PAD_CELL.rowPitch - slot * 200)) < 0.001);
  });
});

test("3/4/5 exports reproduce the template page unchanged and only fill contacts and pads", async () => {
  const original = await sourceStream();
  for (const count of [3, 4, 5]) {
    const input = fixture(count);
    input.keepers[0].reference = "  Exact CASE / ref.  ";
    input.keepers[0].website = "https://gpy.invalid/gpy";
    const bytes = await createRecoveryPdf(input);
    assert.ok(bytes instanceof Uint8Array);
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 1);
    const [page] = document.getPages();
    assert.equal(page.getWidth(), 612);
    assert.equal(page.getHeight(), 792);
    assert.equal(document.getTitle(), `Sharekeeper SLIP-39 recovery sheet: 3 of ${count}`);
    // The original application catalog and Content Credentials are not inherited.
    assert.equal(document.catalog.get(PDFName.of("AF")), undefined);
    assert.equal(document.catalog.get(PDFName.of("Names")), undefined);
    const streams = contentStreams(document, page);
    const templateStreams = sheetStreams(document, page.node.Resources());
    assert.equal(templateStreams.length, 1);
    assert.equal(streams.some((stream) => stream.includes("SHAREKEEPER SLIP-39 RECOVERY SHEET")), false);
    assert.equal(templateStreams[0], original.replace("(3 OF 5  |", `(3 OF ${count}  |`));
    const overlay = streams.at(-1);
    // Overlay values are drawn in the sheet's own coordinates through the
    // template's form matrix, so each value lands in its scaled box.
    assert.match(overlay, /^q\n0\.4836 0 0 0\.4836 18\.10608 -24\.93408 cm\n/);
    assert.match(overlay, /\nQ\n?$/);
    const runs = overlayTextRuns(document, page, overlay);
    const padRuns = runs.filter(({ size }) => size === PAD_LETTER_SIZE);
    const contactRuns = runs.filter(({ size }) => size !== PAD_LETTER_SIZE);
    assert.equal(padRuns.length, count * 80);
    input.pads.forEach((pad, index) => {
      const letters = padRuns.slice(index * 80, (index + 1) * 80);
      assert.equal(letters.map(({ value }) => value).join(""), pad);
      letters.forEach((run, letter) => {
        const group = Math.floor(letter / 4);
        const cellX = PAD_CELL.x + (group % 10) * PAD_CELL.groupPitch + (letter % 4) * PAD_CELL.width;
        const cellY = PAD_CELL.y - Math.floor(group / 10) * PAD_CELL.rowPitch - index * 200;
        const bounds = measurePdfGlyphBounds(run.value, run.size);
        assert.ok(run.x + bounds.minX > cellX + 0.3 && run.x + bounds.maxX < cellX + PAD_CELL.width - 0.3, `letter inside cell ${letter}`);
        assert.ok(run.y + bounds.minY > cellY + 0.3 && run.y + bounds.maxY < cellY + PAD_CELL.height - 0.3);
      });
    });
    // Exactly the seven template fields per keeper, in template order, nothing else.
    const expected = input.keepers.flatMap((keeper) => CONTACT_FIELDS.map((field) => keeper[field]).filter(Boolean));
    assert.deepEqual(contactRuns.map(({ value }) => value), expected);
    input.keepers.forEach((keeper, slot) => {
      const rows = TEMPLATE_CONTACT_ROWS.filter((row) => keeper[row.field]);
      rows.forEach((row) => {
        const run = contactRuns.find(({ value, y }) => value === keeper[row.field] &&
          Math.abs(y - (row.ruleY - slot * 200 + PDF_CONTACT_FRAME.baselineAboveRule)) < 1e-6);
        assert.ok(run, `${row.label} on its rule for keeper ${slot + 1}`);
        const bounds = measurePdfGlyphBounds(run.value, run.size);
        assert.ok(run.size >= PDF_CONTACT_FRAME.minSize && run.size <= PDF_CONTACT_FRAME.maxSize);
        assert.ok(run.x + bounds.minX >= row.ruleStart + PDF_CONTACT_FRAME.textInset - 1e-6);
        assert.ok(run.x + bounds.maxX <= 335 - PDF_CONTACT_FRAME.rightInset + 1e-6);
        assert.ok(run.y + bounds.maxY <= row.ruleY - slot * 200 + PDF_CONTACT_FRAME.inkAboveRule + 1e-6);
        assert.ok(run.y + bounds.minY >= row.ruleY - slot * 200 - PDF_CONTACT_FRAME.inkBelowRule - 1e-6);
      });
    });
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

test("line breaks are rejected because each template row holds one line", async () => {
  const input = fixture();
  input.keepers[0].address1 = "Line one\nLine two";
  const errors = await validatePdfContacts(input.keepers);
  assert.ok(errors.some((error) => error.field === "address1" && /one line/.test(error.message)));
  await assert.rejects(createRecoveryPdf(input), /one line/);
});

test("long contacts fail before export rather than silently truncating", async () => {
  const input = fixture();
  input.keepers[0].region = "Springfield, Illinois 62701, United States of America";
  const errors = await validatePdfContacts(input.keepers);
  assert.ok(errors.some((error) => error.field === "region" && /nothing was truncated/.test(error.message)));
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

test("contact fit uses actual ink, stays on one line and never elides", async () => {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(Uint8Array.from(atob(FONT_BASE64), (character) => character.charCodeAt(0)));
  const region = TEMPLATE_CONTACT_ROWS.find((row) => row.field === "region");
  const name = TEMPLATE_CONTACT_ROWS.find((row) => row.field === "name");
  const fit = fitPdfContact("Springfield, IL 62701 USA", font, region);
  assert.ok(fit && fit.size >= 7 && fit.size < 11);
  assert.equal(fitPdfContact("ÁÉÎÖÜ gpy Example Title Company", font, name).size, 11);
  assert.equal(fitPdfContact("A\nB", font, name), null);
  assert.equal(fitPdfContact("X".repeat(80), font, region), null);
});

test("adjacent rows cannot overlap, even with deep descenders and tall accents", async () => {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(Uint8Array.from(atob(FONT_BASE64), (character) => character.charCodeAt(0)));
  const frame = PDF_CONTACT_FRAME;
  assert.ok(frame.rowPitch - frame.inkBelowRule > frame.inkAboveRule);
  const samples = ["gpy jÿ Example", "\u06B8".repeat(20), "\u1EAA".repeat(12), "ÁÉÎÖÜ gpy", "Ẫ ǅ ḯ ỹ ŷ ẘ"];
  for (const row of TEMPLATE_CONTACT_ROWS) {
    for (const value of samples) {
      if ([...value].some((character) => !font.getCharacterSet().includes(character.codePointAt(0)))) continue;
      const fit = fitPdfContact(value, font, row);
      if (!fit) continue;
      const bounds = measurePdfGlyphBounds(value, fit.size);
      assert.ok(fit.y + bounds.minY >= row.ruleY - frame.inkBelowRule - 1e-9, `${row.label}: ${value} bottom`);
      assert.ok(fit.y + bounds.maxY <= row.ruleY + frame.inkAboveRule + 1e-9, `${row.label}: ${value} top`);
    }
  }
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
  const bytes = await createRecoveryPdf({ ...fixture(), entropySummary: { sampleCount: 100, inputKind: "pointer" } });
  const document = await PDFDocument.load(bytes);
  assert.doesNotMatch(document.getSubject(), /pointer|\b100\b|samples/);
  await assert.rejects(createRecoveryPdf({
    ...fixture(),
    entropySummary: { sampleCount: -1, inputKind: "pointer" },
  }), /entropy summary/);
});
