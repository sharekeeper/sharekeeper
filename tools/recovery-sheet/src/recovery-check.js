/**
 * Recombine every threshold-sized subset of shares and require each to give
 * back the master secret; for the first subset also require the same first
 * address. Every recovered buffer is zeroed in its own finally block, so a
 * failing comparison or address derivation can never leave it behind.
 * The caller still owns (and wipes) masterSecret.
 */
export async function checkSubsets({ mnemonics, masterSecret, subsets, address, combine, deriveAddress }) {
  for (const [position, subset] of subsets.entries()) {
    let recovered;
    try {
      recovered = await combine(subset.map((i) => mnemonics[i]));
      const same = recovered.length === masterSecret.length && recovered.every((b, i) => b === masterSecret[i]);
      if (!same) throw new Error("Recovery check failed: a set of shares did not recover the seed. Nothing was issued.");
      if (position === 0 && deriveAddress(recovered) !== address) {
        throw new Error("Address check failed: recovered shares gave a different address. Nothing was issued.");
      }
    } finally {
      recovered?.fill?.(0);
    }
  }
}
