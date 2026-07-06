import { cn } from "@/lib/utils";
import {
  PUBLIC_PORTRAIT_TRAIT_ROWS,
  humanizePortraitTraitValue,
  type PublicPortraitTraits,
} from "@/lib/portrait-traits";
import { TRAIT_META } from "../../convex/lib/portraitSeed";

type Tier = "Common" | "Uncommon" | "Rare" | "Legendary";

// Tier → palette (existing tokens only). Rares/legendaries pop; commons/uncommons
// stay neutral so the eye lands on what's actually rare. Legendary gets a gold glow.
const TIER_TONE: Record<
  Tier,
  { text: string; badge: string; tag: string | null }
> = {
  Common: {
    text: "text-[var(--t-text)]",
    badge: "border-[var(--t-divider)] text-[var(--t-muted)]",
    tag: null,
  },
  Uncommon: {
    text: "text-[var(--t-text)]",
    badge: "border-[var(--t-green)]/50 text-[var(--t-green)]",
    tag: null,
  },
  Rare: {
    text: "text-[var(--t-blue)]",
    badge: "border-[var(--t-blue)]/60 text-[var(--t-blue)]",
    tag: "RARE",
  },
  Legendary: {
    text: "text-[var(--t-amber-hot)]",
    badge:
      "border-[var(--t-amber)]/60 bg-[var(--t-amber)]/[0.06] text-[var(--t-amber-hot)] shadow-[0_0_12px_rgba(235,193,122,0.28)]",
    tag: "LEG",
  },
};

export function normalizeTier(rarity: string): Tier {
  return (rarity as Tier) in TIER_TONE ? (rarity as Tier) : "Common";
}

function tierOf(slotKey: keyof PublicPortraitTraits, id: string): Tier {
  return (TRAIT_META[slotKey]?.[id]?.tier as Tier) ?? "Common";
}

/** Tier-colored rarity pill. Legendary gets a subtle gold glow. */
export function RarityBadge({
  rarity,
  className,
}: {
  rarity: string;
  className?: string;
}) {
  const tier = normalizeTier(rarity);
  const tone = TIER_TONE[tier];
  const notable = tier === "Rare" || tier === "Legendary";
  return (
    <span
      data-tier={tier}
      className={cn(
        "inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.18em]",
        tone.badge,
        className
      )}
    >
      {notable ? (
        <span aria-hidden className="text-[0.7em]">
          ◆
        </span>
      ) : null}
      {rarity}
    </span>
  );
}

/**
 * The 5 surfaced portrait traits as a read-only list, tier-colored per value.
 * Callers should gate on a non-null `traits`.
 */
export function PersonaTraits({
  traits,
  className,
}: {
  traits: PublicPortraitTraits;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-px bg-[var(--t-divider)]/40 sm:grid-cols-2",
        className
      )}
    >
      {PUBLIC_PORTRAIT_TRAIT_ROWS.map(([key, label]) => {
        const id = traits[key];
        const tier = tierOf(key, id);
        const tone = TIER_TONE[tier];
        const notable = tier === "Rare" || tier === "Legendary";
        return (
          <div
            key={key}
            data-tier={notable ? tier : undefined}
            className="flex min-w-0 items-baseline justify-between gap-3 bg-[#070b09]/85 px-3 py-2 sm:px-4"
          >
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
              {label}
            </dt>
            <dd
              className={cn(
                "flex min-w-0 items-center justify-end gap-1.5 text-right text-xs font-bold uppercase tracking-[0.12em]",
                tone.text
              )}
            >
              {notable ? (
                <span aria-hidden className="shrink-0 text-[0.7em] opacity-80">
                  ◆
                </span>
              ) : null}
              <span className="truncate">
                {humanizePortraitTraitValue(key, id)}
              </span>
              {tone.tag ? (
                <span className="shrink-0 border border-current px-1 text-[8px] leading-tight opacity-90">
                  {tone.tag}
                </span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
