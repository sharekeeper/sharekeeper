# Main flows

The hosted baseline was opened before these edits. It shows the supplied domain logo, the setup question, 3/4/5 keeper choices, and the fixed-threshold explanation; the recovery application has no database or persistent user storage.

## Full website and navigation

- Start: Home at the existing public website address.
- Open Standard, Learn, Tools, Providers, and the provider application page through their real navigation controls; use browser Back and a direct hash URL.
- Expect: Distinct, accessible pages in the supplied logo's navy/cyan palette, visible working-draft status, no fabricated endorsements or providers, and mobile navigation that fits at 375 px.
- Open the recovery tool from Tools. Expect a separate `recovery.html` document, not a network-enabled form mounted in the secret generator.

## Updated source sheet

- Open and download the blank sample from Home, Standard, or Tools.
- Expect: The latest supplied PDF, preserved byte-for-byte, with FIRST 2 CIPHER GROUPS and an eight-hex-digit Expected Ciphertext CRC32 field.
- For the newest uploaded revision, expect SHA-256 `fe2c68537d6fb73c28307fbb19a43c48202c09c264030c2f175c28c10dc5a1c6`, seven blank account/wallet records, and the revised, more compact keeper layout in the actual download and thumbnail.
- Generate sheets for 3, 4, and 5 keepers. Expect: Correct private K-pad placement, blank ciphertext/CRC32/passphrase fields, and explicit inactive slots.
- Inspect every generated keeper block against the new layout. Expect: All 80 letters remain inside the twenty four-cell groups; contact ink, prefix labels, and eight CRC32 cells do not collide; supported two-line contacts remain readable at a minimum of eight points.
- Expect: Educational copy distinguishes a CRC32 checksum from cryptographic authentication; the generator does not calculate a checksum of a pad and mislabel it as ciphertext.
- The original sample's seven-day notice remains in that source. The derivative worksheet remains policy-neutral and the website explains open specification decisions.
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
- Choose 3, 4, or 5 and select Continue to contacts.
- Enter each keeper's name and a contact channel, optionally expanding the postal address.
- Expect: Back, Next sharekeeper, direct keeper tabs, and Review edit preserve contact data; missing or overlong values produce visible errors rather than truncation.

## Add two-source entropy

- Start: Add entropy.
- Move a mouse or finger in the collection area, or use the keyboard/timing alternative.
- Expect: Source 1 identifies browser cryptographic randomness; Source 2 identifies user movement/timing. Continue is blocked until the collection target; reset clears the contribution and blocks continuation again.
- Toggle the timing input open and closed without losing the collected contribution.

## Review and generate

- Start: Review.
- Check the two acknowledgments and select Generate recovery sheet.
- Expect: Editing is blocked during generation; unsupported PDF glyphs fail clearly; success shows Your recovery sheet is ready with pads hidden.

## Download and reveal

- Start: Your recovery sheet is ready.
- Download the private PDF twice, then show and hide the on-screen pads.
- Expect: Identical downloads, one 80-letter pad per active keeper, a one-page A2 output, and no ciphertext/hash/passphrase values invented.

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

## Logo-led website colors

- Use the latest supplied ShareKeeper.org domain lockup unchanged, with a web-serving copy rather than a redrawn logo.
- Carry the logo's representative navy and light cyan through headings, primary actions, selected keeper options, progress states, and entropy collection; retain white paper surfaces and dark ink.
- Inspect setup, contacts, entropy, review, ready, and clear-dialog states on desktop and at 375 px. Check focus, selected/disabled states, contrast, header fit, and horizontal overflow.
- Preserve the latest supplied blank sample byte-for-byte; website branding must not recolor that source PDF. Keep pad generation, contact handling, and two-source entropy behavior intact.
- Expect the supplied standalone mark as a valid browser favicon in the portal, separate recovery document, and downloaded offline copy. Inspect both embedded PNG and multi-resolution ICO assets, verify the browser can decode the icon, and preserve the no-network recovery policy. A website cannot replace a browser-controlled address-bar security indicator.
