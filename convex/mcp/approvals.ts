import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { assertTraderOwnedByDesk } from "../traders";

/**
 * Pending high-stakes approvals for the desk (MCP `get_pending_approvals`).
 * Includes remaining TTL in seconds for Claude to reason about urgency.
 * Only non-expired pending rows.
 */
export const getPending = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    now: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, now, limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 50);

    const approvals = await ctx.db
      .query("dealApprovals")
      .withIndex("byDeskManagerAndStatus", (q) =>
        q.eq("deskManagerId", deskManagerId).eq("status", "pending")
      )
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .order("desc")
      .take(bounded);

    const items = await Promise.all(
      approvals.map(async (a) => {
        const [trader, deal] = await Promise.all([
          ctx.db.get(a.traderId),
          ctx.db.get(a.dealId),
        ]);
        const ttlSec = Math.max(0, Math.floor((a.expiresAt - now) / 1000));
        return {
          approvalId: a._id,
          traderId: a.traderId,
          traderName: trader?.name ?? "Unknown",
          dealId: a.dealId,
          dealPrompt: deal?.prompt ?? "",
          potUsdc: a.potUsdc,
          entryCostUsdc: a.entryCostUsdc,
          expiresAt: a.expiresAt,
          remainingTtlSeconds: ttlSec,
          createdAt: a.createdAt,
        };
      })
    );

    const oldestAgeSeconds =
      items.length > 0
        ? Math.floor(
            (now - Math.min(...approvals.map((a) => a.createdAt))) / 1000
          )
        : null;

    return {
      approvals: items,
      count: items.length,
      oldestAgeSeconds,
    };
  },
});

export type McpAnswerApprovalResult = {
  approvalId: string;
  traderId: string;
  dealId: string;
  status: "approved" | "rejected" | "expired" | "noop";
  remainingPendingApprovals: number;
  summary: string;
};

function truncatePrompt(p: string): string {
  return p.length <= 80 ? p : `${p.slice(0, 77)}…`;
}

/**
 * MCP `answer_approval`: approve or reject a pending high-stakes deal for an
 * owned trader. On approve, schedules an immediate trader cycle so the entry
 * doesn't wait for the next scheduler heartbeat (same as the web mutation in
 * convex/dealApprovals.ts). Already-resolved or expired rows are no-op
 * replays — the HTTP idempotency cache handles identical retries earlier;
 * this path handles legitimate races (e.g. the cron expired it first).
 */
export const answerForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    approvalId: v.id("dealApprovals"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (
    ctx,
    { deskManagerId, approvalId, decision, now }
  ): Promise<McpAnswerApprovalResult> => {
    const approval = await ctx.db.get(approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.deskManagerId !== deskManagerId) {
      throw new Error("Forbidden: approval belongs to another desk");
    }

    const trader = await ctx.db.get(approval.traderId);
    assertTraderOwnedByDesk(trader, deskManagerId);

    const deal = await ctx.db.get(approval.dealId);
    const dealPromptSnippet = truncatePrompt(deal?.prompt ?? "");
    const escrow = trader.escrowBalanceUsdc ?? 0;

    const countRemaining = async () => {
      const rows = await ctx.db
        .query("dealApprovals")
        .withIndex("byDeskManagerAndStatus", (q) =>
          q.eq("deskManagerId", deskManagerId).eq("status", "pending")
        )
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .collect();
      return rows.length;
    };

    const baseResult = {
      approvalId: String(approvalId),
      traderId: String(approval.traderId),
      dealId: String(approval.dealId),
    };

    if (approval.status !== "pending") {
      const remaining = await countRemaining();
      return {
        ...baseResult,
        status: "noop",
        remainingPendingApprovals: remaining,
        summary: `Approval for "${trader.name}" already ${approval.status} — no change. ${remaining} pending approval(s) remain on this desk.`,
      };
    }

    if (approval.expiresAt <= now) {
      await ctx.db.patch(approvalId, { status: "expired", resolvedAt: now });
      const remaining = await countRemaining();
      return {
        ...baseResult,
        status: "expired",
        remainingPendingApprovals: remaining,
        summary: `Approval for "${trader.name}" expired before you answered — the trader's cycle will pick a fresh deal on its next tick. ${remaining} pending approval(s) remain on this desk.`,
      };
    }

    const newStatus = decision === "approve" ? "approved" : "rejected";
    await ctx.db.patch(approvalId, { status: newStatus, resolvedAt: now });

    if (newStatus === "approved") {
      await ctx.scheduler.runAfter(0, internal.agent.cycle.cycle, {
        traderId: approval.traderId,
      });
    }

    const remaining = await countRemaining();
    const verb = newStatus === "approved" ? "Approved" : "Rejected";
    const tail =
      newStatus === "approved"
        ? `Trader cycle scheduled — autonomous loop will enter on next tick. Escrow balance ${escrow.toFixed(2)} USDC; ${remaining} pending approval(s) remain.`
        : `Trader cycle will pick a different deal on its next tick. Escrow balance ${escrow.toFixed(2)} USDC; ${remaining} pending approval(s) remain.`;

    return {
      ...baseResult,
      status: newStatus,
      remainingPendingApprovals: remaining,
      summary: `${verb} "${trader.name}" on deal: ${dealPromptSnippet || "(no prompt)"} (entry ${approval.entryCostUsdc.toFixed(2)} / pot ${approval.potUsdc.toFixed(2)} USDC). ${tail}`,
    };
  },
});

/**
 * Cron entrypoint: scan and auto-reject pending approvals past their TTL.
 * Without this sweep an unanswered pending row blocks the trader cycle
 * (see `findPendingByTraderAndDeal` in convex/dealApprovals.ts) indefinitely.
 * Batch cap of 200 stays well within Convex mutation transaction limits.
 */
export const autoRejectExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("dealApprovals")
      .withIndex("byStatus", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("expiresAt"), now))
      .take(200);

    for (const row of rows) {
      await ctx.db.patch(row._id, { status: "expired", resolvedAt: now });
    }
    if (rows.length > 0) {
      console.log(
        `[mcp/approvals] auto-rejected ${rows.length} expired approval(s)`
      );
    }
    return { expired: rows.length };
  },
});
