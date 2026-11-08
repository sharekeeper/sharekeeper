/**
 * Browser-memory-only model. There is deliberately no account, database,
 * seed phrase, passphrase, encryption service, or server-side storage.
 */
export const PAD_LENGTH = 80;
export const GROUP_LENGTH = 4;
export const THRESHOLD = 3;
export const KEEPER_COUNTS = [2, 3, 4, 5];
/** Recovery threshold for a sheet: 3, or 2 when there are only 2 sharekeepers (2 of 2). */
export function thresholdFor(count) {
  return Math.min(THRESHOLD, count);
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
