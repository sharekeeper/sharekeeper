# Sharekeeper website acceptance inventory

All functional and visual checks use synthetic contact details and disposable test pads. Never save a real recovery sheet or real user secrets as test evidence.

## Portal and provider registry

- **Navigation:** Home, Standard, Learn, Tools, Providers, and Apply work through real controls, direct hash routes, and browser Back. The separate recovery document is reachable from Tools.
- **Source fidelity:** The public sample download matches the latest supplied PDF byte-for-byte and visibly includes the first-two-cipher-groups labels and eight-cell CRC32 field.
- **Scope:** Draft status is explicit. The 80-letter tool profile, unresolved checksum serialization, seven-day sample notice, and policy-neutral generator are not silently treated as an approved standard.
- **Removed diagram:** The protocol-diagram PDF is absent from the current tracked tree, build output, and website links. Older Git history is not rewritten without separate authorization.
- **Directory:** Initial data contains no invented providers. Search, service/jurisdiction filters, clearing filters, and empty states work. Only approved allowlisted public data may be rendered.
- **Application:** Public business fields and private reviewer contact are distinguished. Required information and both publication/authority consents gate local draft review. The downloaded draft is marked not submitted.
- **Intake truthfulness:** An unconfigured private intake must show a setup-needed state, not a Submit/success simulation. Once connected, verify the actual hosted form and durable private response store before claiming live submissions.
- **Isolation:** The provider portal may permit an explicitly configured Google Forms frame. The recovery document remains independently bundled with outbound connections and forms blocked, and its offline copy remains byte-identical.
- **Safety:** No provider application asks for recovery secrets, identity-document uploads, or private pads. CRC32 is not advertised as cryptographic authentication.
- **Responsive checks:** Inspect every page at desktop and 375 px, mobile navigation, all form steps and errors, keyboard focus, a short desktop viewport, and desktop/mobile/desktop resizing.

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

## Latest compact-sheet regeneration

Verified on 2026-11-07 against the supplied source SHA-256 `fe2c68537d6fb73c28307fbb19a43c48202c09c264030c2f175c28c10dc5a1c6`. The source PDF is preserved byte-for-byte, including its incomplete step 6; these tests are not an endorsement of the prototype recovery instructions.

- **Build and source fidelity:** All 51 unit tests pass, including the new thumbnail-provenance and favicon tests. The production payload contains only the portal, separate recovery tool, identical offline copy, and exact source sample. Independent final-build review confirmed that the embedded derivative matches the final frozen source assets, not an earlier layout.
- **Compact PDF layout:** Actual browser downloads for 3, 4, and 5 keepers pass qpdf checks. Independent actual-glyph measurements cover every A–Z pad letter and supported two-line contacts; generated ink stays out of the ciphertext-prefix boxes, CRC32 cells, and all seven wallet rows. Contact fitting retains its eight-point minimum and explicit overflow failures.
- **Browser flows:** All six portal routes were exercised at desktop and 375 px, with no horizontal overflow or page errors. Threshold toggles, six FAQ disclosures, standard navigation, directory filters/reset, and mobile menu/Escape were checked. Local draft validation, overlength retention, review, actual JSON download marked not submitted, edit preservation, and clear cancel/confirm all pass.
- **Recovery and offline:** Mouse collection/reset generated a three-keeper sheet, and keyboard timing generated a five-keeper sheet. Repeat PDF downloads were identical; reveal/hide and clear cancel/confirm passed. The pristine downloaded HTML generated a four-keeper sheet with networking disabled and zero HTTP requests. Missing Web Crypto and unsupported PDF characters failed closed; overlong contact input remained intact and was rejected.
- **Brand icons:** The original standalone logo is resized without redrawing or recoloring. PNG and multi-resolution ICO bytes are embedded in all three HTML documents; the browser decoded the 32px PNG in both the portal and offline file. No external favicon request or image-CSP relaxation is required. A favicon does not replace browser-controlled address-bar security indicators.
- **Provider intake:** The native Google Form's explicitly loaded embed rendered all 15 text fields. No actual submission was made, so durable response readback remains unverified; manual completeness, consent, and approval review remain required.

The earlier touch-emulation limitation below is unchanged. Current checks do not certify physical-phone behavior or constitute a formal cryptographic audit.

## Full-site regeneration verification

The following baseline was verified in Chromium on 2026-11-07 against the earlier CRC32 sample (`e2305bc78fee87e357f15bf67462c0cba9a98f2bec28e64d55b68933857ee270`) after removal of the protocol-diagram PDF. It is not a verification claim for a later template revision. This is implementation testing and targeted code review, not a formal security or accessibility audit.

- **Build and unit tests:** All 46 tests pass. The combined build produces the portal, a separate recovery document, its byte-identical offline copy, and only the latest blank recovery-sheet PDF.
- **Portal routes:** All six routes render at desktop and 375 px without horizontal overflow. Header navigation, browser Back, table-of-contents links, six FAQ toggles, the 3-of-5 conceptual counter, directory search/service/reset controls, and the not-found return path were exercised.
- **Visual fixes:** The mobile draft notice uses a readable full-width text column rather than a narrow flex column. The mobile hosted application button is visible in the initial 375-by-812 viewport. Live desktop/mobile/desktop resizing and a short 720-by-500 viewport were checked.
- **Applications:** The native published Google Form opens anonymously and its explicitly loaded embedded version renders all 15 questions. The private owner editor route redirects an anonymous visitor to the responder view. No actual form submission has been made during this verification; durable response readback remains pending approval for one labeled synthetic test.
- **Local drafts:** Empty validation, 161-character business-name retention and rejection, public/private review, real JSON download marked `not-submitted`, edit preservation, and clear cancel/confirm were exercised. No local draft is transferred to Google automatically.
- **Recovery paths:** Three-keeper mouse input, five-keeper keyboard/timing input, and four-keeper touch-gesture collection generated actual CRC32-layout PDFs. Four-keeper Review navigation used the keyboard after the known CDP post-drag tap issue; this does not establish physical-device touch navigation.
- **Generation guards:** Intentionally delayed real Web Crypto derivation confirmed that Edit, Back, and Clear are disabled during generation. Missing SubtleCrypto fails closed; missing/overlong contacts and unsupported Japanese glyphs produce explicit failures without truncation or issuing a PDF.
- **Output and offline:** Actual browser PDFs for 3, 4, and 5 keepers pass qpdf checks and show correct 3-of-N labels and blank eight-digit CRC32 fields. Repeat downloads are byte-identical; reveal/hide and clear cancel/confirm work. Downloaded pristine HTML completes a full generation with networking disabled and zero HTTP requests.
- **Link and removal checks:** The sample PDF, external SLIP-0039 reference, generator, and offline-download links were activated. No protocol-diagram file or link remains in the current source/build; older Git history has not been rewritten.
- **Independent source review:** A separate read-only review found no remaining blocking privacy/security/status issue in the reviewed source and build. The portal has its own Google-frame permission, while recovery HTML has no provider intake URL, review code, or outbound connection/form permission.

The first Review tap immediately following a CDP-emulated drag was still suppressed in this browser harness even when its DOM hit target and enabled state were correct. Touch movement collection and keyboard navigation work; physical-phone behavior is not certified by these tests.

## Prior recovery-only verification

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
- **Logo-led theme:** The current supplied logo loads at desktop and mobile sizes. Navy/cyan controls, selected and disabled states, progress markers, contact entry, entropy, review, ready, and clear-dialog states were checked; all main flows were replayed after the color-only update, and the original recovery-sheet checksum remained unchanged.

Hosted preview PDF download was verified. Its static offline-HTML link was observed to navigate instead of downloading, so the preview now offers Open standalone app in a new tab; that fresh session does not inherit contacts or keys. Verify the offline-copy download from the standalone GitHub Pages site. No live recovery material was used in this verification.
