# Main flows

The hosted baseline was opened before these edits. It shows the supplied domain logo, the setup question, 3/4/5 keeper choices, and the fixed-threshold explanation; the application has no database or persistent user storage.

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
- Keep the recovery-sheet PDF template, pad generation, contact handling, and two-source entropy behavior unchanged.
