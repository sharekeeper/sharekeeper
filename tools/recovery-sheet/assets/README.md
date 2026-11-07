# PDF support assets

`prepare_pdf_assets.py` generates `src/pdf-assets.js` from the repository's
original recovery-sheet template and the public DejaVu Sans font. This generated
JavaScript is intentional: all bytes are bundled in both development and
production, so PDF export requires no `fetch`, network request, font service, or
runtime resource loading.

The source at `templates/recovery/slip39_recovery_sheet.pdf` is not modified.
The derivative removes only labels redrawn by the PDF module, the old seven-day
policy, and static "Empty" hints in the blank wallet table. Copying only the page
also removes the source document's Content Credentials attachments and catalog
claims. The generated PDF is a modified prototype, not an attested original.

The current source revision has SHA-256
`e2305bc78fee87e357f15bf67462c0cba9a98f2bec28e64d55b68933857ee270`.
Its ciphertext verification labels are `Expected Ciphertext CRC32:` and
`8 hex digits`, with eight 20-by-20-point cells per keeper. The two relocated
`FIRST 2 CIPHER GROUPS` use four 14.2-by-26-point cells each; the main pad
grid remains twenty groups of four 16-by-26-point cells.

The asset script pins the reviewed source hash and checks these checksum labels
and cell geometry before bundling. The generator fills only contacts and the
explicit 80-letter private K-pad grid; ciphertext prefixes and CRC32 cells stay
blank, and it never computes a checksum of a pad. The source's seven-day release
instruction stays intact in the canonical PDF; only the derivative replaces it
with the agreed-release-policy wording.

DejaVu Sans is embedded with subsetting in each PDF. Its license is included as
`DejaVuSans-LICENSE.txt`. Latin accents, Greek, Cyrillic, and other characters in
the font can be preserved; glyphs missing from the font are explicitly rejected.

## Web branding asset

`prepare_web_assets.py` creates `logo-with-domain.webp` from the canonical
`assets/brand/logo-with-domain.png`. It preserves the full artwork and aspect
ratio at a web-serving resolution, using lossless WebP encoding; the supplied
PNG remains unchanged. Regenerate with `python assets/prepare_web_assets.py`
when the canonical logo changes (requires Pillow).

## Offline distribution notices

`third-party-notices.txt` contains the applicable runtime-library and font
copyright and license notices. The build embeds its text in a non-executing
HTML template so both self-contained application copies retain the notices
without a network request or extra download.
