import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, concatTransformationMatrix,
  decodePDFRawStream, degrees, popGraphicsState, pushGraphicsState, rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_BASE64, TEMPLATE_BASE64 } from "./pdf-assets.js";
import { isP2wpkhAddress } from "./btc-address.js";
import { isValidThreshold, KEEPER_COUNTS, PAD_LENGTH, thresholdFor, thresholdOptions } from "../shared/schema.js";

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
 * Each share section in the template drawing is one self-contained block that
 * begins by setting its own line width and colours and drawing its rounded
 * outline from (34, y). The wallet-passphrase section begins the same way at
 * y = 90.78. Blocks for unused sharekeepers are removed, leaving that area of
 * the page blank; nothing else in the drawing changes.
 */
const SECTION_TOP_Y = 1178.78;
const WALLET_SECTION_Y = 90.78;
export function sectionMarker(y) {
  return `.8 w\n.72549 .784314 .827451 RG\n1 1 1 rg\nn\n34 ${Number(y.toFixed(2))} m\n`;
}
/**
 * The supplied sample has an eight-cell "Expected Ciphertext CRC32" field per
 * share. Every export (and the published blank sample) switches it to CRC64:
 * the two labels and the step-5 instruction say CRC64, eight more cells in the
 * template's own cell style follow the existing eight, and the "8 hex digits"
 * hint becomes "16 hex digits", moved right past the new cells. All text stays
 * in the template's own fonts, which already contain these glyphs.
 */
const CRC32_STEP = "(5. Receive all 20 groups; verify the stored CRC32 before decryption.)";
const CRC32_LABEL = "(Expected Ciphertext CRC32:)";
const CRC_CELL_STYLE = ".55 w\n.513725 .596078 .666667 RG\n1 1 1 rg\n";
const fixed4 = (value) => value.toFixed(4).replace(/\.?0+$/, "");
const fixed2 = (value) => value.toFixed(2).replace(/\.?0+$/, "");
export function crc64Sheet(text) {
  const count = (needle) => text.split(needle).length - 1;
  if (count(CRC32_STEP) !== 1 || count(CRC32_LABEL) !== 5) throw new Error("Template CRC labels changed; review before export.");
  let updated = text.replace(CRC32_STEP, CRC32_STEP.replace("CRC32", "CRC64")).replaceAll(CRC32_LABEL, "(Expected Ciphertext CRC64:)");
  for (let slot = 0; slot < 5; slot += 1) {
    const cellY = fixed2(CRC_CELL.y - slot * KEEPER_STRIDE);
    const lastCell = `${CRC_CELL_STYLE}n ${fixed4(CRC_CELL.x + 7 * CRC_CELL.width)} ${cellY} 20 20 re S\n`;
    const hint = `BT 1 0 0 1 749.4121 ${fixed2(1213.78 - slot * KEEPER_STRIDE)} Tm /F3+0 11.5 Tf 13.8 TL (8 hex digits) Tj T* ET\n`;
    if (updated.split(lastCell).length - 1 !== 1 || updated.split(hint).length - 1 !== 1) {
      throw new Error("Template CRC cells changed; review before export.");
    }
    const extra = Array.from({ length: CRC_DIGITS - 8 }, (_, index) =>
      `${CRC_CELL_STYLE}n ${fixed4(CRC_CELL.x + (8 + index) * CRC_CELL.width)} ${cellY} 20 20 re S\n`).join("");
    updated = updated.replace(lastCell, lastCell + extra);
    updated = updated.replace(hint, hint.replace("749.4121", fixed4(749.4121 + (CRC_DIGITS - 8) * CRC_CELL.width)).replace("(8 hex digits)", `(${CRC_DIGITS} hex digits)`));
  }
  return updated;
}

export function sheetTextFor(text, count, threshold) {
  if (text.split(HEADER_LITERAL).length - 1 !== 1) throw new Error("Template header changed; review before export.");
  let updated = crc64Sheet(text).replace(HEADER_LITERAL, `(${threshold} OF ${count}  |`);
  if (count < 5) {
    const markers = [0, 1, 2, 3, 4].map((slot) => sectionMarker(SECTION_TOP_Y - slot * KEEPER_STRIDE)).concat(sectionMarker(WALLET_SECTION_Y));
    for (const marker of markers) {
      if (updated.split(marker).length - 1 !== 1) throw new Error("Template share sections changed; review before export.");
    }
    const start = updated.indexOf(markers[count]);
    const end = updated.indexOf(markers[5]);
    if (!(start > 0 && end > start)) throw new Error("Template share sections out of order; review before export.");
    updated = updated.slice(0, start) + updated.slice(end);
  }
  return updated;
}

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
/** The unified recovery-sheet PDF holds this many copies of the filled sheet, one per page. */
export const SHEET_COPIES = 4;
/**
 * Each copy is labeled "COPY n OF 4" in the page's blank left margin, outside
 * the template drawing (whose ink starts at x ≈ 32 pt on the US Letter page),
 * running bottom-to-top and centred vertically. The sheet itself is untouched.
 */
export const COPY_LABEL = Object.freeze({ baselineX: 26, size: 9, pageMidY: 396, inkMinX: 31 });
export function copyLabel(copy) {
  return `COPY ${copy} OF ${SHEET_COPIES}`;
}
// FIRST 2 CIPHER GROUPS: two groups of four 14.2 x 26pt cells at x=201 and 269.
export const PREFIX_CELL = Object.freeze({ xs: [201, 269], y: 1186.78, width: 14.2, height: 26 });
export const PREFIX_LETTER_SIZE = 13;
// Expected Ciphertext CRC64: sixteen 20 x 20pt cells from x=575.4121. The
// supplied sample had eight (CRC32); the export draws eight more in the same
// style directly after them (see crc64Sheet).
export const CRC_DIGITS = 16;
export const CRC_CELL = Object.freeze({ x: 575.4121, y: 1207.78, width: 20, height: 20 });
export const CRC_DIGIT_SIZE = 13;
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
 * Load the supplied template and apply the documented changes to its drawing:
 * the CRC32 field becomes a 16-digit CRC64 field (crc64Sheet), the header's
 * threshold and share-count digits become the chosen n OF m, in the template's
 * own font, and the drawing of each unused share section is removed (left
 * blank). Everything else on the page is the template's own content.
 */
async function templatePage(count, threshold) {
  const template = await PDFDocument.load(decodeBase64(TEMPLATE_BASE64), { updateMetadata: false });
  const sheet = locateTemplateSheet(template);
  const updated = sheetTextFor(sheet.text, count, threshold);
  const fresh = template.context.flateStream(Uint8Array.from(updated, (character) => character.charCodeAt(0)));
  for (const [key, value] of sheet.stream.dict.entries()) {
    if (!["/Filter", "/Length", "/DecodeParms"].includes(key.toString())) fresh.dict.set(key, value);
  }
  template.context.assign(sheet.ref, fresh);
  return { template, matrix: sheet.matrix };
}

/**
 * The published blank sample: the 3-of-5 template page with the CRC64 field,
 * copied into a new one-page document (which leaves out the source's Content
 * Credentials, as they do not attest to a modified sheet). Fixed dates keep
 * the output byte-for-byte reproducible.
 */
export async function blankSamplePdf() {
  const { template } = await templatePage(5, 3);
  const document = await PDFDocument.create({ updateMetadata: false });
  const [page] = await document.copyPages(template, [0]);
  document.addPage(page);
  document.setTitle("Sharekeeper SLIP-39 recovery sheet: blank sample (CRC64)");
  document.setProducer("pdf-lib / Sharekeeper");
  document.setCreator("Sharekeeper recovery-sheet build");
  document.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  document.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  return document.save({ useObjectStreams: true });
}

function drawContacts(page, font, rows, offset) {
  for (const row of rows) {
    if (!row.value) continue;
    page.drawText(row.value, { x: row.fit.x, y: row.fit.y - offset, size: row.fit.size, font, color: INK });
  }
}

function drawCentered(page, font, character, cellX, cellY, width, height, size) {
  const capHeight = measurePdfGlyphBounds("H", size).maxY;
  page.drawText(character, {
    x: cellX + (width - font.widthOfTextAtSize(character, size)) / 2,
    y: cellY + (height - capHeight) / 2,
    size,
    font,
    color: INK,
  });
}

// Wallet table line 01 (template coordinates): the "Empty" passphrase box and
// the FIRST KNOWN PUBLIC BTC ADDRESS cell (column x=776..1160.551, row
// y=257.98..285.78). The address is fitted on one line from 15 down to 9 units.
export const WALLET_ROW1 = Object.freeze({ emptyBox: { x: 286, y: 269.28, size: 7 }, address: { x: 785, maxX: 1152, baselineY: 266.4, maxSize: 15, minSize: 9 } });
export function walletAddressSize(font, address) {
  const { x, maxX, maxSize, minSize } = WALLET_ROW1.address;
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    if (font.widthOfTextAtSize(address, size) <= maxX - x) return size;
  }
  throw new Error("The Bitcoin address does not fit the wallet table.");
}
function drawFirstWallet(page, font, address) {
  const { x, y, size } = WALLET_ROW1.emptyBox;
  const inset = 1.2;
  page.drawLine({ start: { x: x + inset, y: y + inset }, end: { x: x + size - inset, y: y + size - inset }, thickness: 1.3, color: INK });
  page.drawLine({ start: { x: x + inset, y: y + size - inset }, end: { x: x + size - inset, y: y + inset }, thickness: 1.3, color: INK });
  page.drawText(address, { x: WALLET_ROW1.address.x, y: WALLET_ROW1.address.baselineY, size: walletAddressSize(font, address), font, color: INK });
}

function drawCipherGroups(page, font, groups, offset) {
  for (let index = 0; index < 8; index += 1) {
    const cellX = PREFIX_CELL.xs[Math.floor(index / 4)] + (index % 4) * PREFIX_CELL.width;
    drawCentered(page, font, groups[index], cellX, PREFIX_CELL.y - offset, PREFIX_CELL.width, PREFIX_CELL.height, PREFIX_LETTER_SIZE);
  }
}

function drawCrc(page, font, crc, offset) {
  for (let index = 0; index < CRC_DIGITS; index += 1) {
    drawCentered(page, font, crc[index], CRC_CELL.x + index * CRC_CELL.width, CRC_CELL.y - offset, CRC_CELL.width, CRC_CELL.height, CRC_DIGIT_SIZE);
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
 * logged, or uploaded. Ciphertext prefixes, CRC64 and wallet rows stay blank.
 */
export async function createRecoveryPdf({ keepers, pads, entropySummary, threshold, cipherGroups, ciphertextCrcs, firstAddress }) {
  requireKeepers(keepers);
  threshold ??= thresholdFor(keepers.length);
  if (!isValidThreshold(threshold, keepers.length)) {
    throw new Error(`Recovery threshold must be one of ${thresholdOptions(keepers.length).join(", ")} for ${keepers.length} sharekeepers.`);
  }
  if (!Array.isArray(pads) || pads.length !== keepers.length ||
      pads.some((pad) => typeof pad !== "string" || !/^[A-Z]{80}$/.test(pad))) {
    throw new Error("PDF export requires one exact 80-letter uppercase A–Z pad per keeper.");
  }
  if (entropySummary !== undefined &&
      (!entropySummary || !Number.isSafeInteger(entropySummary.sampleCount) ||
       entropySummary.sampleCount < 1 || typeof entropySummary.inputKind !== "string")) {
    throw new Error("PDF entropy summary must contain a positive sampleCount and inputKind text, never raw entropy data.");
  }
  // Optional, offline Shamir tool only: first two cipher groups and ciphertext CRC64 per keeper.
  if ((cipherGroups === undefined) !== (ciphertextCrcs === undefined)) {
    throw new Error("Cipher groups and ciphertext CRC64 values must be supplied together.");
  }
  if (cipherGroups !== undefined && (
    !Array.isArray(cipherGroups) || cipherGroups.length !== keepers.length ||
    cipherGroups.some((value) => typeof value !== "string" || !/^[A-Z]{8}$/.test(value)) ||
    !Array.isArray(ciphertextCrcs) || ciphertextCrcs.length !== keepers.length ||
    ciphertextCrcs.some((value) => typeof value !== "string" || !/^[0-9A-F]{16}$/.test(value)))) {
    throw new Error("Each keeper needs 8 cipher-group letters (A–Z) and a 16-digit uppercase hex CRC64.");
  }
  // Optional, offline Shamir tool only: line 01 of the wallet table gets the
  // seed's first BIP-84 address with the passphrase marked Empty.
  if (firstAddress !== undefined && (cipherGroups === undefined || !isP2wpkhAddress(firstAddress))) {
    throw new Error("The first address must be a bc1q (P2WPKH) address supplied with the cipher groups.");
  }
  const { document, font } = await documentAndFont();
  const { errors, layouts } = validateAndLayout(keepers, font);
  if (errors.length) {
    const error = new Error(errors.map((item) => item.message).join("\n"));
    error.contactErrors = errors;
    throw error;
  }

  const { template, matrix } = await templatePage(keepers.length, threshold);
  // One unified document: SHEET_COPIES identical copies of the same filled
  // sheet, one per page. Each page gets its own copy of the template page so
  // overlays are never drawn twice onto a shared page object.
  const pages = [];
  for (let copy = 0; copy < SHEET_COPIES; copy += 1) {
    const [page] = await document.copyPages(template, [0]);
    document.addPage(page);
    pages.push(page);
  }
  document.setTitle(`Sharekeeper SLIP-39 recovery sheet: ${threshold} of ${keepers.length}`);
  document.setSubject(entropySummary === undefined
    ? "Private recovery sheet with 80-letter pads. Unaudited prototype."
    : "Private recovery sheet with 80-letter pads (1600-bit browser seed per pad XOR 1600-bit user-input block). Unaudited prototype.");
  document.setCreator("Sharekeeper browser-only recovery-sheet tool");
  document.setProducer("pdf-lib / Sharekeeper");
  document.setKeywords(["Sharekeeper", "recovery sheet", "private pads", "prototype"]);

  for (const page of pages) {
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix));
    keepers.forEach((_, index) => {
      const offset = index * KEEPER_STRIDE;
      drawContacts(page, font, layouts[index], offset);
      drawPad(page, font, pads[index], offset);
      if (cipherGroups) {
        drawCipherGroups(page, font, cipherGroups[index], offset);
        drawCrc(page, font, ciphertextCrcs[index], offset);
      }
    });
    if (firstAddress !== undefined) drawFirstWallet(page, font, firstAddress);
    page.pushOperators(popGraphicsState());
    const label = copyLabel(pages.indexOf(page) + 1);
    page.drawText(label, {
      x: COPY_LABEL.baselineX,
      y: COPY_LABEL.pageMidY - font.widthOfTextAtSize(label, COPY_LABEL.size) / 2,
      size: COPY_LABEL.size, font, color: INK, rotate: degrees(90),
    });
  }
  return document.save({ useObjectStreams: true });
}
