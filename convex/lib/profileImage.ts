import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const FALLBACK_PROFILE_IMAGE_URL = "/trader-placeholder.svg";

export async function resolveTraderProfileImageUrl(
  ctx: QueryCtx,
  trader: Doc<"traders">
): Promise<string> {
  if (trader.imageStatus === "ready" && trader.profileImageStorageId) {
    return (
      (await ctx.storage.getUrl(trader.profileImageStorageId)) ??
      FALLBACK_PROFILE_IMAGE_URL
    );
  }

  return FALLBACK_PROFILE_IMAGE_URL;
}
