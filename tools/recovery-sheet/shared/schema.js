/**
 * Browser-memory-only model. There is deliberately no account, database,
 * seed phrase, passphrase, encryption service, or server-side storage.
 */
export const PAD_LENGTH = 80;
export const GROUP_LENGTH = 4;
export const THRESHOLD = 3;
export const KEEPER_COUNTS = [3, 4, 5];

export function blankKeeper(id) {
  return {
    id,
    name: "",
    address1: "",
    address2: "",
    region: "",
    reference: "",
    phone: "",
    email: "",
    website: "",
  };
}
