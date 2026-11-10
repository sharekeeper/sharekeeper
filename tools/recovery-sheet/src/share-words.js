/**
 * Display form of a SLIP-39 share word: the first four letters, which are
 * unique within the SLIP-39 wordlist, in uppercase; the rest in lowercase.
 * Display only; the mnemonic itself is never changed.
 */
export function formatShareWord(word) {
  const lower = String(word).toLowerCase();
  return lower.slice(0, 4).toUpperCase() + lower.slice(4);
}

export function shareWordsForDisplay(mnemonic) {
  return String(mnemonic).trim().split(/\s+/).filter(Boolean).map(formatShareWord);
}
