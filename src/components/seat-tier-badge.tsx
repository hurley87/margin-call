"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { SeatTierName } from "@/lib/contracts/seatVault";
import { SEAT_TIER_FLOOR_LABEL } from "@/lib/seat-tier-display";
import { cn } from "@/lib/utils";

const TIER_TONE: Record<SeatTierName, string> = {
  Gallery:
    "border-[var(--t-divider)] text-[var(--t-muted)] bg-[var(--t-surface)]/40",
  Seat: "border-[var(--t-amber)]/50 text-[var(--t-amber)] bg-[var(--t-amber)]/10",
  CornerOffice:
    "border-[var(--t-green)]/50 text-[var(--t-green)] bg-[var(--t-green)]/10",
};

export function SeatTierBadgeView({
  tier,
  syncStatus,
  className,
  compact = false,
}: {
  tier: SeatTierName;
  syncStatus?: "ok" | "syncing" | "error";
  className?: string;
  compact?: boolean;
}) {
  const label = SEAT_TIER_FLOOR_LABEL[tier];
  const syncNote =
    syncStatus === "syncing"
      ? "syncing"
      : syncStatus === "error"
        ? "book lag"
        : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-mono font-semibold uppercase",
        compact
          ? "px-1.5 py-px text-[9px] tracking-[0.14em]"
          : "px-2 py-0.5 text-[10px] tracking-[0.18em]",
        TIER_TONE[tier],
        className
      )}
      title={
        syncNote ? `Floor seat: ${label} (${syncNote})` : `Floor seat: ${label}`
      }
    >
      <span>{label}</span>
      {syncNote ? (
        <span className="text-[var(--t-muted)] normal-case tracking-normal">
          · {syncNote}
        </span>
      ) : null}
    </span>
  );
}

/** Public / owner badge fed by getPublicTraderTier (no private amounts). */
export function SeatTierBadge({
  traderId,
  className,
  compact = false,
}: {
  traderId: string;
  className?: string;
  compact?: boolean;
}) {
  const publicTier = useQuery(api.seatVault.queries.getPublicTraderTier, {
    traderId: traderId as Id<"traders">,
  });

  if (publicTier === undefined) {
    return (
      <SeatTierBadgeView
        tier="Gallery"
        syncStatus="syncing"
        className={className}
        compact={compact}
      />
    );
  }

  if (publicTier === null) {
    return (
      <SeatTierBadgeView
        tier="Gallery"
        className={className}
        compact={compact}
      />
    );
  }

  return (
    <SeatTierBadgeView
      tier={publicTier.effectiveTier}
      syncStatus={publicTier.syncStatus}
      className={className}
      compact={compact}
    />
  );
}
