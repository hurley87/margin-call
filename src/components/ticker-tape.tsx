"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { AnimatedNumber } from "@/components/animated-number";
import { useGlobalActivity } from "@/hooks/use-global-activity";
import { useMarketPulse } from "@/hooks/use-market-pulse";
import { MARQUEE } from "@/lib/motion-tokens";
import { buildTickerItems, type TickerItem } from "@/lib/ticker-tape";
import { cn, formatSignedMoney } from "@/lib/utils";

const KIND_CLASS: Record<TickerItem["kind"], string> = {
  win: "text-[var(--t-green-hot)]",
  loss: "text-[var(--t-red)]",
  wipeout: "text-[var(--t-red-hot)]",
  enter: "text-[var(--t-amber)]",
  deal: "text-[var(--t-accent)]",
};

// Period-flavor filler so the tape never runs dry on a quiet floor.
const ERA_FILLER = [
  "DOW 2,503.45 +1.28%",
  "S&P 500 336.21 +1.14%",
  "10Y YIELD 8.42%",
  "OIL (WTI) $18.74 -1.24",
] as const;

/** Tile the headline list until the marquee track is wide enough to loop. */
const MIN_TRACK_ENTRIES = 12;

/**
 * Bottom ticker tape: pinned desk P&L + approvals block on the left, with
 * headline events (wins, losses, wipeouts, entries, new deals) scrolling by.
 * Hover pauses the tape; reduced motion renders it static.
 */
export function TickerTape({
  pnl,
  approvalsCount,
}: {
  pnl: number;
  approvalsCount: number;
}) {
  const { data: globalActivity } = useGlobalActivity();
  const pulse = useMarketPulse();
  const recentDeals = useQuery(api.deals.listRecentCreatedForToasts, {
    limit: 8,
  });

  const items = useMemo(() => {
    const live = buildTickerItems({
      activity: globalActivity?.activity ?? [],
      traderNames: globalActivity?.traderNames ?? {},
      deals: (recentDeals ?? []).map((deal) => ({
        id: deal._id,
        potUsdc: deal.potUsdc,
        entryCostUsdc: deal.entryCostUsdc,
        createdAt: deal.createdAt,
      })),
    });
    const fillerTexts = [
      ...ERA_FILLER,
      `SEC HEAT ${pulse.heatLabel.toUpperCase()}`,
      `MOOD ${pulse.moodLabel.toUpperCase()}`,
    ];
    const filler: TickerItem[] = fillerTexts.map((text, index) => ({
      id: `filler:${index}`,
      kind: "enter" as const,
      text,
      createdAt: 0,
      isFiller: true,
    }));
    const merged = [...live, ...filler];
    const tiled = [...merged];
    while (tiled.length < MIN_TRACK_ENTRIES) tiled.push(...merged);
    return tiled;
  }, [globalActivity, recentDeals, pulse.heatLabel, pulse.moodLabel]);

  const durationSeconds = Math.max(
    MARQUEE.minSeconds,
    items.length * MARQUEE.perItemSeconds
  );

  return (
    <footer className="z-30 hidden shrink-0 border-t border-[var(--t-bronze)] bg-[#050706]/95 text-[11px] uppercase tracking-wider text-[var(--t-muted)] lg:block">
      <div className="mx-auto flex max-w-[112rem] items-stretch">
        <div className="relative z-10 flex shrink-0 items-center gap-5 bg-[#050706] px-3 py-2 shadow-[8px_0_12px_-6px_rgba(0,0,0,0.9)]">
          <span>
            Desk P&L:{" "}
            <AnimatedNumber
              value={pnl}
              format={formatSignedMoney}
              className={
                pnl >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]"
              }
              live
            />
          </span>
          <span>
            Approvals:{" "}
            <span
              className={
                approvalsCount > 0
                  ? "text-[var(--t-amber)]"
                  : "text-[var(--t-green)]"
              }
            >
              <AnimatedNumber value={approvalsCount} format={String} />
            </span>
          </span>
        </div>
        <div className="mc-marquee relative min-w-0 flex-1 overflow-hidden py-2">
          <div
            className="mc-marquee-track"
            style={
              {
                "--mc-marquee-duration": `${durationSeconds}s`,
              } as React.CSSProperties
            }
          >
            <TickerRun items={items} />
            <TickerRun items={items} ariaHidden />
          </div>
        </div>
      </div>
    </footer>
  );
}

function TickerRun({
  items,
  ariaHidden = false,
}: {
  items: TickerItem[];
  ariaHidden?: boolean;
}) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center whitespace-nowrap"
    >
      {items.map((item, index) => (
        <span
          key={`${item.id}:${index}`}
          className={cn(
            "px-4",
            item.isFiller ? "text-[var(--t-muted)]" : KIND_CLASS[item.kind]
          )}
        >
          {item.text}
          <span aria-hidden className="pl-8 text-[var(--t-divider)]">
            {"//"}
          </span>
        </span>
      ))}
    </div>
  );
}
