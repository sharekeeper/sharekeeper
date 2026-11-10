/**
 * Optional user-supplied SLIP-39 master secret for the create workflow.
 *
 * Accepted form: exactly 32 hexadecimal digits (128 bits, the master-secret
 * size whose SLIP-39 shares have 20 words), upper or lower case, with optional
 * spaces anywhere for readability. Nothing else is accepted: SLIP-39 also
 * allows longer master secrets, but they give longer shares than the sheet's
 * 20 groups. SLIP-39 itself requires at least 128 bits and a multiple of 16
 * bits (https://github.com/satoshilabs/slips/blob/master/slip-0039.md).
 */
import { MASTER_SECRET_BYTES } from "./master-secret.js";

export const OWN_SECRET_HEX_DIGITS = MASTER_SECRET_BYTES * 2;

/**
 * @returns {{ status: "empty"|"invalid"|"short"|"long"|"weak"|"ok", digits: number, message: string }}
 * Never returns the secret; use masterSecretFromHex for the bytes.
 */
export function checkMasterSecretHex(text) {
  const value = String(text ?? "");
  if (/[^0-9a-fA-F ]/.test(value)) {
    return { status: "invalid", digits: countDigits(value), message: "Use only the digits 0–9, the letters A–F and spaces." };
  }
  const digits = value.replace(/ /g, "");
  if (digits.length === 0) return { status: "empty", digits: 0, message: `Enter ${OWN_SECRET_HEX_DIGITS} hexadecimal digits.` };
  if (digits.length < OWN_SECRET_HEX_DIGITS) return { status: "short", digits: digits.length, message: `${digits.length} of ${OWN_SECRET_HEX_DIGITS} digits: ${OWN_SECRET_HEX_DIGITS - digits.length} more needed.` };
  if (digits.length > OWN_SECRET_HEX_DIGITS) return { status: "long", digits: digits.length, message: `${digits.length} digits: exactly ${OWN_SECRET_HEX_DIGITS} are needed (128 bits).` };
  if (/^(.)\1*$/i.test(digits)) return { status: "weak", digits: digits.length, message: "A single repeated digit is not a secret. Use a randomly generated value." };
  return { status: "ok", digits: digits.length, message: `${OWN_SECRET_HEX_DIGITS} of ${OWN_SECRET_HEX_DIGITS} digits (128 bits).` };
}

function countDigits(value) {
  return (value.match(/[0-9a-fA-F]/g) || []).length;
}

/** 16 bytes for a valid entry; the caller must zero them after use. */
export function masterSecretFromHex(text) {
  const check = checkMasterSecretHex(text);
  if (check.status !== "ok") throw new Error(check.message);
  const digits = String(text).replace(/ /g, "");
  const bytes = new Uint8Array(MASTER_SECRET_BYTES);
  for (let index = 0; index < MASTER_SECRET_BYTES; index += 1) {
    bytes[index] = parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
