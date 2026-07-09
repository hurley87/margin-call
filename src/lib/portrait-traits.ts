import {
  type PublicPortraitTraits,
  type PortraitTier,
  SURFACED_SLOTS,
  TIER_RANK,
  TRAIT_META,
} from "../../convex/lib/portraitSeed";

export type { PublicPortraitTraits };

/** [surfacedKey, display label] rows for the 5 v4 trait slots. */
export const PUBLIC_PORTRAIT_TRAIT_ROWS = SURFACED_SLOTS.map(
  (slot) => [slot.key, slot.label] as const
) as ReadonlyArray<readonly [keyof PublicPortraitTraits, string]>;

/** Human display label for a stored trait id within its slot. */
export function humanizePortraitTraitValue(
  slotKey: keyof PublicPortraitTraits,
  id: string
): string {
  return TRAIT_META[slotKey]?.[id]?.label ?? id;
}

/** Rarity tier for a stored trait id within its slot. */
export function portraitTraitTier(
  slotKey: keyof PublicPortraitTraits,
  id: string
): PortraitTier {
  return TRAIT_META[slotKey]?.[id]?.tier ?? "Common";
}

export type FunTrait = {
  key: keyof PublicPortraitTraits;
  id: string;
  label: string;
  tier: PortraitTier;
};

/** Default/boring trait values that carry no character — skipped when picking. */
const BORING_TRAIT_IDS = new Set(["none", "plain"]);

/**
 * Pick the most characterful traits for a trader, rarest first. Skips the
 * boring defaults ("none" vice, "plain" field) and falls back to the priority
 * order (vice → attire → expression → …) for same-tier ties. Used to show fun
 * flavor on roster tiles.
 */
export function pickFunTraits(
  traits: PublicPortraitTraits,
  max = 2
): FunTrait[] {
  // Priority order favors the slots that read as personality.
  const order: Array<keyof PublicPortraitTraits> = [
    "vice",
    "attire",
    "expression",
    "fieldInk",
    "fieldFlourish",
  ];

  return (
    order
      .map((key) => {
        const id = traits[key];
        return {
          key,
          id,
          label: humanizePortraitTraitValue(key, id),
          tier: portraitTraitTier(key, id),
        };
      })
      .filter((t) => !BORING_TRAIT_IDS.has(t.id))
      // Stable sort by tier desc keeps the priority order for equal tiers.
      .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
      .slice(0, max)
  );
}
