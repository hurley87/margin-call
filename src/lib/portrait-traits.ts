import {
  type PublicPortraitTraits,
  SURFACED_SLOTS,
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
