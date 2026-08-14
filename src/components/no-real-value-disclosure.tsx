import { DISPLAY_ASSET_SYMBOL } from "@/lib/desk-dollars";

const DISCLOSURE = `Base Sepolia only. Desk Dollars (${DISPLAY_ASSET_SYMBOL}) and vault shares have no real value and no claim on real US dollars.`;

/**
 * Persistent Base Sepolia / no-real-value disclosure visible outside AuthGate.
 * Faucet and LP panels repeat the same warning; this keeps it on every path.
 * Truncates on narrow viewports; full copy remains on `title`.
 */
export function NoRealValueDisclosure() {
  return (
    <p
      role="note"
      data-testid="no-real-value-disclosure"
      className="truncate text-[10px] leading-4 text-[var(--t-muted)] sm:whitespace-normal sm:text-xs sm:leading-5"
      title={DISCLOSURE}
    >
      {DISCLOSURE}
    </p>
  );
}
