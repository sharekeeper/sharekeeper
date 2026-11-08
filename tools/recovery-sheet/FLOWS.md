# Main flows

The hosted baseline was opened before these edits. It shows the supplied domain logo, the setup question, 3/4/5 keeper choices, and the fixed-threshold explanation; the recovery application has no database or persistent user storage.

## Local CRC32 calculator

- Baseline: The live Tools page was opened before editing and contains the recovery generator, boundaries, and reference downloads, but no checksum calculator.
- Add a clearly labeled CRC32 checksum calculator directly on Tools, matching the existing navy/cyan design at desktop and 375 px.
- Select UTF-8 text, enter `123456789`, and calculate. Expect `CBF43926` and nine input bytes; an empty input must produce `00000000`.
- Preserve case, spaces, and the displayed text's line breaks. Explain textarea LF line endings and use File for exact original bytes. Do not silently choose a ciphertext serialization or populate the recovery sheet.
- Select File, choose a synthetic local binary file, and calculate. Expect the independent zlib checksum of the exact bytes; there must be no upload or network request.
- Enter an optional expected eight-hex-digit checksum. Expect distinct match, mismatch, and invalid-format states without relying on color alone; allow lowercase hex.
- Change input after calculating, switch modes, and clear. Expect stale results to disappear and in-flight file reads not to restore cleared or obsolete results.
- Reject inputs over 10 MiB without clipping, show readable errors, and keep all data in this page's memory only. Navigating away resets the calculator.
- Copy the checksum using a real button; verify the clipboard when available and a truthful manual-copy fallback when unavailable.
- Keep CRC-32/ISO-HDLC (IEEE) parameters explicit, distinguish error detection from authentication, and preserve the standard's unresolved serialization decisions.
- Replay all six routes, threshold controls, FAQs, directory filtering, provider form/draft controls, and the independent recovery generator/PDF/offline flows. No actual provider submission or publication is authorized by this change.

### CRC32 addition verification

- The 74-test suite and independent security review pass. Real browser checks cover standard/empty/leading-zero/Unicode values, binary-file checksums, match/mismatch/invalid comparison, real clipboard copying, oversize rejection, input clearing, and no network requests during calculator use.
- A separate fault-injected browser confirms truthful clipboard-denial fallback and stale file-read protection after clearing, changing mode, calculating new input, or navigating away.
- All six routes pass desktop/375 px checks; threshold toggles, six FAQs, five TOC links, directory filters, unknown-route recovery, and local application-draft validation/download/edit/reset pass.
- Generated real 3/4/5-keeper PDFs pass qpdf checks, repeat downloads are identical, and reveal/hide plus clear cancel/confirm work. The pristine downloaded offline copy generates a four-keeper PDF with networking disabled and no HTTP requests.
- External intake limitation observed during this regression: the native Google Form now asks an anonymous visitor to sign in to Google, and its embedded view could not be verified. The existing responder URL and all Google settings were left untouched; no application was submitted. This is not covered by the local CRC32 success checks.

## Full website and navigation

- Start: Home at the existing public website address.
- Open Standard, Learn, Tools, and Providers through the header; open the provider application through Submit a provider on Providers. Use browser Back and a direct hash URL.
- Expect: Distinct, accessible pages in the supplied logo's navy/cyan palette, visible working-draft status, no fabricated endorsements or providers, and mobile navigation that fits at 375 px.
- Open the recovery tool from Tools. Expect a separate `recovery.html` document, not a network-enabled form mounted in the secret generator.

## Provider application entry point

- Baseline: The public Providers page was opened before editing; Submit a provider is still a global-header action, with a second application action in the empty-directory state.
- Remove Submit a provider from the desktop header and mobile menu on every route. Keep the five primary navigation links unchanged.
- Place one clearly labeled Submit a provider action directly on the Providers page, above the search/filter area, and keep it available while filtering or when approved listings are added.
- Click that action at desktop and 375 px. Expect the existing Apply page, unchanged hosted-form URL, optional local draft, and privacy/approval boundaries.
- Avoid a duplicate submit action in the empty-directory state. Preserve Clear filters and existing homepage/footer application links.
- Recheck CRC32 text/file calculation and comparison, all six routes, mobile menu/Escape, directory filtering/reset, and the separate recovery generator after this navigation-only change.

## Updated source sheet

- Open and download the blank sample from Home, Standard, or Tools.
- Expect: The latest supplied PDF, preserved byte-for-byte, with FIRST 2 CIPHER GROUPS and an eight-hex-digit Expected Ciphertext CRC32 field.
- For the newest uploaded revision, expect SHA-256 `8bc121acfea77e62f98d797141e3fe1108f9fe4b20218c72b6a611699bf9961d`, seven blank account/wallet records, and the revised, more compact keeper layout in the actual download and thumbnail. The generator's abstract sidebar miniature must also show seven wallet rows, not its older three-row placeholder.
- Generate sheets for 2, 3, 4, and 5 keepers (the 2-keeper header reads 2 OF 2). Expect: The page is the supplied sample, unchanged, with contacts on the seven template lines and pad letters in the pad cells; ciphertext/CRC32/passphrase fields and unused share sections stay blank; only the header share count reflects 3, 4, or 5.
- Inspect every generated keeper block against the new layout. Expect: All 80 letters remain inside the twenty four-cell groups; contact ink, prefix labels, and eight CRC32 cells do not collide; contacts are single lines on the template rules at 7–11pt; overlong values are rejected, not truncated.
- Expect: Educational copy distinguishes a CRC32 checksum from cryptographic authentication; the generator does not calculate a checksum of a pad and mislabel it as ciphertext.
- The original sample's seven-day notice remains in that source. The generated sheet keeps that text exactly as in the template; the website explains open specification decisions.
- The protocol-diagram PDF is removed from the current repository, build output, and all website/download links.

## Provider directory and review boundary

- Start: Providers.
- Search, select service/jurisdiction filters, clear filters, and open Apply.
- Expect: Only explicitly approved public listing data is rendered. The initial directory has no approved entries and must say so instead of displaying invented providers.
- Expect: No private application contacts or review notes in the directory bundle or public JSON.

## Provider application

- Start: Apply.
- Expect: Public listing details are separated from private reviewer contact, explicit consent is required, and no wallet/recovery secret or identity-document upload is requested.
- If the private intake connection is not configured, expect an honest setup-needed notice and no working-looking Submit or success message. A local application draft may be reviewed/downloaded, explicitly marked not submitted.
- Once the native private application form is connected, open the real hosted form and verify a synthetic application is durably recorded before calling intake live.
- Directory inclusion always requires a separate human approval; an application must never automatically become a public listing.

## Select and interview keepers

- Start: Set up.
- Choose 2, 3, 4, or 5 and select Continue to contacts.
- Enter each keeper's name and a contact channel, optionally expanding the postal address.
- Expect: Back, Next sharekeeper, direct keeper tabs, and Review edit preserve contact data; missing or overlong values produce visible errors rather than truncation.

## Add two-source entropy

- Start: Add entropy.
- Move a mouse or finger in the collection area, or use the keyboard/timing alternative.
- Expect: Source 1 identifies browser cryptographic randomness; Source 2 identifies user movement/timing. Source 1 states a 1600-bit seed per pad. Continue is blocked until the heuristic score reaches 1600 (straight, steady or repeated motion earns little; the score is not measured entropy); reset clears the contribution and blocks continuation again.
- Toggle the timing input open and closed without losing the collected contribution.

## Review and generate

- Start: Review.
- Check the two acknowledgments and select Generate recovery sheet.
- Expect: Editing is blocked during generation; unsupported PDF glyphs fail clearly; success shows Your recovery sheet is ready with pads hidden.

## Download and reveal

- Start: Your recovery sheet is ready.
- Download the private PDF twice, then show and hide the on-screen pads.
- Expect: Identical downloads, one 80-letter pad per active keeper, a one-page US Letter output, and no ciphertext/hash/passphrase values invented.

## Clear and start again

- Start: An active session.
- Select Clear session, cancel, then repeat and confirm.
- Expect: Cancel preserves the session; confirmation resets it and revokes the active PDF URL without claiming to erase downloaded files or all browser memory.

## Offline copy

- Start: Any step.
- Select Download offline app, open the downloaded HTML with networking disabled, and complete a test interview and generation.
- Expect: The pristine self-contained application works without external requests and contains no prior session's contacts or keys.
- In the platform preview, use Open standalone app instead: expect a new GitHub Pages tab with a fresh session, leaving the preview session intact. Download the offline copy from that standalone tab.

## Hosting and label clarification

- Publish only the built application directory through GitHub Pages, not the full repository as a website.
- Preserve the fixed threshold of three for all keeper counts; make the threshold rule explicit rather than implying an N-of-N scheme.
- Label the small preview as a private-pad worksheet, distinct from actual SLIP-39 share generation.
- Check the real hosted PDF and offline-copy download controls in a fresh browser context.
- Connect the custom domain only after the GitHub Pages deployment is healthy and Namecheap access is available; preserve unrelated DNS records.

## Cross-host HTTPS app navigation

- Baseline: The independent HTTPS recovery document opened anonymously and completed a three-keeper interview, two-source generation, and actual PDF download before this navigation edit.
- Start: The live recovery document on either the custom domain or the independent GitHub Pages project.
- Open Sharekeeper tools and Provider directory. Expect: The corresponding portal routes on the same deployment, not an older GitHub alias that redirects to the still-provisioning custom domain.
- Start: A pristine downloaded offline file or an opaque/platform preview.
- Open the portal links or the preview's standalone-app link. Expect: The independent public HTTPS deployment with a fresh session; never copy contacts, keys, or application data into URL parameters.
- Verify Home, Standard, Learn, Tools, Providers, and Apply at desktop and 375 px; open the separate recovery document from Tools and return through both recovery header links.
- Verify the native application form still opens and its explicit embed remains user-initiated. Do not submit a test application without authorization or claim durable response recording was tested.
- Verify the latest blank sample, browser favicon, pristine offline download, contact interview, pointer/timing entropy, acknowledgments, generation, reveal/hide, repeat PDF download, and clear-dialog cancel/confirm still work.
- Inspect actual hosted HTTPS pages in a fresh anonymous browser. Require the real app heading and secure browser cryptography, not merely a public artifact wrapper or HTTP status.

## Logo-led website colors

- Use the latest supplied ShareKeeper.org domain lockup unchanged, with a web-serving copy rather than a redrawn logo.
- Carry the logo's representative navy and light cyan through headings, primary actions, selected keeper options, progress states, and entropy collection; retain white paper surfaces and dark ink.
- Inspect setup, contacts, entropy, review, ready, and clear-dialog states on desktop and at 375 px. Check focus, selected/disabled states, contrast, header fit, and horizontal overflow.
- Preserve the latest supplied blank sample byte-for-byte; website branding must not recolor that source PDF. Keep pad generation, contact handling, and two-source entropy behavior intact.
- Expect the supplied standalone mark as a valid browser favicon in the portal, separate recovery document, and downloaded offline copy. Inspect both embedded PNG and multi-resolution ICO assets, verify the browser can decode the icon, and preserve the no-network recovery policy. A website cannot replace a browser-controlled address-bar security indicator.

## Updated dashed-sector logos

- Baseline: The public canonical homepage was opened before editing; its current header image decoded at 784 by 261 pixels.
- Replace both canonical logo files with the latest supplied upload bytes, retaining earlier revisions in Git history. The new mark has dashed outlines on the two white sectors; preserve the supplied artwork and wordmark without redrawing or recoloring.
- Regenerate the web lockup and PNG/ICO favicons. Verify the updated lockup in all portal routes and generator stages at desktop and 375 px, and verify exact new icon bytes embedded in portal, recovery, and pristine offline HTML.
- Replay the main flows above, including real PDF and offline downloads, before release. The source recovery-sheet PDF, geometry, crypto, contact validation, provider data, and intake behavior must remain unchanged.
- Publish the same reviewed build to the canonical website, existing app preview, and independent distribution mirror. Open fresh anonymous hosted contexts and compare all deployed hashes, header artwork, and icons before reporting completion.
