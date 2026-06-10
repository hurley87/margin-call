"use client";

import { useMemo } from "react";
import { useDeals } from "@/hooks/use-deals";
import { AnimatedNumber } from "@/components/animated-number";
import { formatUsdc } from "@/lib/utils";

export function WireStatsBar() {
  const { data: deals } = useDeals();

  const stats = useMemo(() => {
    if (!deals) return null;
    const openDeals = deals.filter((d) => d.status === "open");
    if (openDeals.length === 0) return null;
    return {
      count: openDeals.length,
      totalPot: openDeals.reduce((sum, d) => sum + d.pot_usdc, 0),
      totalEntries: openDeals.reduce((sum, d) => sum + d.entry_count, 0),
    };
  }, [deals]);

  if (!stats) return null;

  return (
    <div className="border-b border-[var(--t-border)] px-4 py-2">
      <span className="text-[11px] tracking-wider text-[var(--t-muted)]">
        <span className="text-[var(--t-text)]">{stats.count}</span> ACTIVE{" "}
        {stats.count === 1 ? "DEAL" : "DEALS"} ·{" "}
        <AnimatedNumber
          value={stats.totalPot}
          format={formatUsdc}
          className="text-[var(--t-green)]"
          live
        />{" "}
        IN POTS ·{" "}
        <AnimatedNumber
          value={stats.totalEntries}
          format={String}
          className="text-[var(--t-text)]"
        />{" "}
        ENTRIES
      </span>
    </div>
  );
}
