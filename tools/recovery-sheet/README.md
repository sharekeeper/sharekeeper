# Sharekeeper website and recovery sheet generator

A browser-only interview for 2–5 sharekeepers, local pad generation, and a downloadable private US Letter recovery sheet based on the supplied recovery-sheet prototype. This is an unaudited prototype, not a complete SLIP-39 backup system or an approved Sharekeeper protocol implementation.

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

- **Keepers:** Select 2, 3, 4, or 5 sharekeepers (m) and how many are needed to recover (n, from 2 to m), then enter a name plus at least one contact channel for each. Account references, postal addresses, additional channels, and other optional fields are never invented.
- **Entropy contribution:** Move a mouse or finger in the collection area. Keyboard/tap timing is an accessible alternative; the UI identifies the contribution separately from browser randomness.
- **Review:** Confirm the contacts and two safety acknowledgments before generation. Contacts are validated for PDF fit and font support before keys are generated.
- **Private PDF:** One PDF holds 4 identical copies of the recovery sheet, one per page, each labeled COPY 1 OF 4 to COPY 4 OF 4 in the left margin. Each active keeper gets an 80-letter A–Z pad, arranged in 20 four-letter groups and explicitly labeled K. Inactive slots are labeled NOT USED. Repeated downloads use the same document and pads, not newly generated keys.
- **Filled and blank fields:** In a real offline run the sheet also gets each share's first two ciphertext groups and its sixteen-hex-digit ciphertext CRC64 (CRC-64/XZ of the 80 ciphertext letters as uppercase ASCII, no spaces). Line 01 of the wallet table gets the seed's first native SegWit receive address (bc1q, [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki) path m/84'/0'/0'/0/0) with its passphrase box ticked Empty: per [SLIP-0039](https://github.com/satoshilabs/slips/blob/master/slip-0039.md) the master secret is the BIP-32 master seed, and an empty passphrase is the default. The tool checks the address again from a recovered share set; tests cover the BIP-84 published vector and an independent Python (embit) derivation. Lines 02–07 stay blank. The tool never imports an existing seed or creates wallet passphrases.

The sheet header shows the chosen "n OF m" (default 3 of 5); only those two digits of the template change. With n = m, losing any one sharekeeper makes recovery impossible. It is a worksheet label; the tool does not split a secret, validate a share set, enforce custody independence, or prove a recovery quorum.

## Two input sources and their limits

The UI explicitly names two inputs: the browser's cryptographic random-number generator and the user's movement/event-timing contribution. Timing is part of that user contribution, not advertised as a third independent entropy source.

- **Browser source:** A fresh 200-byte (1600-bit) seed is drawn with `crypto.getRandomValues` for each keeper pad. Browser randomness is cryptographic pseudorandomness, not a physical true-randomness claim; see [MDN's getRandomValues documentation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).
- **User source:** Trusted pointer or timing input is collected only in the designated controls, bounded to 12,000 records, retained in browser memory, and never transmitted. Generation is enabled only after a heuristic score reaches 1600. The score is expressed in bits but is not measured entropy; predictable motion (for example a fixed back-and-forth pattern) can still score, although repeated position changes earn nothing. The estimate follows the Linux kernel's input estimator: per axis, the smallest of the first, second and third differences earns floor(log2(m)) bits when m ≥ 2. Pointer events use whole-pixel x/y and are capped at 2 bits each; keyboard/tap events use the millisecond interval and are capped at 4 bits each. A position change identical to one of the previous 16 earns nothing. It is a collection gate, not a measurement or guarantee.
- **Mixing:** For each pad, the full user record (binary, 20 bytes per event) is expanded to a 200-byte block with SHA-512 in counter mode, domain-separated by keeper, block and chunk. That block is XORed byte by byte with the 200-byte browser seed. No intermediate short key or 256-bit hash is used. The 200-byte block length is not an entropy or security-strength claim. Because the browser bytes are uniform and independent of the user block, the XOR is uniform; if the browser generator were weak, the user block would help only to the extent the user input is genuinely unknown and unpredictable. About 183 of the 200 combined bytes are accepted on average; another independent 200-byte block is used only if a block runs short.
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

The newest supplied sample has an eight-cell `Expected Ciphertext CRC32` field. At the owner's request the tool uses CRC64 everywhere instead: CRC-64/XZ (ECMA-182 polynomial `0x42F0E1EBA9EA3693`, reflected, initial value and final XOR all ones; check value `995DC9BBDF1939FA` per the [CRC RevEng catalogue](https://reveng.sourceforge.io/crc-catalogue/17plus.htm)) over the 80 ciphertext letters as uppercase ASCII with no spaces. A CRC offers no authentication and must not be presented as a digital signature ([cyclic redundancy check overview](https://en.wikipedia.org/wiki/Cyclic_redundancy_check#Data_integrity)).

The supplied PDF at `../../templates/recovery/slip39_recovery_sheet.pdf` is bundled byte for byte, and the generated sheet must match it precisely: its page content stream is reproduced unchanged apart from the changes below (CRC64 field, n OF m header, unused sections), and the generator only writes contacts into the seven template contact lines and pad letters into the 80 pad cells of each used share. On every sheet the CRC32 field becomes a CRC64 field: both labels and recovery step 5 say CRC64, eight more cells in the template's own cell style follow the existing eight, and the hint reads `16 hex digits`, moved right past the new cells (all in the template's own fonts). For any sheet other than 3 of 5, the threshold and share-count digits in the header change (to the chosen n OF m), and the drawing of each unused share section (SHARE 04 and 05 for three sharekeepers, SHARE 05 for four) is removed whole, leaving that area of the page blank. The used share sections and the rest of the page stay unchanged. Contacts are single lines fitted from 11pt down to 7pt on each line; values that do not fit are rejected, never truncated. There is no email line on the template, so the generator does not collect email. Copying only the page leaves out the source's Content Credentials, which do not attest to a filled-in sheet. It does not implement or enforce a custody agreement.

The latest source revision has more compact keeper sections, no authentication/notice or release-due header fields, and seven account/wallet rows. Its new recovery instructions are retained as supplied in the source and generated sheet, including the incomplete wording at the end of step 6. They remain prototype material requiring procedural review; this tool does not enter data into a hardware wallet, sign or broadcast transactions, destroy paper, or wipe a device.

Asset provenance and regeneration instructions are in `assets/README.md`. The generated PDF is a printable static sheet, not an editable AcroForm; editable template source has not been supplied.

## Tools-page CRC64 calculator

The separate website calculator uses the same CRC-64/XZ profile as the sheet (`site/crc64.js`): reflected polynomial `0xC96C5795D7870F42`, initial value and final XOR `0xFFFFFFFFFFFFFFFF`, and an uppercase sixteen-hex-digit result including leading zeroes, displayed (and copied) in groups of four such as `995D C9BB DF19 39FA`; the expected-value box accepts the digits with or without spaces. The hand-out and results screen show the ciphertext CRC64 the same way; the sheet's sixteen cells hold one digit each. The check input `123456789` produces `995DC9BBDF1939FA`; empty input produces `0000000000000000`. Tests compare it with an independent bit-by-bit model and with the CRC64 that `xz` records.

Choose UTF-8 text or a local file of at most 10 MiB. Text preserves case, spaces, and Unicode without normalization; the browser textarea represents line breaks as LF, so choose File when original bytes, BOMs, or CRLF line endings must be preserved exactly. Files are read locally and never uploaded; no input is written to browser storage. Optional expected-value comparison and clipboard copying apply only to the checksum, with a manual selection fallback if the clipboard is unavailable.

Pasting a share's 80 ciphertext letters as uppercase text with no spaces gives the CRC64 printed on the sheet and hand-out. This explicit profile does not finalize a Sharekeeper standard.

## Verification

`npm test` covers both entropy inputs, rejection sampling, unsupported environments, buffer cleanup, all three keeper counts, exact pad placement, international font coverage, overflow failures, and contact geometry. `QA.md` contains the functional and visual browser acceptance inventory.

Test artifacts must use synthetic contacts and disposable pads. Never commit a completed recovery sheet or live recovery material to this repository.
