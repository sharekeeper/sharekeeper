# Sharekeeper SLIP-39 recovery sheet prototype

`slip39_recovery_sheet.pdf` preserves the latest, unmodified blank recovery-sheet prototype supplied by the project founder. Its instructions are design input, not an approved Sharekeeper standard or an audited recovery procedure.

- **Original filename:** `slip39_recovery_sheet.pdf`
- **Status:** Prototype
- **Printed format:** One-page A2 master
- **SHA-256:** `e2305bc78fee87e357f15bf67462c0cba9a98f2bec28e64d55b68933857ee270`
- **License:** Not yet specified

Earlier committed revisions remain intact in Git history. The two latest CRC32 uploads are byte-identical; the intermediate upload was not separately committed and remains in its original attachment storage.

Replace the canonical PDF only with new user-supplied revisions, preserving the uploaded bytes, and add editable source files separately when available. The latest re-upload was compared byte-for-byte with this canonical PDF.

The latest supplied revision labels each verification field `Expected Ciphertext CRC32:` with `8 hex digits` and eight entry cells. Its `FIRST 2 CIPHER GROUPS` fields have two four-cell groups, while the main grid remains twenty four-letter groups per share; neither the checksum variant nor its exact ciphertext serialization is specified.

## Cross-artifact consistency

The [working protocol notes](../../docs/protocol/README.md#open-specification-decisions) track encoding, entry-field, checksum-profile, and release-policy questions against the latest sheet. Instructions removed from earlier revisions are not assumed to remain in force, and the sample is not promoted to a finalized normative standard.

## Secret-handling boundary

Only blank templates and explicitly labeled synthetic test fixtures belong in this repository. Never commit completed recovery sheets, live shares or seed phrases, secret pads, wallet passphrases, or other live recovery data.

## Browser generator

The [browser-only generator](../../tools/recovery-sheet/README.md) creates a distinct derivative worksheet with user-entered contact information and explicitly labeled 80-letter private K pads. It leaves ciphertext prefixes, ciphertext CRC32 cells, and wallet/passphrase entries blank; no checksum of a pad is calculated, and no seed or share input is accepted.

The derivative uses the neutral instruction to follow the agreed release policy. The uploaded source remains byte-for-byte unchanged, including its seven-day release-time instruction; the generator does not implement or enforce a custody agreement.
