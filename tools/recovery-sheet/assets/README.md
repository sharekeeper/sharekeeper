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
