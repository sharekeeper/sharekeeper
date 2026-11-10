import test from "node:test";
import assert from "node:assert/strict";
import { formatShareWord, shareWordsForDisplay } from "../src/share-words.js";
import { WORDLIST } from "../src/slip39-wordlist.js";

test("first four letters uppercase, rest lowercase", () => {
  assert.equal(formatShareWord("academic"), "ACADemic");
  assert.equal(formatShareWord("ACID"), "ACID");
  assert.equal(formatShareWord("zero"), "ZERO");
  assert.equal(formatShareWord("Wildlife"), "WILDlife");
});

test("every wordlist entry keeps its letters and its unique prefix is uppercase", () => {
  const prefixes = new Set();
  for (const w of WORDLIST) {
    const d = formatShareWord(w);
    assert.equal(d.toLowerCase(), w);
    assert.equal(d.slice(0, 4), w.slice(0, 4).toUpperCase());
    prefixes.add(d.slice(0, 4));
  }
  assert.equal(prefixes.size, WORDLIST.length);
});

test("mnemonic split for display", () => {
  assert.deepEqual(shareWordsForDisplay(" duckling enlarge  academic "), ["DUCKling", "ENLArge", "ACADemic"]);
});
