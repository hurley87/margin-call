import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";

// ── Public queries ─────────────────────────────────────────────────────────

/** List pending approvals for the authenticated desk manager. */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) return [];

    const approvals = await ctx.db
      .query("dealApprovals")
      .withIndex("byDeskManagerAndStatus", (q) =>
        q.eq("deskManagerId", dm._id).eq("status", "pending")
      )
      .order("desc")
      .collect();

    // Join in trader name and deal prompt for UI display
    const result = await Promise.all(
      approvals.map(async (approval) => {
        const [trader, deal] = await Promise.all([
          ctx.db.get(approval.traderId),
          ctx.db.get(approval.dealId),
        ]);
        return {
          ...approval,
          traderName: trader?.name ?? "Unknown",
          dealPrompt: deal?.prompt ?? "",
          dealPotUsdc: deal?.potUsdc ?? 0,
        };
      })
    );

    return result;
  },
});

/** Get a single approval by id — auth-checked (must be the desk manager who owns it). */
export const getById = query({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) return null;

    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.deskManagerId !== dm._id) return null;
    return approval;
  },
});

// ── Public mutations (user-facing, auth-checked, idempotent) ───────────────

/**
 * Approve a pending deal approval.
 * - Validates the approval belongs to the authenticated desk manager.
 * - Only transitions pending → approved; all other states are no-ops.
 * - Duplicate calls are idempotent: if already approved, returns current record.
 */
export const approve = mutation({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) throw new Error("Desk manager not found");

    const approval = await ctx.db.get(approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.deskManagerId !== dm._id)
      throw new Error("Not authorized for this approval");

    // Idempotency: already approved → no-op
    if (approval.status === "approved") return approval;

    // Validate from-state: only pending can be approved
    if (approval.status !== "pending") {
      // Expired, rejected, consumed — return current state without error
      return approval;
    }

    await ctx.db.patch(approvalId, {
      status: "approved",
      resolvedAt: Date.now(),
    });

    return { ...approval, status: "approved" };
  },
});

/**
 * Reject a pending deal approval.
 * - Validates the approval belongs to the authenticated desk manager.
 * - Only transitions pending → rejected; all other states are no-ops.
 * - Duplicate calls are idempotent.
 */
export const reject = mutation({
  args: {
    approvalId: v.id("dealApprovals"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { approvalId, reason: _reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) throw new Error("Desk manager not found");

    const approval = await ctx.db.get(approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.deskManagerId !== dm._id)
      throw new Error("Not authorized for this approval");

    // Idempotency: already rejected → no-op
    if (approval.status === "rejected") return approval;

    // Validate from-state: only pending can be rejected
    if (approval.status !== "pending") {
      return approval;
    }

    await ctx.db.patch(approvalId, {
      status: "rejected",
      resolvedAt: Date.now(),
    });

    return { ...approval, status: "rejected" };
  },
});

// ── Internal queries ───────────────────────────────────────────────────────

/** Internal: load an approval without auth (for cycle actions). */
export const loadInternal = internalQuery({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => ctx.db.get(approvalId),
});

/** Internal: find an existing approval for (traderId, dealId) in pending state. */
export const findPendingByTraderAndDeal = internalQuery({
  args: { traderId: v.id("traders"), dealId: v.id("deals") },
  handler: async (ctx, { traderId, dealId }) => {
    const results = await ctx.db
      .query("dealApprovals")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .filter((q) =>
        q.and(
          q.eq(q.field("dealId"), dealId),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();
    return results[0] ?? null;
  },
});

// ── Internal mutations (called by cycle) ───────────────────────────────────

/**
 * Internal: request an approval from the cycle.
 * Creates a new pending approval for (traderId, dealId).
 * If one already exists in pending state for this pair, returns the existing id (idempotent).
 */
export const request = internalMutation({
  args: {
    traderId: v.id("traders"),
    dealId: v.id("deals"),
    deskManagerId: v.id("deskManagers"),
    entryCostUsdc: v.number(),
    potUsdc: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Idempotency: if already pending for this (traderId, dealId), return existing
    const existing = await ctx.db
      .query("dealApprovals")
      .withIndex("byTrader", (q) => q.eq("traderId", args.traderId))
      .filter((q) =>
        q.and(
          q.eq(q.field("dealId"), args.dealId),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();
    if (existing.length > 0) return existing[0]._id;

    return ctx.db.insert("dealApprovals", {
      ...args,
      status: "pending",
      resolvedAt: undefined,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal: mark approval as consumed (deal was entered after approval).
 * CAS: only transitions approved → consumed.
 */
export const consume = internalMutation({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => {
    const approval = await ctx.db.get(approvalId);
    if (!approval) return;
    if (approval.status !== "approved") return; // only consume if approved
    await ctx.db.patch(approvalId, {
      status: "consumed",
      resolvedAt: Date.now(),
    });
  },
});

/**
 * Internal: expire overdue pending approvals.
 * Called by the scheduler; no-ops if already resolved.
 */
export const expirePending = internalMutation({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => {
    const approval = await ctx.db.get(approvalId);
    if (!approval) return;
    if (approval.status !== "pending") return;
    if (approval.expiresAt > Date.now()) return;
    await ctx.db.patch(approvalId, {
      status: "expired",
      resolvedAt: Date.now(),
    });
  },
});
