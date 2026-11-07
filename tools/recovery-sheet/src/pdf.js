import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_BASE64, TEMPLATE_BASE64 } from "./pdf-assets.js";
import { KEEPER_COUNTS, PAD_LENGTH } from "../shared/schema.js";

const INK = rgb(0.094118, 0.184314, 0.247059);
const TEAL = rgb(0.078431, 0.466667, 0.509804);
const MUTED = rgb(0.34902, 0.427451, 0.490196);
const RULE = rgb(0.72549, 0.784314, 0.827451);
const WHITE = rgb(1, 1, 1);
const FIELD_KEYS = ["name", "address1", "address2", "region", "reference", "phone", "email", "website"];
const ROWS = [
  { field: "name", label: "Name" },
  { field: "address1", label: "Street address" },
  { field: "address2", label: "Address line 2" },
  { field: "region", label: "Region / postal" },
  { field: "reference", label: "Account / ref." },
  { field: "phone", label: "Phone" },
  { field: "emailWebsite", label: "Email / web" },
];
const CONTACT_WIDTH = 190;
const CONTACT_ROW_HEIGHT = 17;
export const PDF_CONTACT_FRAME = Object.freeze({
  width: CONTACT_WIDTH,
  height: CONTACT_ROW_HEIGHT,
  topInset: 0.5,
  bottomInset: 0.5,
  lineGap: 0.5,
  ruleThickness: 0.35,
});
let glyphMetricFont;

function decodeBase64(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function requireKeepers(keepers) {
  if (!Array.isArray(keepers) || !KEEPER_COUNTS.includes(keepers.length)) {
    throw new Error("PDF export requires exactly 3, 4, or 5 keepers.");
  }
}

function contactRows(keeper) {
  return ROWS.map((row) => ({
    ...row,
    value: row.field === "emailWebsite"
      ? [keeper.email, keeper.website].filter((value) => value !== "").join("\n")
      : keeper[row.field],
  }));
}

/**
 * Preserve explicit line breaks. Wrap without elision, including long unbroken
 * URLs; never abbreviate, transliterate, or silently discard a contact character.
 */
export function wrapPdfText(text, font, size, maxWidth) {
  const result = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        result.push(line);
        line = character;
      } else {
        line = candidate;
      }
      if (font.widthOfTextAtSize(line, size) > maxWidth) return null;
    }
    result.push(line);
  }
  return result;
}

/** Actual shaped glyph-ink bounds, in PDF points relative to the baseline. */
export function measurePdfGlyphBounds(text, size) {
  glyphMetricFont ??= fontkit.create(decodeBase64(FONT_BASE64));
  const run = glyphMetricFont.layout(text);
  const scale = size / glyphMetricFont.unitsPerEm;
  let penX = 0;
  let penY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index];
    const box = glyph.bbox;
    if (Number.isFinite(box.minX) && Number.isFinite(box.minY) &&
        (box.maxX !== box.minX || box.maxY !== box.minY)) {
      const x = penX + position.xOffset;
      const y = penY + position.yOffset;
      minX = Math.min(minX, x + box.minX);
      maxX = Math.max(maxX, x + box.maxX);
      minY = Math.min(minY, y + box.minY);
      maxY = Math.max(maxY, y + box.maxY);
    }
    penX += position.xAdvance;
    penY += position.yAdvance;
  });
  if (!Number.isFinite(minY)) {
    // Give an intentional empty/space-only line a normal line slot, without
    // inventing visible ink or collapsing a user-specified line break.
    const empty = measurePdfGlyphBounds("Mg", size);
    return { minX: 0, maxX: penX * scale, minY: empty.minY, maxY: empty.maxY };
  }
  return {
    minX: minX * scale,
    maxX: Math.max(maxX, penX) * scale,
    minY: minY * scale,
    maxY: maxY * scale,
  };
}

export function fitPdfContact(text, font) {
  // At least 8pt, at most two lines. Fit actual shaped ink, not font-size boxes:
  // ordinary 8pt email/web lines are 7.7422pt high, including descenders.
  const frame = PDF_CONTACT_FRAME;
  const usableHeight = frame.height - frame.topInset - frame.bottomInset;
  for (let size = 11; size >= 8; size -= 0.25) {
    const lines = wrapPdfText(text, font, size, CONTACT_WIDTH);
    if (!lines || lines.length > 2) continue;
    const metrics = lines.map((line) => measurePdfGlyphBounds(line, size));
    if (metrics.some((bounds) => bounds.maxX - Math.min(0, bounds.minX) > frame.width)) continue;
    const totalHeight = metrics.reduce((sum, bounds) => sum + bounds.maxY - bounds.minY, 0) +
      frame.lineGap * (lines.length - 1);
    if (totalHeight > usableHeight) continue;
    let cursor = frame.topInset + (usableHeight - totalHeight) / 2;
    const placements = metrics.map((bounds) => {
      const baselineOffset = cursor + bounds.maxY;
      const placement = {
        ...bounds,
        baselineOffset,
        xOffset: -Math.min(0, bounds.minX),
        top: cursor,
        bottom: baselineOffset - bounds.minY,
      };
      cursor = placement.bottom + frame.lineGap;
      return placement;
    });
    return { lines, size, placements, frame };
  }
  return null;
}

function validateAndLayout(keepers, font) {
  requireKeepers(keepers);
  const supported = new Set(font.getCharacterSet());
  const errors = [];
  const layouts = keepers.map((keeper, index) => {
    const error = (field, message) => errors.push({
      keeperId: keeper?.id,
      index,
      field,
      message: `Keeper ${index + 1}: ${message}`,
    });
    if (!keeper || typeof keeper !== "object") {
      error("name", "contact record is missing.");
      return [];
    }
    let invalid = false;
    for (const field of FIELD_KEYS) {
      const value = keeper[field];
      if (typeof value !== "string") {
        error(field, `${field} must be text.`);
        invalid = true;
        continue;
      }
      const unsupported = [...new Set([...value].filter((character) => {
        const codePoint = character.codePointAt(0);
        return character !== "\n" && character !== "\r" && !supported.has(codePoint);
      }))];
      if (unsupported.length) {
        const codePoints = unsupported.map((character) =>
          `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
        ).join(", ");
        error(field, `${field} contains characters not supported by the PDF font (${codePoints}). Use a supported spelling; no characters were discarded.`);
        invalid = true;
      }
      if (/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
        error(field, `${field} contains unsupported control characters.`);
        invalid = true;
      }
    }
    if (typeof keeper.name === "string" && !keeper.name.trim()) {
      error("name", "a keeper name is required.");
    }
    if (invalid) return [];
    return contactRows(keeper).map((row) => {
      const fit = fitPdfContact(row.value, font);
      if (!fit) {
        error(row.field, `${row.label} is too long for the original PDF contact area. Shorten it or use the separate address lines; nothing was truncated.`);
      }
      return { ...row, fit };
    });
  });
  return { errors, layouts };
}

async function documentAndFont() {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(decodeBase64(FONT_BASE64), { subset: true });
  return { document, font };
}

/** Check export-only glyph and original-template fit constraints, without pads. */
export async function validatePdfContacts(keepers) {
  const { font } = await documentAndFont();
  return validateAndLayout(keepers, font).errors;
}

function text(page, font, value, x, y, size, color = INK) {
  page.drawText(value, { x, y, size, font, color });
}

function drawContacts(page, font, rows, offset) {
  // Keep the source's seven-row contact geometry, but allow wider values and an
  // Email/web row. The background has no obsolete labels below this overlay.
  page.drawRectangle({ x: 41, y: 1214.78 - offset, width: 297, height: 121, color: WHITE });
  rows.forEach((row, index) => {
    const top = 1334.28 - offset - index * CONTACT_ROW_HEIGHT;
    text(page, font, row.label, 43, top - 10.7, 8.4, MUTED);
    const fit = row.fit;
    fit.lines.forEach((line, lineIndex) => {
      const placement = fit.placements[lineIndex];
      text(page, font, line, 145 + placement.xOffset, top - placement.baselineOffset, fit.size);
    });
    page.drawLine({
      start: { x: 145, y: top - CONTACT_ROW_HEIGHT },
      end: { x: 335, y: top - CONTACT_ROW_HEIGHT },
      thickness: PDF_CONTACT_FRAME.ruleThickness,
      color: RULE,
    });
  });
}

function drawPad(page, font, pad, offset) {
  // Measured original source rectangles: 16x26pt cells; ten groups per row,
  // two rows; columns are 78.8551pt apart. One letter is centered in each box.
  for (let index = 0; index < PAD_LENGTH; index += 1) {
    const group = Math.floor(index / 4);
    const column = group % 10;
    const row = Math.floor(group / 10);
    const cellX = 371 + column * 78.8551 + (index % 4) * 16;
    const cellY = 1290.78 - row * 50 - offset;
    const size = 17;
    const width = font.widthOfTextAtSize(pad[index], size);
    text(page, font, pad[index], cellX + (16 - width) / 2, cellY + 6.6, size);
  }
}

/**
 * Generate a one-page A2 private-K recovery worksheet entirely in browser
 * memory. Contacts and pads are never fetched, persisted, logged, or uploaded.
 * This creates no mnemonic, ciphertext, authentication prefixes, or hash.
 */
export async function createRecoveryPdf({ keepers, pads, entropySummary }) {
  requireKeepers(keepers);
  if (!Array.isArray(pads) || pads.length !== keepers.length ||
      pads.some((pad) => typeof pad !== "string" || !/^[A-Z]{80}$/.test(pad))) {
    throw new Error("PDF export requires one exact 80-letter uppercase A–Z pad per keeper.");
  }
  if (entropySummary !== undefined &&
      (!entropySummary || !Number.isSafeInteger(entropySummary.sampleCount) ||
       entropySummary.sampleCount < 1 || typeof entropySummary.inputKind !== "string")) {
    throw new Error("PDF entropy summary must contain a positive sampleCount and inputKind text, never raw entropy data.");
  }
  const { document, font } = await documentAndFont();
  const { errors, layouts } = validateAndLayout(keepers, font);
  if (errors.length) {
    const error = new Error(errors.map((item) => item.message).join("\n"));
    error.contactErrors = errors;
    throw error;
  }

  const background = await PDFDocument.load(decodeBase64(TEMPLATE_BASE64), { updateMetadata: false });
  const [page] = await document.copyPages(background, [0]);
  document.addPage(page);
  document.setTitle(`Sharekeeper private K pads: 3 of ${keepers.length} recovery worksheet`);
  document.setAuthor("Perplexity Computer");
  document.setSubject("Unaudited prototype; private 80-letter K pads only. No ciphertext or mnemonic generated.");
  document.setCreator("Sharekeeper browser-only recovery-sheet tool");
  document.setProducer("pdf-lib / Sharekeeper");
  document.setKeywords(["Sharekeeper", "private K pads", "prototype", "80 letters", "20 groups of 4"]);

  text(page, font, `3 OF ${keepers.length}  |  PRIVATE K PADS  |  80 LETTERS / 20 x 4`, 698, 1628.78, 11.1, TEAL);
  text(page, font, "4. Follow the agreed release policy; record the notice and release time.", 43, 1494.78, 11.1);
  text(page, font, "PRIVATE K PADS: 80 A-Z letters per keeper, arranged as 20 groups x 4. Keep separate from ciphertext.", 43, 1466.78, 11.4, TEAL);
  text(page, font, "Prototype, not audited. No ciphertext or mnemonic generated. No fixed release delay has been verified.", 43, 1449.78, 10.6, MUTED);

  for (let index = 0; index < 5; index += 1) {
    const offset = index * 212;
    if (index >= keepers.length) {
      // No fake contacts, pad letters, authentication values, or hashes.
      page.drawRectangle({ x: 31, y: 1166.78 - offset, width: 1128.5, height: 201, color: WHITE });
      text(page, font, `SLOT ${String(index + 1).padStart(2, "0")}  |  NOT USED`, 43, 1349.78 - offset, 14, MUTED);
      text(page, font, `This worksheet uses 3 of ${keepers.length} keepers. No pad or contact is assigned to this slot.`, 371, 1280.78 - offset, 12, MUTED);
      continue;
    }
    text(page, font, `KEEPER ${String(index + 1).padStart(2, "0")}  |  K (PRIVATE PAD)`, 43, 1349.78 - offset, 12, TEAL);
    drawContacts(page, font, layouts[index], offset);
    drawPad(page, font, pads[index], offset);
  }

  text(page, font, "Ciphertext prefixes, SHA-256 and the wallet/passphrase table are intentionally blank. Agree the exact ciphertext hash encoding before use.", 30, 42, 9.6, MUTED);
  text(page, font, "Sensitive: retain privately and print securely. The modified worksheet does not preserve or claim the source PDF's Content Credentials.", 30, 27, 9.6, MUTED);
  if (entropySummary !== undefined) {
    // Deliberately fixed wording: never interpolate raw user-input data or
    // convert movement counts/timing into an unsupported entropy-bit rating.
    text(page, font, "Browser CSPRNG + user movement/timing; HKDF-SHA-256; input is not bit-rated.", 30, 12, 9.6, MUTED);
  }
  return document.save({ useObjectStreams: true });
}
