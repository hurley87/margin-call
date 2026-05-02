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

    const now = Date.now();
    const approvals = await ctx.db
      .query("dealApprovals")
      .withIndex("byDeskManagerAndStatus", (q) =>
        q.eq("deskManagerId", dm._id).eq("status", "pending")
      )
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .order("desc")
      .collect();

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

    const now = Date.now();

    if (approval.status === "approved") return approval;

    if (approval.status !== "pending") {
      return approval;
    }

    if (approval.expiresAt <= now) {
      await ctx.db.patch(approvalId, {
        status: "expired",
        resolvedAt: now,
      });
      return { ...approval, status: "expired", resolvedAt: now };
    }

    await ctx.db.patch(approvalId, {
      status: "approved",
      resolvedAt: now,
    });

    return { ...approval, status: "approved", resolvedAt: now };
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

    const now = Date.now();

    if (approval.status === "rejected") return approval;

    if (approval.status !== "pending") {
      return approval;
    }

    if (approval.expiresAt <= now) {
      await ctx.db.patch(approvalId, {
        status: "expired",
        resolvedAt: now,
      });
      return { ...approval, status: "expired", resolvedAt: now };
    }

    await ctx.db.patch(approvalId, {
      status: "rejected",
      resolvedAt: now,
    });

    return { ...approval, status: "rejected", resolvedAt: now };
  },
});

// ── Internal queries ───────────────────────────────────────────────────────

/** Internal: load an approval without auth (for cycle actions). */
export const loadInternal = internalQuery({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => ctx.db.get(approvalId),
});

/** Internal: find an existing approval for (traderId, dealId) in pending state (not expired). */
export const findPendingByTraderAndDeal = internalQuery({
  args: { traderId: v.id("traders"), dealId: v.id("deals") },
  handler: async (ctx, { traderId, dealId }) => {
    const now = Date.now();
    const results = await ctx.db
      .query("dealApprovals")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .filter((q) =>
        q.and(
          q.eq(q.field("dealId"), dealId),
          q.eq(q.field("status"), "pending"),
          q.gt(q.field("expiresAt"), now)
        )
      )
      .collect();
    return results[0] ?? null;
  },
});

/** Internal: find an approved (desk-signed-off) row for (traderId, dealId), newest first. */
export const findApprovedByTraderAndDeal = internalQuery({
  args: { traderId: v.id("traders"), dealId: v.id("deals") },
  handler: async (ctx, { traderId, dealId }) => {
    const results = await ctx.db
      .query("dealApprovals")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .filter((q) =>
        q.and(
          q.eq(q.field("dealId"), dealId),
          q.eq(q.field("status"), "approved")
        )
      )
      .collect();
    if (results.length === 0) return null;
    results.sort(
      (a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt)
    );
    return results[0] ?? null;
  },
});

// ── Internal mutations (called by cycle) ───────────────────────────────────

/**
 * Internal: request an approval from the cycle.
 * Returns existing non-expired pending id, or approved id (cycle not yet consumed),
 * else inserts a new pending row.
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
    const now = Date.now();
    const rows = await ctx.db
      .query("dealApprovals")
      .withIndex("byTrader", (q) => q.eq("traderId", args.traderId))
      .filter((q) => q.eq(q.field("dealId"), args.dealId))
      .collect();

    const pendingValid = rows.find(
      (r) => r.status === "pending" && r.expiresAt > now
    );
    if (pendingValid) return pendingValid._id;

    const approved = rows.find((r) => r.status === "approved");
    if (approved) return approved._id;

    return ctx.db.insert("dealApprovals", {
      ...args,
      status: "pending",
      resolvedAt: undefined,
      createdAt: now,
    });
  },
});

/**
 * Internal: mark approval as consumed (deal was entered after approval).
 * CAS: only transitions approved → consumed (or expired if past expiresAt).
 */
export const consume = internalMutation({
  args: { approvalId: v.id("dealApprovals") },
  handler: async (ctx, { approvalId }) => {
    const approval = await ctx.db.get(approvalId);
    if (!approval) return;
    if (approval.status !== "approved") return;
    const now = Date.now();
    if (approval.expiresAt <= now) {
      await ctx.db.patch(approvalId, {
        status: "expired",
        resolvedAt: now,
      });
      return;
    }
    await ctx.db.patch(approvalId, {
      status: "consumed",
      resolvedAt: now,
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
