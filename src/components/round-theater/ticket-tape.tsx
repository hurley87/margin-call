"use client";

import {
  formatLeverageBps,
  type TicketTapeEntry,
} from "@/lib/margin-call-crash";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import { formatShortAddress } from "@/lib/utils";
import { theaterCopy } from "./theater-copy";

/**
 * Open-phase live ticket tape of public TicketEntered rows.
 */
export function TicketTape({
  entries,
}: {
  entries: readonly TicketTapeEntry[];
}) {
  if (entries.length === 0) {
    return (
      <div className="mt-4 border border-[var(--t-divider)] bg-[var(--t-panel-strong)] px-3 py-2">
        <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
          {theaterCopy.openTape}
        </p>
        <p className="mt-2 text-xs text-[var(--t-muted)]">No Tickets yet.</p>
      </div>
    );
  }

  const items = entries.map((entry) => (
    <span
      className="mc-feed-enter inline-flex shrink-0 items-center gap-2 border border-[var(--t-divider)] bg-[var(--t-surface)] px-3 py-1.5 text-xs tabular-nums text-[var(--t-text)]"
      key={entry.ticketId.toString()}
    >
      <span className="text-[var(--t-green-hot)]">
        {formatDeskDollars(entry.margin, TUSD_DECIMALS)} tUSD
      </span>
      <span className="text-[var(--t-amber-hot)]">
        {formatLeverageBps(entry.leverageBps)}
      </span>
      <span className="font-mono text-[10px] text-[var(--t-muted)]">
        {formatShortAddress(entry.player)}
      </span>
    </span>
  ));

  return (
    <div
      aria-label={theaterCopy.openTape}
      className="mc-marquee mt-4 overflow-hidden border border-[var(--t-divider)] bg-[var(--t-panel-strong)] py-2"
    >
      <p className="px-3 text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {theaterCopy.openTape}
      </p>
      <div
        className="mc-marquee-track mt-2 gap-3 px-3"
        style={{ ["--mc-marquee-duration" as string]: "36s" }}
      >
        {items}
        {items}
      </div>
    </div>
  );
}
