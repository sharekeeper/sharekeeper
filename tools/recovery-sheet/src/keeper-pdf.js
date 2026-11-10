import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_BASE64 } from "./pdf-assets.js";
import { ciphertextCrc64 } from "./cipher.js";
import { formatCrc64 } from "../site/crc64.js";
import { isValidThreshold, thresholdOptions } from "../shared/schema.js";

const INK = rgb(0.094118, 0.184314, 0.247059);
const TEAL = rgb(0.078431, 0.466667, 0.509804);
const MUTED = rgb(0.34902, 0.427451, 0.490196);
const RULE = rgb(0.513725, 0.596078, 0.666667);
const PAGE = { width: 612, height: 792 };
const LEFT = 48;
const RIGHT = 564;
const WIDTH = RIGHT - LEFT;

function decodeBase64(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pageWriter(page, font) {
  const supported = new Set(font.getCharacterSet());
  const measure = (value, size) => font.widthOfTextAtSize(value, size);
  const text = (value, x, y, size, color = INK) => {
    if (/[\r\n]/u.test(value) || [...value].some((character) => !supported.has(character.codePointAt(0)))) {
      throw new Error("Provider information pack contains text the embedded font cannot display.");
    }
    if (x < LEFT - 1e-8 || x + measure(value, size) > RIGHT + 1e-8) {
      throw new Error("Provider information pack text does not fit within the page margins.");
    }
    page.drawText(value, { x, y, size, font, color });
  };
  const line = (value, x, y, maxSize, minSize = 8.5, color = INK) => {
    let size = maxSize;
    while (size > minSize && measure(value, size) > RIGHT - x) {
      size = Math.max(minSize, size - 0.25);
    }
    text(value, x, y, size, color);
  };
  const wrap = (value, size) => {
    const lines = [];
    let current = "";
    for (const word of value.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, size) <= WIDTH) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = "";
        for (const character of word) {
          if (measure(current + character, size) > WIDTH) {
            if (!current) throw new Error("Provider information pack text cannot fit within the page margins.");
            lines.push(current);
            current = "";
          }
          current += character;
        }
      }
    }
    if (current) lines.push(current);
    return lines;
  };
  const paragraph = (value, y, { size = 10.5, leading = 14, minY = 96, color = INK } = {}) => {
    const lines = wrap(value, size);
    if (y - (lines.length - 1) * leading - size < minY) {
      throw new Error("Provider information pack text is too long for its allotted page area.");
    }
    lines.forEach((value, index) => text(value, LEFT, y - index * leading, size, color));
    return y - lines.length * leading;
  };
  const rule = (y, x1 = LEFT, x2 = RIGHT) => page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.6,
    color: RULE,
  });
  return { text, line, paragraph, rule, measure };
}

function heading(writer, share, threshold, count) {
  writer.line("SHAREKEEPER PROVIDER INFORMATION PACK", LEFT, 728, 22, 17);
  writer.text(`SHARE ${share}  |  ${threshold} OF ${count}  |  20 GROUPS OF 4 LETTERS`, LEFT, 706, 10.5, TEAL);
  writer.rule(694);
}

function footer(writer, index, count, packPage) {
  writer.rule(82);
  writer.line(`Provider ${index + 1} of ${count} · page ${packPage}/2 of this pack`, LEFT, 65, 8.5);
  writer.line("Sharekeeper.org prototype, not audited. Generated offline in the owner's browser.", LEFT, 50, 8.5, 8.5, MUTED);
}

/**
 * One provider information pack PDF, with two consecutive US Letter pages per
 * provider for duplex printing. Each pair contains only that provider's name,
 * ciphertext and CRC64, plus handling instructions and blank handwritten terms.
 * Never includes a private pad, plaintext share, master secret or wallet address.
 * The owner's unified recovery sheet remains a separate PDF. Browser memory only.
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
  document.setTitle(`Sharekeeper provider information pack: ${threshold} of ${count}, two pages per provider`);
  document.setAuthor("Perplexity Computer");
  document.setCreator("Sharekeeper offline Shamir tool");
  document.setProducer("pdf-lib / Sharekeeper");
  document.setSubject("Provider information pack: two pages per provider, containing only their ciphertext, CRC64 and handling instructions. Give each provider only their own two-page pack.");

  keepers.forEach((keeper, index) => {
    const ciphertext = ciphertexts[index];
    const crc = formatCrc64(ciphertextCrc64(ciphertext));
    const page = document.addPage([PAGE.width, PAGE.height]);
    const writer = pageWriter(page, font);
    const { text, line, paragraph, measure } = writer;
    const share = String(index + 1).padStart(2, "0");
    heading(writer, share, threshold, count);
    text("What you hold", LEFT, 670, 17, TEAL);
    text("Provider", LEFT, 649, 9.5, MUTED);
    line(keeper.name, LEFT, 631, 14, 8);
    const afterIntro = paragraph("This page holds only your share's ciphertext. It is designed to be unusable without the owner's private pad. Store it safely and keep it exactly as written.", 608, { minY: 570 });
    paragraph(`Any ${threshold} of the ${count} shares are needed; your share alone cannot recover the wallet.`, afterIntro - 7, { minY: 548 });

    const cell = { width: 22, height: 30 };
    const groupWidth = cell.width * 4;
    const gap = (WIDTH - groupWidth * 5) / 4;
    for (let group = 0; group < 20; group += 1) {
      const column = group % 5;
      const row = Math.floor(group / 5);
      const x0 = LEFT + column * (groupWidth + gap);
      const y0 = 500 - row * 72;
      const label = String(group + 1).padStart(2, "0");
      text(label, x0 + (groupWidth - measure(label, 9)) / 2, y0 + cell.height + 6, 9, MUTED);
      for (let letter = 0; letter < 4; letter += 1) {
        const x = x0 + letter * cell.width;
        page.drawRectangle({ x, y: y0, width: cell.width, height: cell.height, borderColor: RULE, borderWidth: 0.6 });
        const character = ciphertext[group * 4 + letter];
        text(character, x + (cell.width - measure(character, 16)) / 2, y0 + 9, 16);
      }
    }

    text("Ciphertext CRC64", LEFT, 245, 10, MUTED);
    text(crc, LEFT, 221, 20);
    paragraph("CRC-64/XZ of the 80 letters as plain uppercase text, no spaces. Shown in groups of four.", 201, { size: 9, leading: 12, color: MUTED, minY: 180 });
    const afterCheck = paragraph("Check on receipt: recompute the CRC-64/XZ of the 80 letters (for example with the CRC64 calculator at sharekeeper.org/#/tools) and confirm it matches.", 172, { size: 10, leading: 14, minY: 112 });
    paragraph("It detects copying mistakes; it is not proof of authenticity.", afterCheck - 7, { size: 9, leading: 12, color: MUTED, minY: 92 });
    footer(writer, index, count, 1);

    const handlingPage = document.addPage([PAGE.width, PAGE.height]);
    const handling = pageWriter(handlingPage, font);
    heading(handling, share, threshold, count);
    handling.text("Handling a release request", LEFT, 670, 17, TEAL);
    handling.text("Provider", LEFT, 649, 9.5, MUTED);
    handling.line(keeper.name, LEFT, 631, 14, 8);
    const steps = [
      "1. Before anything else, the requester will ask you for ciphertext groups 01–02 so they can confirm you are the right provider against their sheet. Giving groups 01–02 alone does not reveal the share.",
      "2. Complete the identity checks agreed with the owner, and the notice/waiting period in the agreed release policy, before releasing anything else.",
      "3. Then provide all 20 groups exactly as written. The requester checks them against the CRC64 they hold.",
      "4. Never send this pack to anyone else, and never give your groups to another provider. Keep the paper safe. The ciphertext is designed to be unusable without the owner's private pad, which you never receive.",
    ];
    let y = 603;
    for (const step of steps) {
      y = handling.paragraph(step, y, { size: 10, leading: 13.5, minY: 426 }) - 7;
    }
    if (y < 420) throw new Error("Provider release instructions do not fit above the handwritten terms.");
    handling.text("Record of agreed terms (fill in by hand)", LEFT, 405, 13.5, TEAL);
    const terms = [
      "Owner reference",
      "Agreed identity checks",
      "Agreed notice / waiting period",
      "Authorised requesters",
      "Date received",
      "Provider signature",
    ];
    terms.forEach((label, row) => {
      const baseline = 379 - row * 24;
      handling.line(label, LEFT, baseline, 9.5, 9.5, MUTED);
      handling.rule(baseline - 3, 211, RIGHT);
    });
    handling.text("Release log", LEFT, 227, 13.5, TEAL);
    const columns = [LEFT, 126, 290, 376, RIGHT];
    const tableTop = 211;
    const tableBottom = 101;
    for (let row = 0; row <= 5; row += 1) handling.rule(tableTop - row * 22);
    columns.forEach((x) => handlingPage.drawLine({
      start: { x, y: tableTop },
      end: { x, y: tableBottom },
      thickness: 0.6,
      color: RULE,
    }));
    ["Date", "Requester", "Groups given", "Notes"].forEach((label, column) => {
      handling.text(label, columns[column] + 7, 197, 9, MUTED);
    });
    footer(handling, index, count, 2);
  });
  return document.save({ useObjectStreams: true });
}
