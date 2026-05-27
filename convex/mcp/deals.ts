import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export type McpDealWriteResult = {
  dealId: string;
  onChainDealId?: number;
  txHash?: string;
  walletAddress?: string;
  summary: string;
};

/**
 * Read-only list of open (or recent) deals for MCP `list_deals`.
 * Includes own-desk eligibility flag so Claude knows which deals his traders may enter.
 */
export const list = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    limit: v.optional(v.number()),
    includeClosed: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { deskManagerId, limit = 30, includeClosed = false }
  ) => {
    const bounded = Math.min(Math.max(1, limit), 100);

    let q = ctx.db
      .query("deals")
      .withIndex("byStatus", (qq) => qq.eq("status", "open"))
      .order("desc");

    if (includeClosed) {
      q = ctx.db.query("deals").order("desc");
    }

    const deals = await q.take(bounded);

    const items = deals.map((d) => {
      const isOwnDesk = d.creatorDeskManagerId === deskManagerId;
      return {
        dealId: d._id,
        prompt: d.prompt,
        sourceHeadline: d.sourceHeadline ?? null,
        potUsdc: d.potUsdc,
        entryCostUsdc: d.entryCostUsdc,
        status: d.status,
        creatorType: d.creatorType,
        creatorDeskManagerId: d.creatorDeskManagerId ?? null,
        entryCount: d.entryCount ?? 0,
        eligibleForMe: !isOwnDesk,
        createdAt: d.createdAt,
      };
    });

    return {
      deals: items,
      count: items.length,
    };
  },
});

/**
 * MCP `create_deal`: insert the Convex `deals` row for a deal already
 * created on-chain by the MCP desk wallet. Idempotent on `onChainDealId`.
 *
 * Owner check: deskManagerId is supplied by the MCP HTTP layer after
 * mc_live_* key validation, so this mutation only needs to verify the desk
 * exists. The on-chain creator address is asserted to match the desk wallet
 * inside the action that wraps this mutation.
 */
export const recordOnChainCreationForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    onChainDealId: v.number(),
    onChainTxHash: v.string(),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
  },
  handler: async (ctx, args): Promise<McpDealWriteResult> => {
    const desk = await ctx.db.get(args.deskManagerId);
    if (!desk) throw new Error("Desk not found");

    const existing = await ctx.db
      .query("deals")
      .withIndex("byOnChainDealId", (q) =>
        q.eq("onChainDealId", args.onChainDealId)
      )
      .unique();
    if (existing) {
      return {
        dealId: String(existing._id),
        onChainDealId: existing.onChainDealId,
        txHash: existing.onChainTxHash,
        walletAddress: desk.walletAddress,
        summary: `Deal #${existing.onChainDealId ?? "?"} already recorded (${existing.potUsdc.toFixed(2)} USDC pot, ${existing.entryCostUsdc.toFixed(2)} USDC entry cost).`,
      };
    }

    const now = Date.now();
    const newId: Id<"deals"> = await ctx.db.insert("deals", {
      creatorDeskManagerId: args.deskManagerId,
      creatorAddress: desk.walletAddress,
      creatorType: "desk_manager",
      prompt: args.prompt,
      potUsdc: args.potUsdc,
      entryCostUsdc: args.entryCostUsdc,
      status: "open",
      onChainDealId: args.onChainDealId,
      onChainTxHash: args.onChainTxHash,
      entryCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      dealId: String(newId),
      onChainDealId: args.onChainDealId,
      txHash: args.onChainTxHash,
      walletAddress: desk.walletAddress,
      summary: `Created an open deal with ${args.potUsdc.toFixed(2)} USDC pot and ${args.entryCostUsdc.toFixed(2)} USDC entry cost.`,
    };
  },
});

/**
 * MCP `close_deal` pre-flight: load + ownership-check a deal, returning the
 * fields the wrapping action needs to sign and submit `escrow.closeDeal`.
 */
export const loadOwnedDealForClose = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    dealId: v.id("deals"),
  },
  handler: async (ctx, { deskManagerId, dealId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) throw new Error("Deal not found");
    if (deal.creatorDeskManagerId !== deskManagerId) {
      throw new Error("Deal is not owned by this desk");
    }
    if (typeof deal.onChainDealId !== "number") {
      throw new Error("Deal has no on-chain id (cannot close on escrow)");
    }
    if (deal.status !== "open") {
      throw new Error(`Deal is already ${deal.status}`);
    }

    const desk = await ctx.db.get(deskManagerId);
    if (!desk?.subject) throw new Error("Desk not found");

    return {
      onChainDealId: deal.onChainDealId,
      walletAddress: desk.walletAddress,
      subject: desk.subject,
    };
  },
});

/**
 * MCP `close_deal` post-tx: mark the Convex `deals` row as closed.
 * Idempotent — if the row is already closed (e.g. via the web UI sync), this is
 * a no-op. Re-verifies desk ownership defensively.
 */
export const markDealClosedForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    dealId: v.id("deals"),
  },
  handler: async (ctx, { deskManagerId, dealId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) throw new Error("Deal not found");
    if (deal.creatorDeskManagerId !== deskManagerId) {
      throw new Error("Deal is not owned by this desk");
    }
    if (deal.status === "closed") return { alreadyClosed: true as const };
    await ctx.db.patch(dealId, { status: "closed", updatedAt: Date.now() });
    return { alreadyClosed: false as const };
  },
});
