# Sharekeeper.org

Canonical repository for the Sharekeeper.org nonprofit's standard, educational material, tools, provider registry, and website. The current contents are prototype design inputs and a browser-based recovery-sheet generator, not a finalized standard or a production provider registry.

## Repository contents

- **Recovery-sheet tool:** [Browser-only generator](tools/recovery-sheet/README.md) for a 3–5-sharekeeper interview, mixed-source local pad generation, and a private PDF.
- **Recovery-sheet prototype:** [Original supplied PDF and notes](templates/recovery/README.md), with earlier revisions retained in Git history.
- **Protocol flow:** [Draft diagram and open consistency decisions](docs/protocol/README.md).
- **Branding:** [Current user-supplied logo prototypes](assets/brand/README.md), with earlier revisions retained in Git history.

## Secret-handling boundary

Store only blank templates, code, documentation, and explicitly synthetic test fixtures here. Completed recovery sheets, live pads, shares, seed phrases, wallet passphrases, and other live recovery material must never enter Git.
