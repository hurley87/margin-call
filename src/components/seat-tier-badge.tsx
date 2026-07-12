"use client";

import { useQuery } from "convex/react";
import { Armchair, Crown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { SeatTierName } from "@/lib/contracts/seatVault";
import { SEAT_TIER_FLOOR_LABEL } from "@/lib/seat-tier-display";
import { cn } from "@/lib/utils";

/**
 * Two-ink screenprint credentials for floor access.
 * Gallery / loading / stale-sync → render nothing (never grant a credential).
 * Boxed tone for detail surfaces; subtle text-only tone for dense lists (compact).
 */
const CREDENTIAL_TONE: Record<"Seat" | "CornerOffice", string> = {
  Seat: "border-[var(--t-amber)]/55 text-[var(--t-amber)] bg-[var(--t-amber)]/10",
  CornerOffice:
    "border-[var(--t-green)]/55 text-[var(--t-green)] bg-[var(--t-green)]/10",
};

const CREDENTIAL_TONE_COMPACT: Record<"Seat" | "CornerOffice", string> = {
  Seat: "text-[var(--t-amber)]/70",
  CornerOffice: "text-[var(--t-green)]/70",
};

function isCredentialTier(tier: SeatTierName): tier is "Seat" | "CornerOffice" {
  return tier === "Seat" || tier === "CornerOffice";
}

/**
 * Presentational floor credential. Gallery renders nothing.
 * Sync lag on a credential tier surfaces a muted note without private amounts.
 */
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
  // Loading / stale / missing / Gallery never display a credential.
  if (!isCredentialTier(tier)) return null;
  if (syncStatus === "syncing" || syncStatus === "error") return null;

  const label = SEAT_TIER_FLOOR_LABEL[tier];
  const ariaLabel =
    tier === "CornerOffice"
      ? "Floor credential: Corner Office"
      : "Floor credential: Seat";

  // Dense lists (compact) show only a quiet tier icon — no text label.
  if (compact) {
    const Icon = tier === "CornerOffice" ? Crown : Armchair;
    return (
      <span
        role="status"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(
          "inline-flex shrink-0 items-center",
          CREDENTIAL_TONE_COMPACT[tier],
          className
        )}
      >
        <Icon aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]",
        CREDENTIAL_TONE[tier],
        className
      )}
      title={ariaLabel}
    >
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

/** Alias for list/detail surfaces — same Gallery-hide credential rules. */
export const FloorCredential = SeatTierBadgeView;

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

  // undefined = loading → no credential; null/missing → Gallery → no credential.
  if (publicTier === undefined) return null;

  return (
    <SeatTierBadgeView
      tier={publicTier?.effectiveTier ?? "Gallery"}
      syncStatus={publicTier?.syncStatus}
      className={className}
      compact={compact}
    />
  );
}
