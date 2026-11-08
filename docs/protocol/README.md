# Sharekeeper working protocol notes

The current published material is the [latest blank recovery-sheet sample](../../templates/recovery/README.md), the website's draft explanations, and the limited browser generator. These are not a finalized normative standard, an audited recovery procedure, or proof of legal sufficiency or wallet interoperability.

The protocol-diagram PDF has been removed from the current repository and website at the owner's request. That file removal does not rewrite older Git commits.

## Open specification decisions

- **Pad profile and field roles:** The sample contains twenty four-letter entry groups per share and a K/C/P legend, without separately labeled K and C rows or pad-generation instructions. The browser generator explicitly fills a derivative with private K pads using its own 80-letter profile; that implementation choice is not a final protocol specification.
- **Ciphertext checksum:** The latest sample asks for an eight-hex-digit CRC32. The exact CRC32 variant, parameters, ciphertext encoding, and bytes to checksum still need specification. A checksum must not be treated as cryptographic authentication.
- **Release policy:** The original sample retains a seven-day release-time instruction. The derivative generator instead refers to the agreed release policy. Verification, notice, delay, contact-change handling, and delivery terms need explicit agreement; this tool does not implement or enforce those terms.
- **Recovery completeness:** Share generation, encryption, custody, decryption, compatible-device recovery, and a full offline recovery test are outside the current generator. A populated K-pad worksheet is not a complete backup.
- **Latest sample instructions:** Recovery steps 6–8 now refer to local scratch-paper decryption, destroying the paper after hardware-wallet entry, and signing/broadcasting a transaction before wiping the hardware wallet. Step 6 literally ends `into a HW`; the generator preserves that supplied text rather than guessing its completion, and the sample instructions require editorial and procedural review before operational use.

## Browser generator boundary

The [browser recovery-sheet generator](../../tools/recovery-sheet/README.md) interviews 2–5 keepers and fills the unchanged sample sheet with private pads using an explicit 80-letter, 20-by-4 profile. For each pad a 1600-bit browser random seed is XORed with a 1600-bit block derived (SHA-512) from user movement/timing collected until a heuristic score (not measured entropy) reaches 1600. Browser randomness is pseudorandom, so this is not an information-theoretic one-time-pad claim.

The tool does not accept seed/share input or generate or encrypt SLIP-39 shares. Ciphertext-prefix groups, the eight-cell ciphertext CRC32 field, and the wallet/passphrase table remain blank; no checksum of a private K pad is calculated.

The latest sample has seven account/wallet rows and no authentication/notice or release-due header fields. The derivative preserves those changes, retains the supplied steps 6–8 verbatim, and performs none of the scratch-paper, hardware-wallet, transaction, or wipe actions described there.
