# Sharekeeper website and recovery sheet generator

A browser-only interview for 3–5 sharekeepers, local pad generation, and a downloadable private A2 worksheet based on the supplied recovery-sheet prototype. This is an unaudited prototype, not a complete SLIP-39 backup system or an approved Sharekeeper protocol implementation.

The site also includes a separate public portal for the working standard, educational material, tools, and reviewed provider directory. Public portal code lives in `site/`; it is not imported into the secret generator.

## Use and build

Run these commands from this directory:

```sh
npm ci
npm test
npm run build
npm run preview
```

The production build puts the public portal at `dist/index.html`. `dist/recovery.html` and `dist/sharekeeper-offline.html` are identical, self-contained recovery application copies with embedded code, fonts, logo, and blank PDF background. Run `npm run dev:site` to develop the portal separately; the existing `npm run dev` remains the recovery-tool development server.

For private offline use, download the offline app before entering any contacts, disconnect from the network, and open that HTML file in a current browser. Generation fails closed if the required Web Crypto APIs are unavailable; do not disable browser security or substitute weaker randomness.

The embedded platform preview cannot reliably download a static HTML file, so its header offers Open standalone app in a new GitHub Pages tab. Contacts and keys are not transferred; use that standalone version for the offline-app download.

## Interview and output

- **Keepers:** Select 3, 4, or 5 and enter a name plus at least one contact channel for each. Account references, postal addresses, additional channels, and other optional fields are never invented.
- **Entropy contribution:** Move a mouse or finger in the collection area. Keyboard/tap timing is an accessible alternative; the UI identifies the contribution separately from browser randomness.
- **Review:** Confirm the contacts and two safety acknowledgments before generation. Contacts are validated for PDF fit and font support before keys are generated.
- **Private PDF:** Each active keeper gets an 80-letter A–Z pad, arranged in 20 four-letter groups and explicitly labeled K. Inactive slots are labeled NOT USED. Repeated downloads use the same document and pads, not newly generated keys.
- **Blank fields:** The first two expected ciphertext groups, the eight-hex-digit ciphertext CRC32 checksum, and the wallet/passphrase table remain blank. The tool never accepts or generates seed phrases, SLIP-39 shares, wallet passphrases, or ciphertext.

The 3-of-N heading is a worksheet layout label. The tool does not split a secret, validate a share set, enforce custody independence, or prove a recovery quorum.

## Two input sources and their limits

The UI explicitly names two inputs: the browser's cryptographic random-number generator and the user's movement/event-timing contribution. Timing is part of that user contribution, not advertised as a third independent entropy source.

- **Browser source:** A fresh 32-byte seed is drawn with `crypto.getRandomValues` for each keeper. Browser randomness is cryptographic pseudorandomness, not a physical true-randomness claim; see [MDN's getRandomValues documentation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).
- **User source:** Trusted pointer or timing input is collected only in the designated controls, bounded to 512 records, retained in browser memory, and never transmitted. Collection targets of 64 movement samples or 12 timing taps are usability thresholds, not measured entropy-bit ratings.
- **Mixing:** A snapshot of the user contribution is SHA-256 hashed. Each fresh random seed is imported as a nonextractable HKDF key, using the contribution hash as salt and versioned keeper/batch identifiers as context. The implementation uses Web Crypto's [HKDF-capable deriveBits API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits).
- **Alphabet mapping:** Derived bytes 234–255 are rejected. The accepted range 0–233 contains exactly nine representatives of each residue modulo 26, avoiding modulo bias in the A–Z selection.

This is computational key derivation. It does not establish information-theoretic one-time-pad security, 80 independently measured random-letter entropy, or a security-strength estimate for human gestures. Predictable movements do not replace, repair, or justify bypassing the required browser cryptographic source.

## Recovery-tool privacy boundary

The recovery tool has no backend, account, analytics, service worker, cookie, local storage, session storage, or IndexedDB. Contacts, input records, and generated material remain in application memory until explicitly exported as a private PDF.

The recovery production bundle has a hash-based script policy, `connect-src 'none'`, and `form-action 'none'`. PDF generation decodes embedded assets and never fetches or uploads user material. The offline download is the pristine build artifact, not a serialization of the live form.

The public portal is a separate bundle. A configured private provider application form can be opened there without mounting it in the recovery workspace. No provider application or reviewer contact should enter the public directory without explicit approval and publication consent. A locally downloaded application draft is not a submission and must be labeled accordingly.

Clearing a session revokes its active PDF URL, resets application state, and overwrites mutable input buffers on a best-effort basis. JavaScript strings, browser copies, cryptographic internals, downloaded files, screenshots, printers, and print queues cannot be guaranteed erased. Compromised browsers, extensions, devices, or distribution infrastructure remain outside this protection.

## Approval-only provider export

The offline helper `scripts/export-approved-providers.mjs` prepares a public candidate, never a publication. Keep its private input and output outside this repository; it performs no network or Google operations and never edits `site/providers.json`.

Input is `{ "schemaVersion": 1, "records": [...] }`. Every record must contain exactly `reviewStatus: "Approved"`, boolean `publicationApproved: true`, nonempty `reviewedBy` (maximum 160 characters), `reviewedAt` (a real, nonfuture `YYYY-MM-DD` date or timezone-qualified ISO timestamp), a stable nonempty `sourceSubmissionRef` (maximum 512 characters), and `publicListing`. The latter contains required `id`, `businessName`, HTTPS `website`, `jurisdiction`, `serviceArea`, `services`, and `description`; only `address`, `publicEmail`, and `publicPhone` are optional. IDs use lowercase letters, digits, hyphens or underscores. Services must be nonempty, unique members of `SERVICES` in `site/directory.js`; public text uses that module's existing limits (IDs: 100 characters), without silent trimming or truncation.

Applicant consent, raw form answers, public listing status, and private notes are not accepted as reviewer approval. Adapt the private review queue into this minimal transport-independent schema without copying raw Google responses into this repository. Unknown fields, nested public fields, invalid dates, duplicate sources or IDs, unsupported services, unsafe websites, any unapproved record, or an empty batch reject the whole batch without a partial export. Review metadata is validated but never included in output; only the existing public allowlist is emitted, with `status: "approved"` and the explicit review date as `reviewedOn`.

```sh
node scripts/export-approved-providers.mjs \
  --input /private/review-records.json \
  --output /private/new-public-candidate.json
```

Both the resolved private input and output must be outside the entire repository, including symlink destinations; input within the repository is rejected before reading. The output path must be explicit, new, and distinct from the input. Use a private, trusted output directory that other users or processes cannot rename or replace during export; filesystem checks do not protect against hostile concurrent directory replacement. Creation uses private file permissions and an atomic, no-overwrite final link after successful writing, syncing, and closing; failures at those stages leave no final candidate. Both API and CLI errors redact filesystem paths and private payloads.

A separate authorized human must inspect the public candidate and explicitly decide whether to publish it. This command never grants approval, publishes, commits, pushes, or deploys. Tests use synthetic data only; no actual applicant data belongs in fixtures or source control.

The output is a selected candidate batch to merge with the existing directory, not a full replacement directory. Preserve existing published entries when reviewing a merge; deleting any existing published entry requires separate authorization.

## Prototype profile and source preservation

The generator explicitly chooses an 80-letter, 20-by-4 worksheet profile. It does not turn that implementation choice or the sample into a finalized normative standard.

The newest supplied sample replaces its previous ciphertext SHA-256 field with CRC32 and eight hex cells. This generator does not implement ciphertext encryption or choose a CRC32 variant/serialization, so that field remains blank. CRC32 is not cryptographically strong and must not be presented as authentication or a digital signature ([Python zlib documentation](https://docs.python.org/3/library/zlib.html)).

The supplied PDF at `../../templates/recovery/slip39_recovery_sheet.pdf` is bundled byte for byte, and the generated sheet must match it precisely: its page content stream is reproduced unchanged and the generator only writes contacts into the seven template contact lines and pad letters into the 80 pad cells of each used share. For 3-of-3 and 3-of-4 sheets only the share-count digit in the header changes; unused share sections remain blank. Contacts are single lines fitted from 11pt down to 7pt on each line; values that do not fit are rejected, never truncated. There is no email line on the template, so the generator does not collect email. Copying only the page leaves out the source's Content Credentials, which do not attest to a filled-in sheet. It does not implement or enforce a custody agreement.

The latest source revision has more compact keeper sections, no authentication/notice or release-due header fields, and seven account/wallet rows. Its new recovery instructions are retained as supplied in the source and generated sheet, including the incomplete wording at the end of step 6. They remain prototype material requiring procedural review; this tool does not enter data into a hardware wallet, sign or broadcast transactions, destroy paper, or wipe a device.

Asset provenance and regeneration instructions are in `assets/README.md`. The generated PDF is a printable static sheet, not an editable AcroForm; editable template source has not been supplied.

## Tools-page CRC32 calculator

The separate website calculator uses CRC-32/ISO-HDLC (IEEE), with reflected polynomial `0xEDB88320`, initial value and final XOR `0xFFFFFFFF`, and an uppercase eight-hex-digit result including leading zeroes. The standard check input `123456789` produces `CBF43926`; empty input produces `00000000`.

Choose UTF-8 text or a local file of at most 10 MiB. Text preserves case, spaces, and Unicode without normalization; the browser textarea represents line breaks as LF, so choose File when original bytes, BOMs, or CRLF line endings must be preserved exactly. Files are read locally and never uploaded; no input is written to browser storage. Optional expected-value comparison and clipboard copying apply only to the checksum, with a manual selection fallback if the clipboard is unavailable.

This explicit utility profile does not finalize the Sharekeeper ciphertext encoding or CRC32 serialization. The private recovery generator and its offline copy remain unchanged and do not import this calculator or fill any ciphertext/CRC32 fields automatically.

## Verification

`npm test` covers both entropy inputs, rejection sampling, unsupported environments, buffer cleanup, all three keeper counts, exact pad placement, international font coverage, overflow failures, and contact geometry. `QA.md` contains the functional and visual browser acceptance inventory.

Test artifacts must use synthetic contacts and disposable pads. Never commit a completed recovery sheet or live recovery material to this repository.
