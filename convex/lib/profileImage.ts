import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const FALLBACK_PROFILE_IMAGE_URL = "/trader-placeholder.svg";

/** URL when portrait is stored and ready; otherwise null (no public fallback). */
export async function resolveReadyProfileImageUrl(
  ctx: QueryCtx,
  trader: Doc<"traders">
): Promise<string | null> {
  if (trader.imageStatus !== "ready" || !trader.profileImageStorageId) {
    return null;
  }
  return (await ctx.storage.getUrl(trader.profileImageStorageId)) ?? null;
}

export async function resolveTraderProfileImageUrl(
  ctx: QueryCtx,
  trader: Doc<"traders">
): Promise<string> {
  const ready = await resolveReadyProfileImageUrl(ctx, trader);
  if (ready) return ready;
  return FALLBACK_PROFILE_IMAGE_URL;
}
