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
 * Thresholds a user can choose for m sharekeepers: 2 to m. Only SLIP-39
 * single-level schemes are offered (one group, GT = 1, G = 1, 2 ≤ T ≤ N); the
 * spec forbids member threshold 1 with more than one share, and multi-group
 * workarounds such as 1 of 2 are deliberately not offered.
 */
export function thresholdOptions(count) {
  if (!Number.isInteger(count) || count < 2) return [];
  return Array.from({ length: count - 1 }, (_, index) => index + 2);
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
