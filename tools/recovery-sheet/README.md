# Sharekeeper recovery sheet generator

A browser-only interview for 3–5 sharekeepers, local pad generation, and a downloadable private A2 worksheet based on the supplied recovery-sheet prototype. This is an unaudited prototype, not a complete SLIP-39 backup system or an approved Sharekeeper protocol implementation.

## Use and build

Run these commands from this directory:

```sh
npm ci
npm test
npm run build
npm run preview
```

Open the displayed local URL. `dist/index.html` and `dist/sharekeeper-offline.html` are identical, self-contained application copies with embedded code, fonts, logo, and blank PDF background.

For private offline use, download the offline app before entering any contacts, disconnect from the network, and open that HTML file in a current browser. Generation fails closed if the required Web Crypto APIs are unavailable; do not disable browser security or substitute weaker randomness.

The embedded platform preview cannot reliably download a static HTML file, so its header offers Open standalone app in a new GitHub Pages tab. Contacts and keys are not transferred; use that standalone version for the offline-app download.

## Interview and output

- **Keepers:** Select 3, 4, or 5 and enter a name plus at least one contact channel for each. Account references, postal addresses, additional channels, and other optional fields are never invented.
- **Entropy contribution:** Move a mouse or finger in the collection area. Keyboard/tap timing is an accessible alternative; the UI identifies the contribution separately from browser randomness.
- **Review:** Confirm the contacts and two safety acknowledgments before generation. Contacts are validated for PDF fit and font support before keys are generated.
- **Private PDF:** Each active keeper gets an 80-letter A–Z pad, arranged in 20 four-letter groups and explicitly labeled K. Inactive slots are labeled NOT USED. Repeated downloads use the same document and pads, not newly generated keys.
- **Blank fields:** Ciphertext prefixes, ciphertext SHA-256 values, and the wallet/passphrase table remain blank. The tool never accepts or generates seed phrases, SLIP-39 shares, wallet passphrases, or ciphertext.

The 3-of-N heading is a worksheet layout label. The tool does not split a secret, validate a share set, enforce custody independence, or prove a recovery quorum.

## Two input sources and their limits

The UI explicitly names two inputs: the browser's cryptographic random-number generator and the user's movement/event-timing contribution. Timing is part of that user contribution, not advertised as a third independent entropy source.

- **Browser source:** A fresh 32-byte seed is drawn with `crypto.getRandomValues` for each keeper. Browser randomness is cryptographic pseudorandomness, not a physical true-randomness claim; see [MDN's getRandomValues documentation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).
- **User source:** Trusted pointer or timing input is collected only in the designated controls, bounded to 512 records, retained in browser memory, and never transmitted. Collection targets of 64 movement samples or 12 timing taps are usability thresholds, not measured entropy-bit ratings.
- **Mixing:** A snapshot of the user contribution is SHA-256 hashed. Each fresh random seed is imported as a nonextractable HKDF key, using the contribution hash as salt and versioned keeper/batch identifiers as context. The implementation uses Web Crypto's [HKDF-capable deriveBits API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits).
- **Alphabet mapping:** Derived bytes 234–255 are rejected. The accepted range 0–233 contains exactly nine representatives of each residue modulo 26, avoiding modulo bias in the A–Z selection.

This is computational key derivation. It does not establish information-theoretic one-time-pad security, 80 independently measured random-letter entropy, or a security-strength estimate for human gestures. Predictable movements do not replace, repair, or justify bypassing the required browser cryptographic source.

## Privacy boundary

There is no backend, account, analytics, service worker, cookie, local storage, session storage, or IndexedDB. Contacts, input records, and generated material remain in application memory until explicitly exported as a private PDF.

The production bundle has a hash-based script policy and `connect-src 'none'`. PDF generation decodes embedded assets and never fetches or uploads user material. The offline download is the pristine build artifact, not a serialization of the live form.

Clearing a session revokes its active PDF URL, resets application state, and overwrites mutable input buffers on a best-effort basis. JavaScript strings, browser copies, cryptographic internals, downloaded files, screenshots, printers, and print queues cannot be guaranteed erased. Compromised browsers, extensions, devices, or distribution infrastructure remain outside this protection.

## Prototype profile and source preservation

The generator explicitly chooses an 80-letter, 20-by-4 worksheet profile. It does not implement the draft diagram's 100-character profile or silently turn either prototype into a normative standard.

The supplied PDF remains unchanged at `../../templates/recovery/slip39_recovery_sheet.pdf`. A derived blank background strips inherited Content Credentials and the fixed seven-day instruction at the content-stream level; the generated worksheet instead refers to the user's agreed release policy. It does not choose between the prototype sheet's release timing and the diagram's different timing.

Asset provenance and regeneration instructions are in `assets/README.md`. The derivative PDF is a printable static worksheet, not an editable AcroForm; editable template source has not been supplied.

## Verification

`npm test` covers both entropy inputs, rejection sampling, unsupported environments, buffer cleanup, all three keeper counts, exact pad placement, international font coverage, overflow failures, and contact geometry. `QA.md` contains the functional and visual browser acceptance inventory.

Test artifacts must use synthetic contacts and disposable pads. Never commit a completed recovery sheet or live recovery material to this repository.
