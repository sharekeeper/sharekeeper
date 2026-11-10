/** "#recover" (and in-page anchors such as "#recover-main") open the decrypt mode. */
export function modeFromHash(hash) {
  return hash === "#recover" || String(hash ?? "").startsWith("#recover-") ? "recover" : "create";
}

/**
 * Decide what a hash change does. While a create session is active (or
 * generating), switching modes is refused and the previous hash restored, so
 * a typed URL, link or Back cannot unmount the session behind the lock.
 */
export function resolveHashChange({ hash, current, locked }) {
  const next = modeFromHash(hash);
  if (next === current) return { mode: current, revert: false };
  if (locked && current === "create") return { mode: current, revert: true };
  return { mode: next, revert: false };
}
