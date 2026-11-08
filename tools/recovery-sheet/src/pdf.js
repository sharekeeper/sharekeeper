import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, concatTransformationMatrix,
  decodePDFRawStream, popGraphicsState, pushGraphicsState, rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_BASE64, TEMPLATE_BASE64 } from "./pdf-assets.js";
import { KEEPER_COUNTS, PAD_LENGTH } from "../shared/schema.js";

// The bundled template is the supplied sample PDF, byte for byte. Its page is
// reproduced unchanged; the generator only writes values into blank fields.
// Field geometry below is in the coordinates of the sheet's own content stream
// (the original A2 drawing). When the template places that drawing inside a
// scaled form XObject (the US Letter revision), the overlay uses the same
// transform, read from the template, so every value lands in its box.
// Ink colour of the template's own body text.
const INK = rgb(0.094118, 0.184314, 0.247059);
const KEEPER_STRIDE = 200;
const HEADER_LITERAL = "(3 OF 5  |";

/**
 * The template's seven contact rows, measured from the source content stream:
 * each label is followed by a 0.65pt rule that starts after the label and ends
 * at x=335. Rows are 14.5pt apart. Values are written on those rules.
 */
export const TEMPLATE_CONTACT_ROWS = Object.freeze([
  { field: "name", label: "Name", ruleStart: 91.45, ruleY: 1322.78 },
  { field: "address1", label: "Street Address", ruleStart: 144.85, ruleY: 1308.28 },
  { field: "address2", label: "Street Address 2", ruleStart: 156.3, ruleY: 1293.78 },
  { field: "region", label: "State/Country Postal Code", ruleStart: 214.09, ruleY: 1279.28 },
  { field: "reference", label: "Account No.", ruleStart: 128.65, ruleY: 1264.78 },
  { field: "phone", label: "Phone", ruleStart: 93.21, ruleY: 1250.28 },
  { field: "website", label: "Website", ruleStart: 104.58, ruleY: 1235.78 },
].map(Object.freeze));
export const CONTACT_FIELDS = TEMPLATE_CONTACT_ROWS.map((row) => row.field);
const RULE_END = 335;
export const PDF_CONTACT_FRAME = Object.freeze({
  rowPitch: 14.5,
  ruleThickness: 0.65,
  textInset: 2,
  rightInset: 1,
  baselineAboveRule: 2,
  maxSize: 11,
  minSize: 7,
  // Each row's ink must stay within [rule - 1, rule + 13]. Adjacent rows are
  // 14.5pt apart, so neighbouring bands are separated by 0.5pt and can never
  // overlap, whatever accents or descenders a supported script uses.
  inkBelowRule: 1,
  inkAboveRule: 13,
});
// Pad cells: 16 x 26pt, ten groups of four per row, two rows 46pt apart,
// groups 78.8551pt apart; first cell bottom-left at (371, 1294.78).
export const PAD_CELL = Object.freeze({ x: 371, y: 1294.78, width: 16, height: 26, groupPitch: 78.8551, rowPitch: 46 });
export const PAD_LETTER_SIZE = 15;
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

/** Actual shaped glyph-ink bounds, in PDF points relative to the baseline. */
export function measurePdfGlyphBounds(text, size) {
  glyphMetricFont ??= fontkit.create(decodeBase64(FONT_BASE64));
  const run = glyphMetricFont.layout(text);
  const scale = size / glyphMetricFont.unitsPerEm;
  let penX = 0;
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
      minX = Math.min(minX, x + box.minX);
      maxX = Math.max(maxX, x + box.maxX);
      minY = Math.min(minY, position.yOffset + box.minY);
      maxY = Math.max(maxY, position.yOffset + box.maxY);
    }
    penX += position.xAdvance;
  });
  if (!Number.isFinite(minY)) return { minX: 0, maxX: penX * scale, minY: 0, maxY: 0 };
  return { minX: minX * scale, maxX: Math.max(maxX, penX) * scale, minY: minY * scale, maxY: maxY * scale };
}

/**
 * Fit one value on its template row: a single line, largest size from 11pt
 * down to 7pt whose actual ink stays between the rule start and x=335 and
 * inside the row band, so it cannot touch the rows above or below. Returns null instead of truncating or wrapping.
 */
export function fitPdfContact(text, font, row) {
  const frame = PDF_CONTACT_FRAME;
  if (text === "") return { size: frame.maxSize, x: row.ruleStart + frame.textInset, y: row.ruleY + frame.baselineAboveRule };
  if (/[\r\n]/.test(text)) return null;
  const width = RULE_END - frame.rightInset - (row.ruleStart + frame.textInset);
  const ceiling = frame.inkAboveRule - frame.baselineAboveRule;
  const floor = -(frame.inkBelowRule + frame.baselineAboveRule);
  for (let size = frame.maxSize; size >= frame.minSize; size -= 0.25) {
    if (font.widthOfTextAtSize(text, size) > width) continue;
    const bounds = measurePdfGlyphBounds(text, size);
    if (bounds.maxX - Math.min(0, bounds.minX) > width || bounds.maxY > ceiling || bounds.minY < floor) continue;
    return { size, x: row.ruleStart + frame.textInset - Math.min(0, bounds.minX), y: row.ruleY + frame.baselineAboveRule, bounds };
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
    for (const field of CONTACT_FIELDS) {
      const value = keeper[field];
      if (typeof value !== "string") {
        error(field, `${field} must be text.`);
        invalid = true;
        continue;
      }
      const unsupported = [...new Set([...value].filter((character) =>
        !/[\u0000-\u001F\u007F]/u.test(character) && !supported.has(character.codePointAt(0))))];
      if (unsupported.length) {
        const codePoints = unsupported.map((character) =>
          `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
        ).join(", ");
        error(field, `${field} contains characters not supported by the PDF font (${codePoints}). Use a supported spelling; no characters were discarded.`);
        invalid = true;
      }
      if (/[\u0000-\u001F\u007F]/u.test(value)) {
        error(field, `${field} contains line breaks or control characters; each template row holds one line.`);
        invalid = true;
      }
    }
    if (typeof keeper.name === "string" && !keeper.name.trim()) {
      error("name", "a keeper name is required.");
    }
    if (invalid) return [];
    return TEMPLATE_CONTACT_ROWS.map((row) => {
      const value = keeper[row.field];
      const fit = fitPdfContact(value, font, row);
      if (!fit) {
        error(row.field, `${row.label} is too long for its line on the recovery sheet. Shorten it; nothing was truncated.`);
      }
      return { ...row, value, fit };
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

/** Check export-only glyph and template fit constraints, without pads. */
export async function validatePdfContacts(keepers) {
  const { font } = await documentAndFont();
  return validateAndLayout(keepers, font).errors;
}

const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
const SHEET_MARKER = "SHAREKEEPER SLIP-39 RECOVERY SHEET";

function streamText(stream) {
  return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
}

// Row-vector PDF matrices: a point in the inner space maps by inner, then outer.
function multiply(inner, outer) {
  return [
    inner[0] * outer[0] + inner[1] * outer[2],
    inner[0] * outer[1] + inner[1] * outer[3],
    inner[2] * outer[0] + inner[3] * outer[2],
    inner[2] * outer[1] + inner[3] * outer[3],
    inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
    inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
  ];
}

function formMatrix(form) {
  const matrix = form.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
  if (!matrix) return [...IDENTITY];
  const values = matrix.asArray().map((value) => (value instanceof PDFNumber ? value.asNumber() : NaN));
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) throw new Error("Unexpected template form matrix.");
  return values;
}

/**
 * Find the content stream that draws the sheet, following only plain
 * `[q] /Name Do [Q]` form wrappers, and the transform from that stream's
 * coordinates to the page. Anything else is refused rather than guessed.
 */
export function locateTemplateSheet(template) {
  const page = template.getPage(0);
  let ref = page.node.get(PDFName.of("Contents"));
  if (ref instanceof PDFArray && ref.size() === 1) ref = ref.get(0);
  if (!(ref instanceof PDFRef)) throw new Error("Unexpected template content structure.");
  let stream = template.context.lookup(ref);
  let resources = page.node.Resources();
  let matrix = [...IDENTITY];
  for (let depth = 0; depth < 4; depth += 1) {
    const text = streamText(stream);
    if (text.includes(SHEET_MARKER)) return { ref, stream, text, matrix };
    const wrapper = text.trim().split(/\s+/).join(" ").match(/^(?:q )?\/(\S+) Do(?: Q)?$/);
    const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!wrapper || !xobjects) throw new Error("Unexpected template content structure.");
    ref = xobjects.get(PDFName.of(wrapper[1]));
    if (!(ref instanceof PDFRef)) throw new Error("Unexpected template content structure.");
    stream = template.context.lookup(ref);
    matrix = multiply(formMatrix(stream), matrix);
    resources = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
  }
  throw new Error("Template sheet content was not found.");
}

/**
 * Load the untouched template. For 3-of-3 and 3-of-4 sheets only the share
 * count digit in the header literal changes, in the template's own font.
 */
async function templatePage(count) {
  const template = await PDFDocument.load(decodeBase64(TEMPLATE_BASE64), { updateMetadata: false });
  const sheet = locateTemplateSheet(template);
  if (count !== 5) {
    if (sheet.text.split(HEADER_LITERAL).length - 1 !== 1) throw new Error("Template header changed; review before export.");
    const updated = sheet.text.replace(HEADER_LITERAL, `(3 OF ${count}  |`);
    const fresh = template.context.flateStream(Uint8Array.from(updated, (character) => character.charCodeAt(0)));
    for (const [key, value] of sheet.stream.dict.entries()) {
      if (!["/Filter", "/Length", "/DecodeParms"].includes(key.toString())) fresh.dict.set(key, value);
    }
    template.context.assign(sheet.ref, fresh);
  }
  return { template, matrix: sheet.matrix };
}

function drawContacts(page, font, rows, offset) {
  for (const row of rows) {
    if (!row.value) continue;
    page.drawText(row.value, { x: row.fit.x, y: row.fit.y - offset, size: row.fit.size, font, color: INK });
  }
}

function drawPad(page, font, pad, offset) {
  const capHeight = measurePdfGlyphBounds("H", PAD_LETTER_SIZE).maxY;
  for (let index = 0; index < PAD_LENGTH; index += 1) {
    const group = Math.floor(index / 4);
    const cellX = PAD_CELL.x + (group % 10) * PAD_CELL.groupPitch + (index % 4) * PAD_CELL.width;
    const cellY = PAD_CELL.y - Math.floor(group / 10) * PAD_CELL.rowPitch - offset;
    const width = font.widthOfTextAtSize(pad[index], PAD_LETTER_SIZE);
    page.drawText(pad[index], {
      x: cellX + (PAD_CELL.width - width) / 2,
      y: cellY + (PAD_CELL.height - capHeight) / 2,
      size: PAD_LETTER_SIZE,
      font,
      color: INK,
    });
  }
}

/**
 * Generate the one-page recovery sheet entirely in browser memory: the
 * supplied template page, unchanged, with contacts and private pads written
 * into its blank fields. Contacts and pads are never fetched, persisted,
 * logged, or uploaded. Ciphertext prefixes, CRC32 and wallet rows stay blank.
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

  const { template, matrix } = await templatePage(keepers.length);
  const [page] = await document.copyPages(template, [0]);
  document.addPage(page);
  document.setTitle(`Sharekeeper SLIP-39 recovery sheet: 3 of ${keepers.length}`);
  document.setSubject(entropySummary === undefined
    ? "Private recovery sheet with 80-letter pads. Unaudited prototype."
    : "Private recovery sheet with 80-letter pads (browser CSPRNG + user input, HKDF-SHA-256). Unaudited prototype.");
  document.setCreator("Sharekeeper browser-only recovery-sheet tool");
  document.setProducer("pdf-lib / Sharekeeper");
  document.setKeywords(["Sharekeeper", "recovery sheet", "private pads", "prototype"]);

  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix));
  keepers.forEach((_, index) => {
    const offset = index * KEEPER_STRIDE;
    drawContacts(page, font, layouts[index], offset);
    drawPad(page, font, pads[index], offset);
  });
  page.pushOperators(popGraphicsState());
  return document.save({ useObjectStreams: true });
}
