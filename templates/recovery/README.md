# Sharekeeper SLIP-39 recovery sheet prototype

`slip39_recovery_sheet.pdf` preserves the latest, unmodified blank recovery-sheet prototype supplied by the project founder. Its instructions are design input, not an approved Sharekeeper standard or an audited recovery procedure.

- **Original filename:** `slip39_recovery_sheet.pdf`
- **Status:** Prototype
- **Printed format:** One-page US Letter (612 × 792 pt)
- **SHA-256:** `8bc121acfea77e62f98d797141e3fe1108f9fe4b20218c72b6a611699bf9961d`
- **License:** Not yet specified

The US Letter revision is the previous A2 sheet, unchanged, placed in a scaled form XObject (matrix 0.4836, offset 18.106/−24.934 pt, cropped to its outer margins); its drawing stream is byte-identical to the A2 revision. Earlier committed revisions remain intact in Git history. Two earlier CRC32 uploads were byte-identical; this latest revision is different, and all supplied attachment files remain retained.

Replace the canonical PDF only with new user-supplied revisions, preserving the uploaded bytes, and add editable source files separately when available. The latest upload was compared byte-for-byte with this canonical PDF.

The latest supplied revision labels each verification field `Expected Ciphertext CRC32:` with `8 hex digits` and eight entry cells. Its `FIRST 2 CIPHER GROUPS` fields have two four-cell groups, while the main grid remains twenty four-letter groups per share; neither the checksum variant nor its exact ciphertext serialization is specified.

This revision removes the authentication/notice and release-due header fields, compacts the five keeper cards to a 200-point stride, and expands the account/wallet table from five rows to seven. Recovery steps 6–8 now refer to scratch paper, destroying it after hardware-wallet entry, and signing/broadcasting a transaction before wiping the hardware wallet; step 6 literally ends `into a HW` and needs editorial clarification before this can be treated as a complete recovery procedure.

## Cross-artifact consistency

The [working protocol notes](../../docs/protocol/README.md#open-specification-decisions) track encoding, entry-field, checksum-profile, and release-policy questions against the latest sheet. Instructions removed from earlier revisions are not assumed to remain in force, and the sample is not promoted to a finalized normative standard.

## Secret-handling boundary

Only blank templates and explicitly labeled synthetic test fixtures belong in this repository. Never commit completed recovery sheets, live shares or seed phrases, secret pads, wallet passphrases, or other live recovery data.

## Browser generator

The [browser-only generator](../../tools/recovery-sheet/README.md) reproduces this sample's page exactly and writes only into its blank fields: each keeper's seven contact lines (Name, Street Address, Street Address 2, State/Country Postal Code, Account No., Phone, Website) and the 80 cells of that share's pad grid. Every other mark on the page, including the instructions, the seven-day release text, labels, and box geometry, is the template's own content stream. For any sheet other than 3 of 5, only the threshold and share-count digits in the header change (to the chosen n OF m), in the template's font; unused share sections stay blank.

First cipher groups, ciphertext CRC32 cells, and wallet/passphrase entries stay blank; no checksum of a pad is calculated, and no seed or share input is accepted. The generator does not implement or enforce a custody agreement.
