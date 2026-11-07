# Sharekeeper SLIP-39 recovery sheet prototype

`slip39_recovery_sheet.pdf` preserves the latest, unmodified blank recovery-sheet prototype supplied by the project founder. Its instructions are design input, not an approved Sharekeeper standard or an audited recovery procedure.

- **Original filename:** `slip39_recovery_sheet.pdf`
- **Status:** Prototype
- **Printed format:** One-page A2 master
- **SHA-256:** `fe2c68537d6fb73c28307fbb19a43c48202c09c264030c2f175c28c10dc5a1c6`
- **License:** Not yet specified

Earlier committed revisions remain intact in Git history. Two earlier CRC32 uploads were byte-identical; this latest revision is different, and all supplied attachment files remain retained.

Replace the canonical PDF only with new user-supplied revisions, preserving the uploaded bytes, and add editable source files separately when available. The latest upload was compared byte-for-byte with this canonical PDF.

The latest supplied revision labels each verification field `Expected Ciphertext CRC32:` with `8 hex digits` and eight entry cells. Its `FIRST 2 CIPHER GROUPS` fields have two four-cell groups, while the main grid remains twenty four-letter groups per share; neither the checksum variant nor its exact ciphertext serialization is specified.

This revision removes the authentication/notice and release-due header fields, compacts the five keeper cards to a 200-point stride, and expands the account/wallet table from five rows to seven. Recovery steps 6–8 now refer to scratch paper, destroying it after hardware-wallet entry, and signing/broadcasting a transaction before wiping the hardware wallet; step 6 literally ends `into a HW` and needs editorial clarification before this can be treated as a complete recovery procedure.

## Cross-artifact consistency

The [working protocol notes](../../docs/protocol/README.md#open-specification-decisions) track encoding, entry-field, checksum-profile, and release-policy questions against the latest sheet. Instructions removed from earlier revisions are not assumed to remain in force, and the sample is not promoted to a finalized normative standard.

## Secret-handling boundary

Only blank templates and explicitly labeled synthetic test fixtures belong in this repository. Never commit completed recovery sheets, live shares or seed phrases, secret pads, wallet passphrases, or other live recovery data.

## Browser generator

The [browser-only generator](../../tools/recovery-sheet/README.md) creates a distinct derivative worksheet with user-entered contact information and explicitly labeled 80-letter private K pads. It leaves ciphertext prefixes, ciphertext CRC32 cells, and wallet/passphrase entries blank; no checksum of a pad is calculated, and no seed or share input is accepted.

The derivative uses the neutral instruction to follow the agreed release policy. The uploaded source remains byte-for-byte unchanged, including its seven-day release-time instruction; the generator does not implement or enforce a custody agreement.

The derivative retains the latest recovery steps verbatim and all seven blank wallet rows. Its contact rows remain 17 points high for exact two-line text at no less than 8pt, so only the ciphertext-prefix number headings are lowered by 3.25 points and reduced from 10pt to 9.5pt; the actual entry boxes retain their source geometry.
