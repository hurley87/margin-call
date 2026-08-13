/**
 * Persistent Base Sepolia / no-real-value disclosure visible outside AuthGate.
 * Faucet and LP panels repeat the same warning; this keeps it on every path.
 */
export function NoRealValueDisclosure() {
  return (
    <p
      role="note"
      data-testid="no-real-value-disclosure"
      className="text-[10px] leading-4 text-[var(--t-muted)] sm:text-xs sm:leading-5"
    >
      Base Sepolia only. Desk Dollars (USDC) and vault shares have no real value
      and no claim on real US dollars.
    </p>
  );
}
