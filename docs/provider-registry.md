# Provider registry operations

The public directory and private application inbox are separate. Applications do not create a listing automatically, and directory inclusion is not certification of provider security, legal status, or recovery outcomes.

## Application inbox

- **Responder form:** [Sharekeeper Provider Application](https://docs.google.com/forms/d/e/1FAIpQLSewKb1PVXJurP11uaZFQgkY47TtJxp0WpnFSrefqC1EQfbZQA/viewform).
- **Reviewer interface:** [Private application review in Google Forms](https://docs.google.com/forms/d/1-R7xMPWId4BfQ11BuQB4uEGAk6yEPcoZSctiMB3Hrj8/edit#responses). Google requires the form owner's or an explicitly authorized collaborator's account; knowing this URL does not grant review access.
- **Source configuration:** `tools/recovery-sheet/site/intake-config.json` contains only the public native responder URL, not credentials, responses, or private reviewer information.
- **Question types:** The connected form-creation interface provides text questions. Explicit publication, authority, and safety acknowledgements are collected as typed YES responses. Reviewers must reject or request completion of incomplete/unconsented applications; collecting a response is not approval.
- **Data boundary:** Publicly proposed business fields, private representative name/email, and private notes are separate questions. All responses stay in the private review service. No application response, client information, identity document, or recovery secret belongs in this public repository.

Google-account email collection is disabled. The form is published and accepting responses. The public website opens or explicitly embeds the native form; it does not use an unofficial submission endpoint, transmit local application drafts, or display a simulated submission confirmation.

The anonymous responder and embedded form have been opened with all 15 questions visible. A labeled synthetic submission and exact response readback are still pending test approval; do not describe that end-to-end write test as complete. No new-response notification automation is configured by the website; reviewers should use the private inbox.

## Review before publication

- **Completeness:** Check that the business name, HTTPS website, jurisdiction, service area, services, description, and private review contact are present and usable.
- **Consent:** Require explicit YES answers to publication consent, authority to apply, and the safety/review acknowledgement. Missing or ambiguous answers require follow-up, not automatic approval.
- **Verification:** Independently check the organization's identity, website, public contact details, claimed services, and relevant evidence. Do not infer a license, insurance policy, security audit, or regulatory status from an application alone.
- **Scope:** Verify that the proposed service description is appropriate for a draft standard. Do not label an applicant protocol-conformant or certified when the standard's open decisions remain unresolved.
- **Public/private split:** Confirm the exact public fields to publish. Never copy the private representative contact or reviewer notes into a listing, GitHub Issue, pull request, or commit.
- **Decision:** An authorized maintainer must approve publication separately. Keep rejected, pending, and follow-up applications in private review; do not publish them as a public application feed.

Test applications are not real providers and must never be approved or copied into the directory.

## Publish an approved listing

Add only the approved public fields to `tools/recovery-sheet/site/providers.json`. Allowed fields are `id`, `status`, `businessName`, `website`, `jurisdiction`, `serviceArea`, `address`, `publicEmail`, `publicPhone`, `services`, `description`, and `reviewedOn`.

Set `status` to `approved` only after the separate approval decision. Use the existing service categories, a stable identifier, and the actual review date. Do not add private evidence, response IDs, applicant contact information, or application notes.

Run `npm test` and `npm run build` from `tools/recovery-sheet`, review the exact diff, and merge the approved change. The build rejects unknown/private fields, nested data, unapproved records, unsafe URLs, invalid categories, duplicate identifiers, and overlong public values before JSON can enter the public bundle.

The initial production directory is intentionally empty. Synthetic test fixtures exist only in test code, not as directory entries.
