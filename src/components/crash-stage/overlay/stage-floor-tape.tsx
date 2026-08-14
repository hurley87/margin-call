"use client";

import {
  formatLeverageBps,
  type TicketTapeEntry,
} from "@/lib/margin-call-crash";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import { formatShortAddress } from "@/lib/utils";

export type StageFloorTapeProps = {
  entries: readonly TicketTapeEntry[];
};

/**
 * Slim Floor marquee of public TicketEntered rows, pinned above the entry card.
 */
export function StageFloorTape({ entries }: StageFloorTapeProps) {
  if (entries.length === 0) {
    return (
      <div
        className="pointer-events-none mx-auto mb-1.5 w-full max-w-xl px-3 sm:mb-2 sm:px-6"
        data-testid="stage-floor-tape"
      >
        <p className="border border-[var(--t-divider)] bg-[var(--t-panel-strong)]/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)] backdrop-blur-sm">
          Live tape
          <span className="ml-2 normal-case tracking-normal text-[var(--t-muted)]">
            No Tickets yet
            <span aria-hidden="true" className="cursor-blink ml-1">
              ▮
            </span>
          </span>
        </p>
      </div>
    );
  }

  const items = entries.map((entry) => (
    <span
      className="mc-feed-enter inline-flex shrink-0 items-center gap-2 border border-[var(--t-divider)] bg-[var(--t-surface)]/90 px-2.5 py-1 text-[10px] tabular-nums text-[var(--t-text)]"
      key={entry.ticketId.toString()}
    >
      <span className="text-[var(--t-green-hot)]">
        {formatDeskDollarsAmount(entry.margin)}
      </span>
      <span className="text-[var(--t-amber-hot)]">
        {formatLeverageBps(entry.leverageBps)}
      </span>
      <span className="font-mono text-[9px] text-[var(--t-muted)]">
        {formatShortAddress(entry.player)}
      </span>
    </span>
  ));

  return (
    <div
      aria-label="Live ticket tape"
      className="pointer-events-none mx-auto mb-1.5 w-full max-w-xl px-3 sm:mb-2 sm:px-6"
      data-testid="stage-floor-tape"
    >
      <div className="mc-marquee overflow-hidden border border-[var(--t-divider)] bg-[var(--t-panel-strong)]/80 py-1.5 backdrop-blur-sm">
        <div
          className="mc-marquee-track gap-2 px-2"
          style={{ ["--mc-marquee-duration" as string]: "32s" }}
        >
          {items}
          {items}
        </div>
      </div>
    </div>
  );
}
