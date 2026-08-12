/**
 * Persistent Base Sepolia / no-real-value disclosure visible outside AuthGate.
 * Faucet and LP panels repeat the same warning; this keeps it on every path.
 */
export function NoRealValueDisclosure() {
  return (
    <p
      role="note"
      data-testid="no-real-value-disclosure"
      className="mx-auto mt-4 max-w-xl border border-[var(--t-amber)] px-3 py-2 text-xs leading-5 text-[var(--t-muted)]"
    >
      Base Sepolia only. Desk Dollars (tUSD) and vault shares have no real value
      and no claim on real US dollars.
    </p>
  );
}
