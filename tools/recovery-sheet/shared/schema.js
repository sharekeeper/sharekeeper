/**
 * Browser-memory-only model. There is deliberately no account, database,
 * seed phrase, passphrase, encryption service, or server-side storage.
 */
export const PAD_LENGTH = 80;
export const GROUP_LENGTH = 4;
export const THRESHOLD = 3;
export const KEEPER_COUNTS = [2, 3, 4, 5];
/** Default recovery threshold for a sheet: 3, or 2 when there are only 2 sharekeepers. */
export function thresholdFor(count) {
  return Math.min(THRESHOLD, count);
}
/**
 * Thresholds a user can choose for m sharekeepers: n = m − 1 is always offered,
 * and otherwise 2 to m. So 2 sharekeepers allow 1 of 2 and 2 of 2; 3 to 5 allow
 * 2 to m. (SLIP-39 encodes 1 of 2 as two one-share groups, group threshold 1.)
 */
export function thresholdOptions(count) {
  if (!Number.isInteger(count) || count < 2) return [];
  return Array.from({ length: count }, (_, index) => index + 1).filter((n) => n >= 2 || n === count - 1);
}
export function isValidThreshold(threshold, count) {
  return thresholdOptions(count).includes(threshold);
}

export function blankKeeper(id) {
  return {
    id,
    name: "",
    address1: "",
    address2: "",
    region: "",
    reference: "",
    phone: "",
    website: "",
  };
}
