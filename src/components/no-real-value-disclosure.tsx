import { DISPLAY_ASSET_SYMBOL } from "@/lib/desk-dollars";

/**
 * Persistent Base Sepolia / no-real-value disclosure visible outside AuthGate.
 * Faucet and LP panels repeat the same warning; this keeps it on every path.
 */
export function NoRealValueDisclosure({
  compact = false,
}: {
  /** Floor header: one truncated line so chrome stays short on phones. */
  compact?: boolean;
} = {}) {
  return (
    <p
      role="note"
      data-testid="no-real-value-disclosure"
      className={
        compact
          ? "truncate text-[10px] leading-4 text-[var(--t-muted)]"
          : "text-[10px] leading-4 text-[var(--t-muted)] sm:text-xs sm:leading-5"
      }
      title={
        compact
          ? `Base Sepolia only. Desk Dollars (${DISPLAY_ASSET_SYMBOL}) and vault shares have no real value and no claim on real US dollars.`
          : undefined
      }
    >
      Base Sepolia only. Desk Dollars ({DISPLAY_ASSET_SYMBOL}) and vault shares
      have no real value and no claim on real US dollars.
    </p>
  );
}
