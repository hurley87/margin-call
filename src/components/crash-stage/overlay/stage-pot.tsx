"use client";

import { FlashValue } from "@/components/ui/flash-value";
import {
  formatDeskDollarsAmount,
  formatDeskDollarsAmountLabel,
} from "@/lib/desk-dollars";
import type { TapePotSummary } from "@/lib/theater-live";

export type StagePotProps = {
  pot: TapePotSummary;
};

/**
 * Live pot strip under the Floor HUD. Numbers flash via FlashValue when the
 * public tape grows — decorative only.
 */
export function StagePot({ pot }: StagePotProps) {
  return (
    <div
      className="pointer-events-none mx-auto mt-1 flex w-full max-w-xl flex-wrap items-baseline justify-center gap-x-4 gap-y-1 px-3 text-[10px] uppercase tracking-[0.16em] sm:mt-1.5 sm:gap-x-6 sm:px-6 sm:text-[11px]"
      data-testid="stage-pot"
    >
      <PotStat
        label="Pot"
        value={pot.totalMargin}
        display={formatDeskDollarsAmountLabel(pot.totalMargin)}
        hot
      />
      <PotStat
        label="At risk"
        value={pot.reservedPayout}
        display={formatDeskDollarsAmount(pot.reservedPayout)}
      />
      <PotStat
        label="Tickets"
        value={BigInt(pot.ticketCount)}
        display={String(pot.ticketCount)}
      />
    </div>
  );
}

function PotStat({
  label,
  value,
  display,
  hot = false,
}: {
  label: string;
  value: bigint;
  display: string;
  hot?: boolean;
}) {
  return (
    <div
      className="mc-pot-bump flex items-baseline gap-1.5"
      key={value.toString()}
    >
      <span className="text-[var(--t-muted)]">{label}</span>
      <FlashValue
        className={`tabular-nums ${
          hot
            ? "mc-live-value text-[var(--t-green-hot)]"
            : "text-[var(--t-text)]"
        }`}
        value={value}
      >
        {display}
      </FlashValue>
    </div>
  );
}
