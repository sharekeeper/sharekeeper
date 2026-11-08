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
/** Thresholds a user can choose for m sharekeepers: 2 to m (SLIP-39 needs at least 2 when m > 1). */
export function thresholdOptions(count) {
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => index + 2);
}
export function isValidThreshold(threshold, count) {
  return Number.isInteger(threshold) && threshold >= 2 && threshold <= count;
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
