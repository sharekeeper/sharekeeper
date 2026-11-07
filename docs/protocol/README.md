# Sharekeeper protocol-flow sketch

`sharekeeper-protocol-diagram.pdf` preserves the original, unmodified protocol-flow sketch supplied by the project founder. It is draft design input, not an approved normative standard or an audited recovery procedure.

- **Original filename:** `sharekeeper-protocol-diagram.pdf`
- **Status:** Sketch / prototype
- **Length:** Four pages
- **SHA-256:** `e37548a520a777403eb941d325c5533963bffdb55dae5435b38d5e895e0b0619`
- **License:** Not yet specified

The sketch covers setup and enrollment, authentication and release, local recovery, and edge cases and lifecycle. Keep the supplied PDF intact and add reviewed revisions or editable source separately when available.

## Cross-artifact decisions to reconcile

The sketch and the latest [recovery-sheet prototype](../../templates/recovery/slip39_recovery_sheet.pdf) leave the following parameters to reconcile or specify. These questions are recorded here without changing either supplied PDF or treating upload order as normative approval.

- **Pad length and encoding:** The flow sketch specifies an independent 100-character one-time pad for each share. The latest recovery sheet has a 20-word, four-letter-prefix header and twenty four-letter entry groups per share, but no longer states an 80-letter pad length or pad-generation rules. The earlier sheet's explicit 80-letter pad instruction remains in Git history; it must not be treated as an instruction in the current sheet.
- **Entry-field roles and hash format:** The latest sheet retains a K/C/P legend, but its twenty entry groups are no longer split into separately labeled K and C rows. It asks for ciphertext SHA-256 verification before decryption but no longer states the byte-level hash serialization. Confirm what each entry field stores and specify the exact encoding, pad length, and bytes to hash before implementation.
- **Release timing:** The flow sketch specifies a two-business-day wait for live-video and notarized-remote releases, no remote hold for in-person releases, and a separate two-business-day contact-change hold. The recovery sheet instructs the client to retain notice of a seven-day release time.

Resolve these parameters explicitly before producing a unified standard, implementation, or production recovery template. This intake note does not establish security, legal sufficiency, or wallet interoperability.
