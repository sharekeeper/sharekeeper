import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_BASE64 } from "./pdf-assets.js";
import { ciphertextCrc32 } from "./cipher.js";
import { isValidThreshold, thresholdOptions } from "../shared/schema.js";

const INK = rgb(0.094118, 0.184314, 0.247059);
const TEAL = rgb(0.078431, 0.466667, 0.509804);
const MUTED = rgb(0.34902, 0.427451, 0.490196);
const RULE = rgb(0.513725, 0.596078, 0.666667);
const PAGE = { width: 612, height: 792 };

function decodeBase64(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * One hand-out PDF for the sharekeepers: one US Letter page per keeper, each
 * page holding only that keeper's name, ciphertext (80 letters in 20 numbered
 * groups) and its CRC32. No page contains a pad, plaintext share or seed. The
 * owner prints it and gives each sharekeeper only their own page. The owner's
 * unified recovery sheet is a separate PDF. Generated in browser memory only.
 */
export async function createKeeperCiphertextPdf({ keepers, ciphertexts, threshold }) {
  if (!Array.isArray(keepers) || !Array.isArray(ciphertexts) || keepers.length !== ciphertexts.length || keepers.length < 3 || keepers.length > 5) {
    throw new Error("Ciphertext hand-out needs one ciphertext per sharekeeper (3 to 5).");
  }
  const count = keepers.length;
  if (!isValidThreshold(threshold, count)) {
    throw new Error(`Recovery threshold must be one of ${thresholdOptions(count).join(", ")} for ${count} sharekeepers.`);
  }
  if (keepers.some((keeper) => typeof keeper?.name !== "string" || !keeper.name.trim())) throw new Error("Each ciphertext page needs the sharekeeper's name.");
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(decodeBase64(FONT_BASE64), { subset: true });
  document.setTitle(`Sharekeeper ciphertext hand-out: ${threshold} of ${count}, one page per sharekeeper`);
  document.setCreator("Sharekeeper offline Shamir tool");
  document.setProducer("pdf-lib / Sharekeeper");
  document.setSubject("One page per sharekeeper: ciphertext only. No pad, share or seed. Give each sharekeeper only their own page.");

  keepers.forEach((keeper, index) => {
    const ciphertext = ciphertexts[index];
    const crc = ciphertextCrc32(ciphertext);
    const page = document.addPage([PAGE.width, PAGE.height]);
    const text = (value, x, y, size, color = INK) => page.drawText(value, { x, y, size, font, color });
    const share = String(index + 1).padStart(2, "0");
    text("SHAREKEEPER CIPHERTEXT", 48, 728, 22);
    text(`SHARE ${share}  |  ${threshold} OF ${count}  |  20 GROUPS OF 4 LETTERS`, 48, 706, 10.5, TEAL);
    page.drawLine({ start: { x: 48, y: 694 }, end: { x: 564, y: 694 }, thickness: 0.6, color: RULE });
    text("Sharekeeper", 48, 668, 10, MUTED);
    let nameSize = 14;
    while (nameSize > 8 && font.widthOfTextAtSize(keeper.name, nameSize) > 516) nameSize -= 0.5;
    if (font.widthOfTextAtSize(keeper.name, nameSize) > 516) throw new Error("A sharekeeper name is too long for the ciphertext page.");
    text(keeper.name, 48, 650, nameSize);
    const lines = [
      "This page holds only your share’s ciphertext. It is meant to be unusable without",
      "the owner’s private pad. Store it safely and keep it exactly as written.",
      "On a recovery request made under your agreed release policy, provide all 20 groups.",
    ];
    lines.forEach((line, row) => text(line, 48, 620 - row * 15, 10.5));

    const cell = { width: 22, height: 30 };
    const groupWidth = cell.width * 4;
    const gap = (516 - groupWidth * 5) / 4;
    for (let group = 0; group < 20; group += 1) {
      const column = group % 5;
      const row = Math.floor(group / 5);
      const x0 = 48 + column * (groupWidth + gap);
      const y0 = 500 - row * 72;
      const label = String(group + 1).padStart(2, "0");
      text(label, x0 + (groupWidth - font.widthOfTextAtSize(label, 9)) / 2, y0 + cell.height + 6, 9, MUTED);
      for (let letter = 0; letter < 4; letter += 1) {
        const x = x0 + letter * cell.width;
        page.drawRectangle({ x, y: y0, width: cell.width, height: cell.height, borderColor: RULE, borderWidth: 0.6 });
        const character = ciphertext[group * 4 + letter];
        text(character, x + (cell.width - font.widthOfTextAtSize(character, 16)) / 2, y0 + 9, 16);
      }
    }

    text("Ciphertext CRC32", 48, 196, 10, MUTED);
    text(crc, 48, 172, 20);
    text("CRC-32/ISO-HDLC (IEEE) of the 80 letters above as plain uppercase text, no spaces.", 48, 152, 9, MUTED);
    text("It detects copying mistakes; it is not proof of authenticity.", 48, 140, 9, MUTED);
    page.drawLine({ start: { x: 48, y: 96 }, end: { x: 564, y: 96 }, thickness: 0.6, color: RULE });
    text(`Sharekeeper.org prototype, not audited. Generated offline in the owner's browser. Page ${index + 1} of ${count}.`, 48, 80, 8.5, MUTED);
  });
  return document.save({ useObjectStreams: true });
}
