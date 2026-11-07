# Recovery generator acceptance inventory

All functional and visual checks use synthetic contact details and disposable test pads. Never save a real recovery sheet or real user secrets as test evidence.

## Required flows

- **Keeper counts:** Select 3, 4, and 5; interview every active keeper; generate the matching 3-of-N PDF. Unused template slots must be explicitly unused, not populated.
- **Contacts:** Required name and at least one contact channel; optional account and address fields; back/next and direct keeper selection preserve input. Review edit returns to the appropriate keeper.
- **Entropy:** UI names browser CSPRNG and user movement/timing as two inputs. Mouse movement and finger/pointer input collect bounded records; keyboard/tap timing is an accessible alternative. Reset returns to the uncollected state. Continue requires the collection target, not a claimed entropy-bit estimate.
- **Generation:** Two acknowledgments gate generation. Missing Web Crypto fails closed. The application calls only the mixed-input generator; no plaintext share, seed phrase, or passphrase is collected.
- **Output:** Download a real one-page A2 PDF. Verify exact contact strings, 80 A–Z letters per active keeper, correct four-letter grouping, explicit K labels, blank ciphertext/hash/passphrase fields, no imposed release-delay policy, and the entropy-source footnote.
- **Secret visibility:** Pads hidden initially. Show/hide is reversible; repeated download has identical bytes and never regenerates keys.
- **Clear:** Cancel keeps data; confirm removes active state and revokes the current PDF URL. State clearing must not claim guaranteed memory or downloaded-file erasure.
- **Offline:** Download a pristine self-contained app, not serialized live state. Open the file with networking disabled and complete generation. The app sends no contact, movement, or key data.
- **Hosted:** Open the deployed preview in a fresh context; exercise its real PDF and offline-app downloads.

## Visual coverage

Inspect setup, contact entry, entropy collection, review, and generated-output states at desktop and 375 px. Check the initial viewport, horizontal overflow, a short desktop viewport, visible input errors, optional address expansion, clear-session dialog, 200% zoom, and readable status/secondary text contrast.

## Exploratory cases

- **International and long contacts:** Supported accents survive PDF extraction; unsupported glyphs and overflow produce clear failures before pads are issued. No silent replacement or clipping.
- **Incomplete / edited contacts:** Jump ahead, return to review, remove contact details, then try generation. Validation must prevent incomplete output without losing the other contacts.
- **Weak environment:** Browser without SubtleCrypto must not silently fall back. Synthetic or repeated gesture samples must never be advertised as measured security strength.

## Local verification record

Verified in Chromium on 2026-11-07 with synthetic contacts and disposable keys. This is implementation testing and targeted code review, not a formal cryptographic audit.

Touch movement was browser-emulated; this does not certify every physical phone or browser. The 200% check below is a viewport-equivalent layout check, not a claim of an accessibility certification.

- **Automated checks:** 36 tests pass; the dependency audit reports no known vulnerabilities for the locked dependencies at verification time.
- **End-to-end counts:** Three-keeper generation succeeds from the downloaded HTML with networking disabled; four-keeper generation succeeds after touch movement; five-keeper generation succeeds with keyboard/tap timing.
- **PDF files:** Actual browser downloads are one-page A2 documents with no PDF JavaScript. Accented contacts and separate email/website values survive extraction; generated pages were rendered and visually inspected.
- **Two sources:** Mouse and touch movement, timing taps, and the explicit two-source UI were exercised. Missing SubtleCrypto blocks generation rather than falling back.
- **Privacy:** The production generation flow made only the initial document GET; no contact, movement, or key uploads occurred. The offline download matched the pristine build byte-for-byte and contained none of the entered test contacts.
- **State and validation:** Repeat downloads were byte-identical. Pad reveal/hide, clear cancel/confirm, missing contact errors, overlength-input retention, and unsupported-glyph failures were checked. Editing was disabled during intentionally slowed cryptographic generation.
- **Layout:** Setup, contact, entropy, review, and ready states were inspected at desktop and 375 px. A live desktop/mobile/desktop resize, a short desktop window, and a 720-by-500 CSS-pixel viewport equivalent to 200% on a 1440-by-1000 viewport showed no horizontal overflow.
- **Review fixes:** An asynchronous generation/edit race, native input truncation, and two-line PDF descender collisions were found and fixed. Geometry tests now check actual glyph bounds at a minimum eight-point PDF size.

The hosted-preview download checks are performed after deployment. No live recovery material was used in this verification.
