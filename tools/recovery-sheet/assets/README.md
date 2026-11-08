# PDF support assets

`prepare_pdf_assets.py` generates `src/pdf-assets.js` from the repository's
original recovery-sheet template and the public DejaVu Sans font. This generated
JavaScript is intentional: all bytes are bundled in both development and
production, so PDF export requires no `fetch`, network request, font service, or
runtime resource loading.

The source at `templates/recovery/slip39_recovery_sheet.pdf` is not modified and
is bundled byte for byte as `TEMPLATE_BASE64`; tests check its SHA-256. The
generated sheet reproduces that page's content stream unchanged and adds one
overlay stream containing only contact values and pad letters. Copying only the
page into a new document leaves out the source's Content Credentials attachments
and catalog claims, which do not attest to a filled-in sheet.

The current source revision has SHA-256
`fe2c68537d6fb73c28307fbb19a43c48202c09c264030c2f175c28c10dc5a1c6`.
The asset script asserts the reviewed labels, the header literal `3 OF 5  |`,
and the 400 pad cells (16 by 26 points) before bundling.

Values are written on the template's own geometry: the seven contact rules per
share (14.5-point pitch, ending at x=335; values fitted on one line from 11pt
down to 7pt) and the twenty four-cell pad groups (letters at 15pt, centred).
Ciphertext prefixes, CRC32 cells and wallet rows stay blank, and the generator
never computes a checksum of a pad. For 3-of-3 and 3-of-4 sheets the only change
to the template stream is the share-count digit in the header literal.

DejaVu Sans is embedded with subsetting in each PDF. Its license is included as
`DejaVuSans-LICENSE.txt`. Latin accents, Greek, Cyrillic, and other characters in
the font can be preserved; glyphs missing from the font are explicitly rejected.

## Web branding asset

`prepare_web_assets.py` creates `logo-with-domain.webp` from the canonical
`assets/brand/logo-with-domain.png`. It preserves the full artwork and aspect
ratio at a web-serving resolution, using lossless WebP encoding; the supplied
PNG remains unchanged. Regenerate with `python assets/prepare_web_assets.py`
when the canonical logo changes (requires Pillow).

The same script creates `favicon-32.png` and a multi-resolution `favicon.ico`
(16, 32, and 48 pixels) from the unchanged standalone mark at
`assets/brand/logo-prototype.png`. These are resized copies, not redrawn or
recolored artwork. The portal and recovery document reference both icons.
The build finalizers embed them as data URLs so the downloaded offline tool keeps
its branding without a network request, including when Vite emits separate icon
files during its intermediate build. Browser-controlled address-bar security indicators
cannot be replaced by a site icon.

## Offline distribution notices

`third-party-notices.txt` contains the applicable runtime-library and font
copyright and license notices. The build embeds its text in a non-executing
HTML template so both self-contained application copies retain the notices
without a network request or extra download.
