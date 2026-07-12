import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { SeatTierName } from "./policy";

/**
 * Safe public display tier for badges and list surfaces.
 * Fail closed: missing row, inactive vault, or non-ok sync → Gallery.
 * Never carries staker / amounts / unlock metadata.
 */
export function displayTierFromSeatRow(
  row:
    | Pick<
        Doc<"traderSeatState">,
        "effectiveTier" | "syncStatus" | "isActiveVault"
      >
    | null
    | undefined
): SeatTierName {
  if (!row || !row.isActiveVault) return "Gallery";
  if (row.syncStatus !== "ok") return "Gallery";
  return row.effectiveTier;
}

export type PublicTraderTier = {
  effectiveTier: SeatTierName;
  syncStatus: Doc<"traderSeatState">["syncStatus"];
};

/** Resolve public tier + sync surface for a single trader (no private fields). */
export async function resolvePublicTraderTier(
  ctx: QueryCtx,
  traderId: Id<"traders">
): Promise<PublicTraderTier> {
  const rows = await ctx.db
    .query("traderSeatState")
    .withIndex("byTrader", (q) => q.eq("traderId", traderId))
    .collect();
  const activeRow = rows.find((r) => r.isActiveVault);
  if (!activeRow) {
    return { effectiveTier: "Gallery", syncStatus: "syncing" };
  }
  return {
    effectiveTier: displayTierFromSeatRow(activeRow),
    syncStatus: activeRow.syncStatus,
  };
}

/**
 * Batch-load display tiers for many traders (leaderboard / roster / outcomes).
 * Only active-vault rows are scanned; missing traders default to Gallery.
 */
export async function mapDisplayTiersByTraderId(
  ctx: QueryCtx,
  traderIds: ReadonlyArray<Id<"traders">>
): Promise<Map<string, SeatTierName>> {
  const wanted = new Set(traderIds.map(String));
  const result = new Map<string, SeatTierName>();
  for (const id of wanted) {
    result.set(id, "Gallery");
  }
  if (wanted.size === 0) return result;

  const activeRows = await ctx.db
    .query("traderSeatState")
    .withIndex("byActiveVaultAndTier", (q) => q.eq("isActiveVault", true))
    .collect();

  for (const row of activeRows) {
    const key = String(row.traderId);
    if (!wanted.has(key)) continue;
    result.set(key, displayTierFromSeatRow(row));
  }
  return result;
}
