import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { SeatTierName } from "./policy";

/**
 * Owner-facing reconcile after a confirmed stake / unstake tx.
 * Mirrors escrow post-chain sync: auth → ownership → internal indexer reconcile.
 */
export const reconcileOwnedTrader = action({
  args: {
    traderId: v.id("traders"),
    vaultAddress: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    effectiveTier: v.union(
      v.literal("Gallery"),
      v.literal("Seat"),
      v.literal("CornerOffice")
    ),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: boolean;
    effectiveTier: SeatTierName;
    error?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const trader = await ctx.runQuery(internal.traders.loadInternal, {
      traderId: args.traderId,
    });
    if (!trader || trader.ownerSubject !== identity.subject) {
      throw new Error("Not the desk for this trader");
    }
    if (trader.tokenId == null) {
      throw new Error("Trader badge not minted yet");
    }

    return await ctx.runAction(internal.seatVault.indexer.reconcileTrader, {
      onChainTraderId: trader.tokenId,
      vaultAddress: args.vaultAddress,
    });
  },
});
