"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { readDeskUsdcBalance, requireDeskWallet } from "./deskByo";

/**
 * Authoritative desk wallet sync: reads USDC balanceOf on-chain and writes
 * Convex. Callers must not trust client-supplied balance values.
 */
export const syncWalletFromChainForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
  },
  handler: async (ctx, { deskManagerId }) => {
    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: deskManagerId }
    );
    if (!dm?.subject) {
      throw new Error("Desk not found");
    }

    const walletAddress = requireDeskWallet(dm);
    const balanceUsdc = await readDeskUsdcBalance(walletAddress);

    await ctx.runMutation(internal.deskManagers.syncWalletBalance, {
      subject: dm.subject,
      walletAddress,
      balanceUsdc,
      email: undefined,
    });

    return { ok: true as const, walletAddress, balanceUsdc };
  },
});
