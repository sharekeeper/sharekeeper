# Sharekeeper.org

Canonical repository for the Sharekeeper.org nonprofit initiative's standard, educational material, tools, provider registry, and website. The standard and recovery tool remain working prototypes, not a finalized or audited security system.

## Website

The public website includes Home, Standard, Learn, Tools, Providers, and a provider application interface. The recovery-sheet generator runs in a separate browser document so its secret-handling boundary does not inherit a provider intake form or third-party frame.

- **Public portal:** `tools/recovery-sheet/dist/index.html`, built from `tools/recovery-sheet/site/`.
- **Private recovery workspace:** `tools/recovery-sheet/dist/recovery.html`.
- **Offline recovery workspace:** `tools/recovery-sheet/dist/sharekeeper-offline.html`, identical to the pristine recovery application.
- **Blank download:** The latest original sample recovery sheet, including its revised keeper layout and seven blank account/wallet rows, not a completed worksheet.
- **Provider directory:** Only approved public listing fields belong in the source-controlled directory. An empty directory must remain honestly empty until real listings are reviewed and approved.

Provider applications and private reviewer contacts must never be committed to this public repository. The application interface must disclose an unconfigured intake connection rather than pretend a draft was submitted; actual submission is enabled only after the private intake destination is connected and verified.

The native private application inbox is connected through Google Forms. See [provider registry operations](docs/provider-registry.md) for the reviewer interface, consent checks, and the separate approved-listing publication process.

## Repository contents

- **Recovery-sheet tool:** [Browser-only generator](tools/recovery-sheet/README.md) for a 2–5-sharekeeper interview, mixed-source local pad generation, and a private PDF.
- **Recovery-sheet prototype:** [Original supplied CRC32 sample and notes](templates/recovery/README.md), with earlier revisions retained in Git history.
- **Protocol notes:** [Working scope and open specification decisions](docs/protocol/README.md).
- **Branding:** [Current user-supplied logo prototypes](assets/brand/README.md), with earlier revisions retained in Git history.

## Secret-handling boundary

Store only blank templates, code, documentation, approved public provider listings, and explicitly synthetic test fixtures here. Completed recovery sheets, live pads, shares, seed phrases, wallet passphrases, private provider applications, and other live recovery material must never enter Git.
