"use client";

import { MarketValue } from "@/components/ui/market-value";
import { StatusChip } from "@/components/ui/status-chip";
import { useMarketPulse } from "@/hooks/use-market-pulse";
import { cn, formatSignedMoney } from "@/lib/utils";

/**
 * Mobile-only P&L / approvals / heat pulse — desktop already has TickerTape.
 */
export function MobileMarketPulse({
  pnl,
  approvalsCount,
  className,
}: {
  pnl: number;
  approvalsCount: number;
  className?: string;
}) {
  const pulse = useMarketPulse();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 overflow-x-auto border-t border-[var(--t-bronze)] bg-[#050706]/95 px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--t-muted)] lg:hidden",
        className
      )}
    >
      <span className="shrink-0">
        P&L <MarketValue value={pnl} format={formatSignedMoney} live />
      </span>
      <span className="shrink-0">
        Appr{" "}
        <span
          className={
            approvalsCount > 0
              ? "font-bold text-[var(--t-amber)]"
              : "text-[var(--t-green)]"
          }
        >
          {approvalsCount}
        </span>
      </span>
      {!pulse.isLoading ? (
        <StatusChip tone={pulse.heatTone} className="shrink-0">
          SEC {pulse.heatLabel}
        </StatusChip>
      ) : null}
    </div>
  );
}
