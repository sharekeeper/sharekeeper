import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_BASE64 } from "../src/pdf-assets.js";
import { ciphertextCrc64, decryptCiphertext, encryptPrefixes, firstCipherGroups } from "../src/cipher.js";
import { generateMasterSecret, MASTER_SECRET_BYTES, thresholdSubsets } from "../src/master-secret.js";
import { createKeeperCiphertextPdf } from "../src/keeper-pdf.js";
import { createRecoveryPdf, CRC_CELL, CRC_DIGIT_SIZE, PREFIX_CELL, PREFIX_LETTER_SIZE, WALLET_ROW1 } from "../src/pdf.js";
import { blankKeeper } from "../shared/schema.js";
import { crc64Hex, formatCrc64 } from "../site/crc64.js";

const P = "ACADACIDACNEACRYADULAGEDAMAZANCEAPARAQUAARMYAUTHAXISBEAMBENCBEST"
  + "BLAZBONDBUDGCALM"; // 80 letters, obviously synthetic test material
const K = "Z".repeat(80);

test("cipher is per-letter (P + K) mod 26 with A = 0 and decrypts back", () => {
  assert.equal(P.length, 80);
  assert.equal(encryptPrefixes("A".repeat(80), "B".repeat(80)), "B".repeat(80));
  assert.equal(encryptPrefixes("Z".repeat(80), "B".repeat(80)), "A".repeat(80));
  const c = encryptPrefixes(P, K);
  // + Z (25) is − 1 mod 26
  assert.equal(c.slice(0, 4), "ZBZC");
  assert.equal(decryptCiphertext(c, K), P);
  for (let trial = 0; trial < 200; trial += 1) {
    const rand = (n) => Array.from(webcrypto.getRandomValues(new Uint8Array(n)), (b) => String.fromCharCode(65 + (b % 26))).join("");
    const p = rand(80); const k = rand(80);
    assert.equal(decryptCiphertext(encryptPrefixes(p, k), k), p);
  }
  for (const bad of ["", "a".repeat(80), "A".repeat(79), "A".repeat(81), `${"A".repeat(79)}1`, null]) {
    assert.throws(() => encryptPrefixes(bad, K));
    assert.throws(() => encryptPrefixes(P, bad));
  }
});

test("ciphertext CRC64 is CRC-64/XZ of the 80 ASCII letters, 16 uppercase hex", () => {
  // Catalogue check value for CRC-64/XZ.
  assert.equal(crc64Hex(new TextEncoder().encode("123456789")), "995DC9BBDF1939FA");
  const c = encryptPrefixes(P, K);
  const crc = ciphertextCrc64(c);
  assert.match(crc, /^[0-9A-F]{16}$/);
  assert.equal(crc, crc64Hex(new TextEncoder().encode(c)));
  assert.notEqual(crc, ciphertextCrc64(`${c.slice(0, 79)}${c[79] === "A" ? "B" : "A"}`));
  assert.equal(firstCipherGroups(c), c.slice(0, 8));
});

test("master secret is 16 bytes, needs input and Web Crypto, and differs per call", async () => {
  const contribution = new Uint8Array([2, 1, 2, 3]);
  const a = await generateMasterSecret(contribution, webcrypto);
  const b = await generateMasterSecret(contribution, webcrypto);
  assert.equal(a.length, MASTER_SECRET_BYTES);
  assert.notDeepEqual(a, b);
  // With a fixed CSPRNG block r, the result is r XOR the SHA-512 prefix of the domain-separated input.
  const counter = { getRandomValues: (array) => { array.forEach((_, i) => { array[i] = i; }); return array; }, subtle: webcrypto.subtle };
  const fixed = await generateMasterSecret(contribution, counter);
  const digest = new Uint8Array(await webcrypto.subtle.digest("SHA-512", new Uint8Array([...new TextEncoder().encode("sharekeeper/shamir-offline/master-secret/v1|"), 2, 1, 2, 3])));
  assert.deepEqual(fixed, digest.slice(0, 16).map((b, i) => b ^ i));
  // A constant RNG block is refused.
  await assert.rejects(() => generateMasterSecret(contribution, { getRandomValues: (a) => a.fill(7), subtle: webcrypto.subtle }), /constant/);
  await assert.rejects(() => generateMasterSecret(new Uint8Array(0), webcrypto));
  await assert.rejects(() => generateMasterSecret(contribution, {}));
});

test("master secret failure paths wipe every buffer they touched", async () => {
  const contribution = new Uint8Array([2, 9, 8, 7]);
  // 1. digest rejects: the hashed input buffer must be zero.
  let seenInput;
  await assert.rejects(() => generateMasterSecret(contribution, {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: { digest: async (_a, input) => { seenInput = input; throw new Error("digest failed"); } },
  }), /digest failed/);
  assert.ok(seenInput.length > 0 && seenInput.every((b) => b === 0));
  // 2. RNG fills partially then throws: digest and secret buffers must be zero.
  let seenSecret; let seenDigest;
  await assert.rejects(() => generateMasterSecret(contribution, {
    getRandomValues: (array) => { seenSecret = array; array.fill(0xAB, 0, 8); throw new Error("rng failed"); },
    subtle: { digest: async (a, input) => { const out = await webcrypto.subtle.digest(a, input); seenDigest = new Uint8Array(out); return seenDigest.buffer; } },
  }), /rng failed/);
  assert.ok(seenSecret.every((b) => b === 0), "partial secret wiped");
  assert.ok(seenDigest.every((b) => b === 0), "digest wiped");
  assert.deepEqual([...contribution], [2, 9, 8, 7], "caller input untouched");
});

test("threshold subsets enumerate every n-of-m set", () => {
  assert.equal(thresholdSubsets(5, 3).length, 10);
  assert.equal(thresholdSubsets(5, 5).length, 1);
  assert.equal(thresholdSubsets(2, 2).length, 1);
  assert.deepEqual(thresholdSubsets(4, 2), [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
});

function keepers(count) {
  return Array.from({ length: count }, (_, i) => ({ ...blankKeeper(`k${i + 1}`), name: `TEST ONLY Keeper ${i + 1}`, phone: "+1 202 555 0100" }));
}

function streamsOf(document, page) {
  const contents = page.node.Contents();
  const refs = typeof contents.asArray === "function" ? contents.asArray() : [contents];
  return refs.map((ref) => new TextDecoder("latin1").decode(decodePDFRawStream(document.context.lookup(ref)).decode()));
}

function runs(document, page, overlay) {
  const fonts = page.node.Resources().lookup(PDFName.of("Font"));
  const maps = new Map();
  return [...overlay.matchAll(/BT\n([\s\S]*?)\nET/g)].map(([, block]) => {
    const [, name, size] = block.match(/\/(\S+) ([\d.]+) Tf/);
    const [, x, y] = block.match(/([-\d.e]+) ([-\d.e]+) Tm/);
    const [, encoded] = block.match(/<([0-9A-F]*)> Tj/);
    if (!maps.has(name)) {
      const cmap = new TextDecoder().decode(decodePDFRawStream(fonts.lookup(PDFName.of(name)).lookup(PDFName.of("ToUnicode"))).decode());
      maps.set(name, new Map([...cmap.matchAll(/^<([0-9A-F]+)> <([0-9A-F]+)>$/gm)].map(([, code, u]) => [code, u.match(/.{4}/g).map((v) => String.fromCharCode(parseInt(v, 16))).join("")])));
    }
    const value = (encoded.match(/.{4}/g) ?? []).map((code) => maps.get(name).get(code)).join("");
    return { value, size: Number(size), x: Number(x), y: Number(y) };
  });
}

test("recovery sheet fills first 2 cipher groups and CRC64 in their template boxes", async () => {
  for (const count of [3, 4, 5]) {
    const pads = Array.from({ length: count }, (_, i) => String.fromCharCode(66 + i).repeat(80));
    const texts = pads.map((pad) => encryptPrefixes(P, pad));
    const groups = texts.map(firstCipherGroups);
    const crcs = texts.map(ciphertextCrc64);
    const bytes = await createRecoveryPdf({ keepers: keepers(count), pads, threshold: 2, cipherGroups: groups, ciphertextCrcs: crcs });
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 4);
    for (const page of document.getPages()) {
    const overlay = streamsOf(document, page).at(-1);
    const all = runs(document, page, overlay);
    const prefixRuns = all.filter((r) => r.size === PREFIX_LETTER_SIZE);
    // Contacts can also be drawn at 13 pt; restrict to the prefix and CRC rows.
    const inPrefix = prefixRuns.filter((r) => [0, 1, 2, 3, 4].some((slot) => r.y > PREFIX_CELL.y - slot * 200 && r.y < PREFIX_CELL.y - slot * 200 + PREFIX_CELL.height));
    const inCrc = all.filter((r) => r.size === CRC_DIGIT_SIZE && r.x >= CRC_CELL.x && [0, 1, 2, 3, 4].some((slot) => r.y > CRC_CELL.y - slot * 200 && r.y < CRC_CELL.y - slot * 200 + CRC_CELL.height));
    assert.equal(inPrefix.filter((r) => r.x < CRC_CELL.x).length, count * 8);
    assert.equal(inCrc.length, count * 16);
    for (let slot = 0; slot < count; slot += 1) {
      const letters = inPrefix.filter((r) => r.x < CRC_CELL.x && r.y < PREFIX_CELL.y - slot * 200 + PREFIX_CELL.height && r.y > PREFIX_CELL.y - slot * 200);
      assert.equal(letters.map((r) => r.value).join(""), groups[slot]);
      letters.forEach((r, i) => {
        const cellX = PREFIX_CELL.xs[Math.floor(i / 4)] + (i % 4) * PREFIX_CELL.width;
        assert.ok(r.x > cellX && r.x < cellX + PREFIX_CELL.width, `prefix letter ${i} inside its cell`);
      });
      const digits = inCrc.filter((r) => r.y < CRC_CELL.y - slot * 200 + CRC_CELL.height && r.y > CRC_CELL.y - slot * 200);
      assert.equal(digits.map((r) => r.value).join(""), crcs[slot]);
      digits.forEach((r, i) => assert.ok(r.x > CRC_CELL.x + i * CRC_CELL.width && r.x < CRC_CELL.x + (i + 1) * CRC_CELL.width));
    }
    }
  }
});

test("recovery sheet rejects malformed cipher groups or CRCs", async () => {
  const pads = ["B".repeat(80), "C".repeat(80), "D".repeat(80)];
  const base = { keepers: keepers(3), pads, threshold: 2 };
  const G = ["ABCDEFGH", "ABCDEFGH", "ABCDEFGH"]; const C = ["0000000000000000", "0000000000000000", "0000000000000000"];
  await createRecoveryPdf({ ...base, cipherGroups: G, ciphertextCrcs: C }); // the valid baseline is accepted
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G }));
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: ["abcdefgh", ...G.slice(1)], ciphertextCrcs: C }));
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G, ciphertextCrcs: ["000000000000000g", ...C.slice(1)] }));
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G.slice(1), ciphertextCrcs: C.slice(1) }));
  // An old 8-digit CRC32 value is refused, not padded or truncated.
  await assert.rejects(() => createRecoveryPdf({ ...base, cipherGroups: G, ciphertextCrcs: ["00000000", ...C.slice(1)] }));
});

test("provider pack is one PDF with two consecutive Letter pages per provider, private to that provider", async () => {
  const measuringDocument = await PDFDocument.create();
  measuringDocument.registerFontkit(fontkit);
  const font = await measuringDocument.embedFont(Uint8Array.from(atob(FONT_BASE64), (character) => character.charCodeAt(0)));
  for (const count of [3, 4, 5]) {
    const threshold = Math.min(3, count - 1);
    const pads = Array.from({ length: count }, (_, index) => String.fromCharCode(66 + index).repeat(80));
    const texts = pads.map((pad) => encryptPrefixes(P, pad));
    const people = keepers(count);
    people[0].name = "TEST ONLY Keeper 1 José Müller";
    const document = await PDFDocument.load(await createKeeperCiphertextPdf({ keepers: people, ciphertexts: texts, threshold }));
    assert.equal(document.getPageCount(), count * 2);
    assert.match(document.getTitle(), /provider information pack/);
    assert.match(document.getSubject(), /Provider information pack/);
    document.getPages().forEach((page, pageIndex) => {
      const provider = Math.floor(pageIndex / 2);
      const packPage = pageIndex % 2 + 1;
      assert.equal(page.getWidth(), 612);
      assert.equal(page.getHeight(), 792);
      const drawn = runs(document, page, streamsOf(document, page).join("\n"));
      const text = drawn.map((run) => run.value);
      drawn.forEach((run) => {
        assert.ok(run.x >= 48 - 1e-8, `text starts inside left margin: ${run.value}`);
        assert.ok(run.x + font.widthOfTextAtSize(run.value, run.size) <= 564 + 1e-8, `text ends inside right margin: ${run.value}`);
      });
      assert.ok(text.includes("SHAREKEEPER PROVIDER INFORMATION PACK"));
      assert.ok(text.includes(people[provider].name));
      assert.ok(text.some((value) => value.includes(`SHARE 0${provider + 1}  |  ${threshold} OF ${count}`)));
      assert.ok(text.includes(`Provider ${provider + 1} of ${count} · page ${packPage}/2 of this pack`));
      assert.ok(text.includes("Sharekeeper.org prototype, not audited. Generated offline in the owner's browser."));
      const letters = text.filter((value) => /^[A-Z]$/.test(value)).join("");
      const joined = text.join("\n");
      if (packPage === 1) {
        assert.ok(text.includes("What you hold"));
        assert.equal(letters, texts[provider]);
        const crc = formatCrc64(ciphertextCrc64(texts[provider]));
        assert.match(crc, /^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
        assert.ok(text.includes(crc));
        const prose = text.join(" ");
        assert.ok(prose.includes("CRC-64/XZ of the 80 letters as plain uppercase text, no spaces"));
        assert.ok(prose.includes(`Any ${threshold} of the ${count} shares are needed; your share alone cannot recover the wallet.`));
        assert.ok(prose.includes("Check on receipt: recompute the CRC-64/XZ of the 80 letters"));
        assert.ok(prose.includes("sharekeeper.org/#/tools"));
        assert.ok(prose.includes("confirm it matches."));
        assert.deepEqual(text.filter((value) => /^\d{2}$/.test(value)), Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, "0")));
      } else {
        assert.equal(letters, "");
        assert.ok(text.includes("Handling a release request"));
        const prose = text.join(" ");
        for (const required of [
          "ciphertext groups 01–02",
          "Giving groups 01–02 alone does not reveal the share.",
          "Complete the identity checks agreed with the owner",
          "notice/waiting period in the agreed release policy",
          "before releasing anything else.",
          "provide all 20 groups exactly as written.",
          "checks them against the CRC64 they hold.",
          "Never send this pack to anyone else",
          "never give your groups to another provider",
          "Keep the paper safe.",
          "owner's private pad, which you never receive.",
        ]) assert.ok(prose.includes(required), `release instruction: ${required}`);
        for (const label of [
          "Record of agreed terms (fill in by hand)", "Owner reference",
          "Agreed identity checks", "Agreed notice / waiting period",
          "Authorised requesters", "Date received", "Provider signature",
          "Release log", "Date", "Requester", "Groups given", "Notes",
        ]) assert.ok(text.includes(label), `handwritten field: ${label}`);
        const content = streamsOf(document, page).join("\n");
        const tableRules = [...content.matchAll(/^48 ([\d.]+) m\n564 \1 l\nS$/gm)]
          .map((match) => Number(match[1])).filter((y) => y >= 101 && y <= 211);
        assert.equal(tableRules.length, 6, "release log has a header and four blank rows");
      }
      // No pad or plaintext, nor any other provider's name/ciphertext/CRC, on
      // either page. Only page 1 may contain the owning provider's ciphertext.
      for (const pad of pads) assert.ok(!joined.includes(pad) && letters !== pad);
      assert.ok(!joined.includes(P) && letters !== P);
      texts.forEach((other, otherIndex) => {
        if (otherIndex !== provider) {
          assert.ok(!joined.includes(other) && letters !== other);
          assert.ok(!joined.includes(formatCrc64(ciphertextCrc64(other))));
          assert.ok(!joined.includes(ciphertextCrc64(other)));
          assert.ok(!joined.includes(people[otherIndex].name));
        }
      });
    });
  }
  const pads = ["B".repeat(80), "C".repeat(80), "D".repeat(80)];
  const texts = pads.map((pad) => encryptPrefixes(P, pad));
  const people = keepers(3);
  const ok = { keepers: people, ciphertexts: texts, threshold: 2 };
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, ciphertexts: texts.slice(0, 2) }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, threshold: 4 }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, threshold: 3 })); // n must be at most m − 1
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, threshold: 1 }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, ciphertexts: ["a".repeat(80), ...texts.slice(1)] }));
  await assert.rejects(() => createKeeperCiphertextPdf({ ...ok, keepers: [{ name: " " }, ...people.slice(1)] }));
  await assert.rejects(() => createKeeperCiphertextPdf({ keepers: people.slice(0, 2), ciphertexts: texts.slice(0, 2), threshold: 1 }));
});

test("provider pack shrinks long names within margins and refuses unrenderable or overflowing names", async () => {
  const ciphertexts = ["A".repeat(80), "B".repeat(80), "C".repeat(80)];
  const people = keepers(3);
  people[0].name = "TEST ONLY " + "W".repeat(56);
  const document = await PDFDocument.load(await createKeeperCiphertextPdf({ keepers: people, ciphertexts, threshold: 2 }));
  for (const page of document.getPages().slice(0, 2)) {
    const name = runs(document, page, streamsOf(document, page).join("\n")).find((run) => run.value === people[0].name);
    assert.ok(name && name.size >= 8 && name.size < 14);
  }
  people[0].name = "W".repeat(300);
  await assert.rejects(() => createKeeperCiphertextPdf({ keepers: people, ciphertexts, threshold: 2 }), /page margins/);
  people[0].name = "TEST ONLY 山田";
  await assert.rejects(() => createKeeperCiphertextPdf({ keepers: people, ciphertexts, threshold: 2 }), /font cannot display/);
});

test("wallet line 01 gets the first bc1q address and a ticked Empty box on every copy", async () => {
  const address = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
  const pads = ["B".repeat(80), "C".repeat(80), "D".repeat(80)];
  const G = ["ABCDEFGH", "ABCDEFGH", "ABCDEFGH"]; const C = ["0000000000000000", "0000000000000000", "0000000000000000"];
  const base = { keepers: keepers(3), pads, threshold: 2, cipherGroups: G, ciphertextCrcs: C };
  const document = await PDFDocument.load(await createRecoveryPdf({ ...base, firstAddress: address }));
  assert.equal(document.getPageCount(), 4);
  for (const page of document.getPages()) {
    const overlay = streamsOf(document, page).at(-1);
    const found = runs(document, page, overlay).filter((r) => r.value === address);
    assert.equal(found.length, 1);
    const [run] = found;
    assert.ok(run.x === WALLET_ROW1.address.x && run.y > 257.98 && run.y < 285.78, "inside line 01 of the address column");
    assert.ok(run.size >= WALLET_ROW1.address.minSize && run.size <= WALLET_ROW1.address.maxSize);
    // Two strokes crossing the 7 x 7 Empty box at (286, 269.28).
    const strokes = [...overlay.matchAll(/^([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\nS$/gm)].map((m) => m.slice(1).map(Number))
      .filter(([x1, y1, x2, y2]) => [x1, x2].every((x) => x > 286 && x < 293) && [y1, y2].every((y) => y > 269.28 && y < 276.28));
    assert.equal(strokes.length, 2);
  }
  // Without an address the wallet table stays blank, as before.
  const plain = await PDFDocument.load(await createRecoveryPdf(base));
  const plainOverlay = streamsOf(plain, plain.getPages()[0]).at(-1);
  assert.ok(!runs(plain, plain.getPages()[0], plainOverlay).some((r) => r.value.startsWith("bc1")));
  await assert.rejects(() => createRecoveryPdf({ ...base, firstAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT" }));
  await assert.rejects(() => createRecoveryPdf({ ...base, firstAddress: address.slice(0, -1) + "v" }));
  await assert.rejects(() => createRecoveryPdf({ keepers: keepers(3), pads, threshold: 2, firstAddress: address }));
});
