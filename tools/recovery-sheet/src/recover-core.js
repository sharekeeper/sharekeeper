import { ciphertextCrc64, decryptCiphertext } from "./cipher.js";
import { normalizeCrc64Input } from "../site/crc64.js";
import { combineMnemonics, decodeMnemonic, mnemonicFromPrefixes } from "./slip39.js";
import { firstBip84Address, isP2wpkhAddress } from "./btc-address.js";
import { PAD_LENGTH } from "../shared/schema.js";

/**
 * Validation and decryption for the recovery side of the sheet:
 *   C (ciphertext from a sharekeeper) and K (pad on the owner's recovery sheet)
 *   -> P = (C - K) mod 26 -> 80 letters = 20 four-letter word prefixes
 *   -> the SLIP-39 share words, whose RS1024 checksum is then verified.
 * Any threshold-sized set of valid shares is combined in memory only to derive
 * the first BIP-84 address for comparison with line 01 of the sheet; the
 * recovered master secret is zeroed immediately and never returned.
 */

/** Uppercase letters only; spaces, line breaks and hyphens are ignored. */
export function normalizeLetters(text) {
  return String(text ?? "").replace(/[\s-]+/g, "").toUpperCase();
}

export function letterIssue(label, text) {
  const letters = normalizeLetters(text);
  if (!letters) return `${label}: not entered yet.`;
  if (!/^[A-Z]+$/.test(letters)) return `${label}: use only the letters A–Z.`;
  if (letters.length !== PAD_LENGTH) return `${label}: ${letters.length} of ${PAD_LENGTH} letters entered.`;
  return "";
}

function groupOf(index) {
  return String(Math.floor(index / 4) + 1).padStart(2, "0");
}

/**
 * Check one share. Inputs are as typed; returns a plain report. The decrypted
 * mnemonic is included only when every check passes (the caller decides when
 * to show it).
 */
export function analyzeShare({ ciphertext, pad, expectedCrc = "", expectedGroups = "" }) {
  const report = { ready: false, issues: [], crc: "", crcStatus: "none", groupsStatus: "none", mnemonic: "", share: null };
  const cIssue = letterIssue("Ciphertext", ciphertext);
  const c = normalizeLetters(ciphertext);
  if (!cIssue) {
    report.crc = ciphertextCrc64(c);
    const expected = String(expectedCrc).trim();
    if (expected) {
      const hex = normalizeCrc64Input(expected);
      report.crcStatus = !hex ? "invalid" : hex === report.crc ? "match" : "mismatch";
    }
    const groups = normalizeLetters(expectedGroups);
    if (groups) report.groupsStatus = !/^[A-Z]{8}$/.test(groups) ? "invalid" : groups === c.slice(0, 8) ? "match" : "mismatch";
  } else {
    report.issues.push(cIssue);
  }
  const kIssue = letterIssue("Pad (K) from your recovery sheet", pad);
  if (kIssue) report.issues.push(kIssue);
  if (report.crcStatus === "mismatch") report.issues.push("The CRC64 of this ciphertext does not match the value on your sheet: a letter was probably copied wrongly. Ask the sharekeeper to read the groups again.");
  if (report.crcStatus === "invalid") report.issues.push("Expected CRC64: enter the 16 hex digits from your sheet (spaces optional).");
  if (report.groupsStatus === "mismatch") report.issues.push("Groups 01–02 differ from the first cipher groups on your sheet.");
  if (report.groupsStatus === "invalid") report.issues.push("Expected first groups: enter the 8 letters from your sheet.");
  if (cIssue || kIssue) return report;

  const prefixes = decryptCiphertext(c, normalizeLetters(pad));
  let mnemonic;
  try {
    mnemonic = mnemonicFromPrefixes(prefixes);
  } catch (error) {
    const match = /Prefix (\d+)/.exec(error?.message ?? "");
    const group = match ? String(Number(match[1])).padStart(2, "0") : "";
    report.issues.push(group
      ? `Group ${group} does not decrypt to a SLIP-39 word. Check the ciphertext and pad letters in group ${group}.`
      : "The letters do not decrypt to SLIP-39 words. Check the ciphertext and pad.");
    return report;
  }
  let share;
  try {
    share = decodeMnemonic(mnemonic);
  } catch {
    report.issues.push("Every group decrypts to a word, but the share checksum fails: at least one letter is wrong in the ciphertext or pad (a wrong letter can still form a valid word).");
    return report;
  }
  share.value?.fill?.(0);
  if (share.groupCount !== 1 || share.groupThreshold !== 1 || share.wordCount !== 20) {
    report.issues.push("This is a valid SLIP-39 share, but not a single-level 20-word share as this tool creates.");
    return report;
  }
  report.share = { identifier: share.identifier, memberIndex: share.memberIndex, memberThreshold: share.memberThreshold, iterationExponent: share.iterationExponent, extendable: share.extendable };
  report.mnemonic = mnemonic;
  report.ready = report.issues.length === 0;
  return report;
}

/**
 * Group valid reports by share set (identifier), and say whether a set has
 * enough distinct members to recover.
 */
export function summarizeSets(reports) {
  const sets = new Map();
  reports.forEach((report, slot) => {
    if (!report?.ready) return;
    const key = report.share.identifier;
    if (!sets.has(key)) sets.set(key, { identifier: key, threshold: report.share.memberThreshold, slots: [], members: new Set(), duplicates: [] });
    const set = sets.get(key);
    if (set.members.has(report.share.memberIndex)) set.duplicates.push(slot);
    else { set.members.add(report.share.memberIndex); set.slots.push(slot); }
  });
  return [...sets.values()].map((set) => ({ ...set, members: [...set.members], enough: set.members.size >= set.threshold }));
}

/**
 * Combine exactly `threshold` shares of one set with the passphrase, derive
 * the first BIP-84 address, and zero the recovered master secret.
 */
export async function recoverFirstAddress({ mnemonics, passphrase = "", expectedAddress = "", crypto = globalThis.crypto }) {
  let secret;
  try {
    secret = await combineMnemonics(mnemonics, passphrase, crypto);
    const address = firstBip84Address(secret);
    const expected = String(expectedAddress).trim();
    const expectedStatus = !expected ? "none" : !isP2wpkhAddress(expected) ? "invalid" : expected === address ? "match" : "mismatch";
    return { address, expectedStatus };
  } finally {
    secret?.fill?.(0);
  }
}
