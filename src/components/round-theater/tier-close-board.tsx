"use client";

import {
  formatLeverageBps,
  isWinningTicket,
  type TierExposure,
} from "@/lib/margin-call-crash";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import { getTierCloseProgress } from "@/lib/round-replay";
import { theaterCopy } from "./theater-copy";

export type TierCloseBoardProps = {
  tiers: readonly TierExposure[];
  crashPointBps: bigint;
  /** Live climb progress; pass 1 for the static/reduced-motion card. */
  progress: number;
};

/**
 * Per-tier close board. Colour-independent text status on every row.
 */
export function TierCloseBoard({
  tiers,
  crashPointBps,
  progress,
}: TierCloseBoardProps) {
  return (
    <ul className="mt-4 space-y-1.5" aria-label="Arcade Leverage tier closes">
      {tiers.map((tier) => {
        const closeAt = getTierCloseProgress(tier.leverageBps, crashPointBps);
        const wins = isWinningTicket(tier.leverageBps, crashPointBps);
        const closed = closeAt !== null && closeAt <= progress;
        const label = formatLeverageBps(tier.leverageBps);
        const status = !wins
          ? theaterCopy.tierOpen(label)
          : closed
            ? theaterCopy.tierClosed(label)
            : theaterCopy.tierIdle(label);

        return (
          <li
            className={`flex flex-wrap items-center justify-between gap-2 border px-3 py-2 text-xs ${
              closed && wins
                ? "mc-tier-pop border-[var(--t-green)]/50 bg-[var(--t-green)]/10 text-[var(--t-green-hot)]"
                : !wins && progress >= 1
                  ? "border-[var(--t-red)]/40 text-[var(--t-red-hot)]"
                  : "border-[var(--t-divider)] text-[var(--t-muted)]"
            }`}
            key={tier.leverageBps.toString()}
          >
            <span className="font-bold uppercase tracking-[0.12em]">
              {status}
            </span>
            <span className="tabular-nums">
              {tier.ticketCount === 0
                ? theaterCopy.noTicketsAtTier
                : wins && closed
                  ? `${formatDeskDollars(tier.reservedPayout, TUSD_DECIMALS)} tUSD · ${tier.ticketCount} Ticket${tier.ticketCount === 1 ? "" : "s"}`
                  : `${tier.ticketCount} Ticket${tier.ticketCount === 1 ? "" : "s"} · ${formatDeskDollars(tier.totalMargin, TUSD_DECIMALS)} tUSD margin`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
