"use client";

import { StatusChip } from "@/components/ui/status-chip";
import { useMarketHours } from "@/hooks/use-market-hours";
import { useMarketPulse } from "@/hooks/use-market-pulse";
import { cn } from "@/lib/utils";

/**
 * Compact live market threat strip for the signed-in desk — mood, SEC heat,
 * and session clock. Sits under the command strip / above the main grid.
 */
export function MarketStatusStrip({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const pulse = useMarketPulse();
  const hours = useMarketHours();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-[var(--t-bronze)]/70 bg-[#080b0f]/90 px-2 py-1.5 xl:px-3",
        className
      )}
    >
      <StatusChip tone={hours.isOpen ? "live" : "warn"} pulse={hours.isOpen}>
        {hours.isOpen ? "Floor open" : "Floor closed"} · {hours.countdownLabel}
      </StatusChip>
      {!pulse.isLoading ? (
        <>
          <StatusChip tone={pulse.moodTone}>Mood {pulse.moodLabel}</StatusChip>
          <StatusChip tone={pulse.heatTone}>
            SEC heat {pulse.heatLabel}
            {typeof pulse.tension === "number"
              ? ` · ${pulse.tension.toFixed(0)}`
              : ""}
          </StatusChip>
          {pulse.isFlash ? (
            <StatusChip tone="danger" pulse>
              Flash tape
            </StatusChip>
          ) : null}
          {!compact && pulse.headline ? (
            <p className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.12em] text-[var(--t-muted)]">
              <span className="text-[var(--t-amber)]">Wire</span>{" "}
              {pulse.headline}
            </p>
          ) : null}
        </>
      ) : (
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
          Syncing tape…
        </span>
      )}
    </div>
  );
}
