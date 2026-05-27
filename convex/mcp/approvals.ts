import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

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

/**
 * Count remaining pending (non-expired) approvals for a desk at `now`.
 * Used by `answer_approval` to enrich the action's summary with portfolio
 * context (how many approvals still need attention after this decision).
 */
async function countRemainingPendingApprovals(
  ctx: MutationCtx,
  deskManagerId: Id<"deskManagers">,
  now: number
): Promise<number> {
  const rows = await ctx.db
    .query("dealApprovals")
    .withIndex("byDeskManagerAndStatus", (q) =>
      q.eq("deskManagerId", deskManagerId).eq("status", "pending")
    )
    .filter((q) => q.gt(q.field("expiresAt"), now))
    .take(51);
  return rows.length;
}

export type McpAnswerApprovalResult = {
  approvalId: string;
  traderId: string;
  dealId: string;
  status: "approved" | "rejected" | "expired" | "noop";
  remainingPendingApprovals: number;
  summary: string;
};

/**
 * MCP `answer_approval`: approve or reject a pending high-stakes deal for an
 * owned trader. Ownership is enforced server-side; only the desk that owns
 * the trader (and the approval row) may answer it. Transitions only fire on
 * pending rows that have not yet expired; everything else is a no-op replay
 * that returns the current status.
 *
 * On approve, schedules an immediate trader cycle so the autonomous loop
 * picks the deal up without waiting for the next scheduler heartbeat.
 *
 * Summary includes the deal prompt snippet, trader name + escrow balance, and
 * remaining pending approval count so Claude can reason about portfolio change
 * from the action result alone.
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

    const trader: Doc<"traders"> | null = await ctx.db.get(approval.traderId);
    if (!trader || trader.deskManagerId !== deskManagerId) {
      throw new Error("Forbidden: trader not owned by this desk");
    }

    const deal = await ctx.db.get(approval.dealId);

    const dealPromptSnippet = (() => {
      const p = deal?.prompt ?? "";
      if (p.length <= 80) return p;
      return `${p.slice(0, 77)}…`;
    })();
    const escrow = trader.escrowBalanceUsdc ?? 0;

    // Replay-safe: if already resolved, return the current status without
    // changing state. The HTTP idempotency cache layer will catch identical
    // (deskId, idempotencyKey) replays earlier; this handles legitimate races
    // where the approval was already finalized (e.g. expired by the cron).
    if (approval.status !== "pending") {
      const remaining = await countRemainingPendingApprovals(
        ctx,
        deskManagerId,
        now
      );
      return {
        approvalId: String(approvalId),
        traderId: String(approval.traderId),
        dealId: String(approval.dealId),
        status: "noop",
        remainingPendingApprovals: remaining,
        summary: `Approval for "${trader.name}" already ${approval.status} — no change. ${remaining} pending approval(s) remain on this desk.`,
      };
    }

    // Pending but already expired → record expiry, treat as no-op for caller.
    if (approval.expiresAt <= now) {
      await ctx.db.patch(approvalId, {
        status: "expired",
        resolvedAt: now,
      });
      const remaining = await countRemainingPendingApprovals(
        ctx,
        deskManagerId,
        now
      );
      return {
        approvalId: String(approvalId),
        traderId: String(approval.traderId),
        dealId: String(approval.dealId),
        status: "expired",
        remainingPendingApprovals: remaining,
        summary: `Approval for "${trader.name}" expired before you answered — the trader's cycle will pick a fresh deal on its next tick. ${remaining} pending approval(s) remain on this desk.`,
      };
    }

    const newStatus = decision === "approve" ? "approved" : "rejected";
    await ctx.db.patch(approvalId, {
      status: newStatus,
      resolvedAt: now,
    });

    // On approve, kick the trader cycle immediately so the entry doesn't
    // wait for the next scheduler heartbeat — same behaviour as the web
    // mutation in convex/dealApprovals.ts.
    if (newStatus === "approved") {
      await ctx.scheduler.runAfter(0, internal.agent.cycle.cycle, {
        traderId: approval.traderId,
      });
    }

    const remaining = await countRemainingPendingApprovals(
      ctx,
      deskManagerId,
      now
    );

    const verb = newStatus === "approved" ? "Approved" : "Rejected";
    const tail =
      newStatus === "approved"
        ? `Trader cycle scheduled — autonomous loop will enter on next tick. Escrow balance ${escrow.toFixed(2)} USDC; ${remaining} pending approval(s) remain.`
        : `Trader cycle will pick a different deal on its next tick. Escrow balance ${escrow.toFixed(2)} USDC; ${remaining} pending approval(s) remain.`;

    return {
      approvalId: String(approvalId),
      traderId: String(approval.traderId),
      dealId: String(approval.dealId),
      status: newStatus as "approved" | "rejected",
      remainingPendingApprovals: remaining,
      summary: `${verb} "${trader.name}" on deal: ${dealPromptSnippet || "(no prompt)"} (entry ${approval.entryCostUsdc.toFixed(2)} / pot ${approval.potUsdc.toFixed(2)} USDC). ${tail}`,
    };
  },
});

/**
 * Internal: scan and auto-reject pending approvals past their TTL. Mutations
 * have transaction limits, so we cap the batch at 50 per invocation — the
 * cron tick rate (~5 min) keeps this comfortably ahead of normal load.
 * Returns the number of approvals expired so the cron logs are useful.
 */
export const autoRejectExpired = internalMutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { now, limit = 50 }) => {
    const bounded = Math.min(Math.max(1, limit), 200);
    const rows = await ctx.db
      .query("dealApprovals")
      .withIndex("byStatus", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("expiresAt"), now))
      .take(bounded);

    let expired = 0;
    for (const row of rows) {
      // Defensive: re-check status + expiry inside the batch.
      if (row.status !== "pending") continue;
      if (row.expiresAt > now) continue;
      await ctx.db.patch(row._id, {
        status: "expired",
        resolvedAt: now,
      });
      expired += 1;
    }
    return { expired, scanned: rows.length };
  },
});

/**
 * Internal action: cron entrypoint for auto-rejecting expired approvals.
 * Wrapping the mutation in an action lets us call Date.now() once outside
 * the transaction (Convex guideline: queries/mutations should not embed
 * non-deterministic time) and emits a single log line per tick.
 */
export const autoRejectExpiredAction = internalAction({
  args: {},
  handler: async (ctx): Promise<{ expired: number; scanned: number }> => {
    const now = Date.now();
    const result: { expired: number; scanned: number } = await ctx.runMutation(
      internal.mcp.approvals.autoRejectExpired,
      { now }
    );
    if (result.expired > 0) {
      console.log(
        `[mcp/approvals] auto-rejected ${result.expired} expired approval(s) (scanned ${result.scanned})`
      );
    }
    return result;
  },
});
