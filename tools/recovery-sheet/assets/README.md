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
`fe2c68537d6fb73c28307fbb19a43c48202c09c264030c2f175c28c10dc5a1c6`.
Its ciphertext verification labels are `Expected Ciphertext CRC32:` and
`8 hex digits`, with eight 20-by-20-point cells per keeper. The two relocated
`FIRST 2 CIPHER GROUPS` use four 14.2-by-26-point cells each; the main pad
grid remains twenty groups of four 16-by-26-point cells.

The reviewed revision uses a 200-point keeper stride, with pad-row bottoms at
1294.78 and 1248.78 points in the first card, prefix-box bottoms at 1186.78,
and CRC32-box bottoms at 1207.78. It removes the authentication/notice and
release-due header fields and provides seven blank account/wallet rows.
Recovery steps 6–8 are retained verbatim, including step 6's literal `into a HW`
ending; no missing instruction text is guessed or supplied.

The asset script pins the reviewed source hash and checks these checksum labels
and cell geometry before bundling. The generator fills only contacts and the
explicit 80-letter private K-pad grid; ciphertext prefixes and CRC32 cells stay
blank, and it never computes a checksum of a pad. The source's seven-day release
instruction stays intact in the canonical PDF; only the derivative replaces it
with the agreed-release-policy wording.

The derivative keeps seven 17-point contact rows for the existing exact-text,
actual-ink, minimum-8pt fit guarantees instead of the source's 14.5-point rows.
Only the ten ciphertext-prefix group-number headings move down 3.25 points and
reduce from 10pt to 9.5pt to avoid collision with those contact rows. Their
text and all ciphertext-prefix, CRC32, and K-pad entry-box geometry are retained.

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
