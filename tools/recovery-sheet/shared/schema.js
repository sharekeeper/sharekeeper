/**
 * Browser-memory-only model. There is deliberately no account, database,
 * seed phrase, passphrase, encryption service, or server-side storage.
 */
export const PAD_LENGTH = 80;
export const GROUP_LENGTH = 4;
export const THRESHOLD = 3;
/**
 * 3 to 5 sharekeepers. The recovery threshold must always be at least one less
 * than the total (n ≤ m − 1) and at least 2 (SLIP-39 single-level), so 2
 * sharekeepers would leave no valid threshold and are not offered.
 */
export const KEEPER_COUNTS = [3, 4, 5];
/** Default recovery threshold: 3, but never more than m − 1 (so 2 of 3, 3 of 4, 3 of 5). */
export function thresholdFor(count) {
  return Math.min(THRESHOLD, count - 1);
}
/**
 * Thresholds a user can choose for m sharekeepers: 2 to m − 1. At least one
 * sharekeeper can always be lost (n is never equal to m), and only SLIP-39
 * single-level schemes are offered (one group, GT = 1, G = 1, 2 ≤ T < N); the
 * spec forbids member threshold 1 with more than one share.
 */
export function thresholdOptions(count) {
  if (!Number.isInteger(count) || !KEEPER_COUNTS.includes(count)) return [];
  return Array.from({ length: count - 2 }, (_, index) => index + 2);
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
