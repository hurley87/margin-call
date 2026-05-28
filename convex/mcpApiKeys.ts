import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Internal helpers for MCP API key lifecycle. Keys are issued from
 * Privy-authenticated Next.js routes (raw keys never reach Convex).
 */

const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000;

type MyIssuedMcpDesk = {
  keyId: Id<"mcpApiKeys">;
  deskManagerId: Id<"deskManagers">;
  deskSubject?: string;
  walletAddress?: string;
  cdpAccountName?: string;
  createdAt: number;
  lastUsedAt?: number;
  withdraw: {
    ceremonyCompleted: boolean;
    allowlistCount: number;
    pendingProposal?: string;
    dailyCap?: number;
    dailyUsed?: number;
  };
};

type ConfirmWithdrawCeremonyResult = {
  ok: true;
  alreadyDone?: true;
  address?: string;
  allowlist?: string[];
  ceremonyCompletedAt?: number;
};

type RevokeKeyResult = {
  ok: true;
  alreadyRevoked: boolean;
  revokedAt: number;
  deskManagerId: Id<"deskManagers">;
};

type RotateKeyResult = {
  ok: true;
  newKeyId: Id<"mcpApiKeys">;
  deskManagerId: Id<"deskManagers">;
};

type McpRequestDebugRow = {
  _id: string;
  tool: string;
  idempotencyKey?: string;
  result?: unknown;
  error?: string;
  txHash?: string;
  durationMs: number;
  createdAt: number;
};

export const create = internalMutation({
  args: {
    keyHash: v.string(),
    deskManagerId: v.id("deskManagers"),
    issuedByPrivySubject: v.optional(v.string()),
  },
  handler: async (ctx, { keyHash, deskManagerId, issuedByPrivySubject }) => {
    return await ctx.db.insert("mcpApiKeys", {
      keyHash,
      deskManagerId,
      issuedByPrivySubject,
      createdAt: Date.now(),
    });
  },
});

export const lookupDeskByKeyHash = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const keyDoc = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byKeyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!keyDoc || keyDoc.revokedAt != null) {
      return null;
    }
    const desk = await ctx.db.get(keyDoc.deskManagerId);
    if (!desk) return null;
    return {
      deskManagerId: keyDoc.deskManagerId,
      walletAddress: desk.walletAddress,
      issuedByPrivySubject: keyDoc.issuedByPrivySubject,
    };
  },
});

export const touchLastUsed = internalMutation({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const keyDoc = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byKeyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!keyDoc || keyDoc.revokedAt != null) return;
    const now = Date.now();
    if (
      keyDoc.lastUsedAt != null &&
      now - keyDoc.lastUsedAt < LAST_USED_DEBOUNCE_MS
    ) {
      return;
    }
    await ctx.db.patch(keyDoc._id, { lastUsedAt: now });
  },
});

/**
 * List MCP desks (and their key info) issued by the given Privy subject.
 * Used by web UI for "My Agent Desks" + ceremony + operator debug.
 */
export const listIssuedBy = internalQuery({
  args: { issuedBy: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { issuedBy, limit = 50 }) => {
    const keys = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byIssuedBy", (q) => q.eq("issuedByPrivySubject", issuedBy))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .order("desc")
      .take(limit);

    const results = await Promise.all(
      keys.map(async (k) => {
        const desk = await ctx.db.get(k.deskManagerId);
        return {
          keyId: k._id,
          deskManagerId: k.deskManagerId,
          deskSubject: desk?.subject,
          walletAddress: desk?.walletAddress,
          cdpAccountName: desk?.cdpAccountName,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
          withdraw: {
            ceremonyCompleted: !!desk?.withdrawCeremonyCompletedAt,
            allowlistCount: (desk?.withdrawAllowlist ?? []).length,
            pendingProposal: desk?.pendingWithdrawAddress,
            dailyCap: desk?.dailyWithdrawCapUsdc,
            dailyUsed: desk?.dailyWithdrawUsedUsdc,
          },
        };
      })
    );
    return results;
  },
});

/**
 * Confirm a pending withdrawal address ceremony for an MCP desk.
 * Caller must be the issuedBy for at least one active key on this desk.
 * Idempotent: if already confirmed for this address, no-op success.
 */
export const confirmWithdrawCeremony = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    address: v.string(),
    confirmedByPrivySubject: v.string(),
  },
  handler: async (ctx, { deskManagerId, address, confirmedByPrivySubject }) => {
    const desk = await ctx.db.get(deskManagerId);
    if (!desk) throw new Error("Desk not found");

    // Verify the caller issued a key for this desk
    const keys = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    const isIssuer = keys.some(
      (k) => k.issuedByPrivySubject === confirmedByPrivySubject
    );
    if (!isIssuer) {
      throw new Error(
        "Not authorized: you did not issue any active MCP key for this desk"
      );
    }

    const norm = address.trim().toLowerCase();
    const now = Date.now();

    // Already done for this or any? If ceremony done, allow adding the addr if not present
    const currentList: string[] = desk.withdrawAllowlist ?? [];
    if (desk.withdrawCeremonyCompletedAt && currentList.includes(norm)) {
      return { ok: true as const, alreadyDone: true };
    }

    const updatedList = currentList.includes(norm)
      ? currentList
      : [...currentList, norm];

    await ctx.db.patch(deskManagerId, {
      withdrawAllowlist: updatedList,
      withdrawAllowlistUpdatedAt: now,
      withdrawCeremonyCompletedAt: desk.withdrawCeremonyCompletedAt ?? now,
      boundHumanSubject: confirmedByPrivySubject,
      pendingWithdrawAddress: undefined,
      pendingWithdrawCeremonyAt: undefined,
      updatedAt: now,
    });

    return {
      ok: true as const,
      address: norm,
      allowlist: updatedList,
      ceremonyCompletedAt: now,
    };
  },
});

/** Revoke an MCP key. Verifies the caller is the original issuer (Privy DID).
 * Idempotent — re-calling on an already-revoked key returns the existing revocation time. */
export const revoke = internalMutation({
  args: {
    keyId: v.id("mcpApiKeys"),
    revokedByPrivySubject: v.string(),
  },
  handler: async (ctx, { keyId, revokedByPrivySubject }) => {
    const keyDoc = await ctx.db.get(keyId);
    if (!keyDoc) throw new Error("Key not found");
    if (keyDoc.issuedByPrivySubject !== revokedByPrivySubject) {
      throw new Error(
        "Not authorized: you did not issue this MCP key (only the original issuer can revoke it)"
      );
    }
    if (keyDoc.revokedAt != null) {
      return {
        ok: true as const,
        alreadyRevoked: true,
        revokedAt: keyDoc.revokedAt,
        deskManagerId: keyDoc.deskManagerId,
      };
    }
    const now = Date.now();
    await ctx.db.patch(keyId, { revokedAt: now });
    return {
      ok: true as const,
      alreadyRevoked: false,
      revokedAt: now,
      deskManagerId: keyDoc.deskManagerId,
    };
  },
});

/** Atomically rotate an MCP key — revoke the old hash and insert a new one bound to the
 * SAME deskManagerId. Hard cut: the old hash stops working immediately. Raw-key
 * generation happens in Next.js; Convex only ever sees the HMAC hashes. */
export const rotate = internalMutation({
  args: {
    keyId: v.id("mcpApiKeys"),
    newKeyHash: v.string(),
    rotatedByPrivySubject: v.string(),
  },
  handler: async (ctx, { keyId, newKeyHash, rotatedByPrivySubject }) => {
    const oldKey = await ctx.db.get(keyId);
    if (!oldKey) throw new Error("Key not found");
    if (oldKey.issuedByPrivySubject !== rotatedByPrivySubject) {
      throw new Error(
        "Not authorized: you did not issue this MCP key (only the original issuer can rotate it)"
      );
    }
    if (oldKey.revokedAt != null) {
      throw new Error(
        "Cannot rotate an already-revoked key. Issue a fresh key from the operator dialog instead."
      );
    }
    const now = Date.now();
    await ctx.db.patch(keyId, { revokedAt: now });
    const newKeyId = await ctx.db.insert("mcpApiKeys", {
      keyHash: newKeyHash,
      deskManagerId: oldKey.deskManagerId,
      issuedByPrivySubject: rotatedByPrivySubject,
      createdAt: now,
    });
    return {
      ok: true as const,
      newKeyId,
      deskManagerId: oldKey.deskManagerId,
    };
  },
});

/** Public (browser) wrapper: revoke one of my issued MCP keys. */
export const revokeMyKey = mutation({
  args: { keyId: v.id("mcpApiKeys") },
  handler: async (
    ctx: MutationCtx,
    { keyId }: { keyId: Id<"mcpApiKeys"> }
  ): Promise<RevokeKeyResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return (await ctx.runMutation(internal.mcpApiKeys.revoke, {
      keyId,
      revokedByPrivySubject: identity.subject,
    })) as RevokeKeyResult;
  },
});

/** Public (browser) wrapper: atomically rotate one of my issued MCP keys.
 * Raw key + hash are generated in the Next.js route; Convex only sees the hash. */
export const rotateMyKey = mutation({
  args: { keyId: v.id("mcpApiKeys"), newKeyHash: v.string() },
  handler: async (
    ctx: MutationCtx,
    { keyId, newKeyHash }: { keyId: Id<"mcpApiKeys">; newKeyHash: string }
  ): Promise<RotateKeyResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return (await ctx.runMutation(internal.mcpApiKeys.rotate, {
      keyId,
      newKeyHash,
      rotatedByPrivySubject: identity.subject,
    })) as RotateKeyResult;
  },
});

/** Public (browser) wrapper: list MCP desks issued by the currently authenticated Privy user. */
export const listMyIssuedMcpDesks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx: QueryCtx,
    { limit }: { limit?: number }
  ): Promise<MyIssuedMcpDesk[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return (await ctx.runQuery(internal.mcpApiKeys.listIssuedBy, {
      issuedBy: identity.subject,
      limit,
    })) as MyIssuedMcpDesk[];
  },
});

/** Public (browser) wrapper: confirm ceremony for one of my issued MCP desks. */
export const confirmMyWithdrawCeremony = mutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    address: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    {
      deskManagerId,
      address,
    }: { deskManagerId: Id<"deskManagers">; address: string }
  ): Promise<ConfirmWithdrawCeremonyResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return (await ctx.runMutation(internal.mcpApiKeys.confirmWithdrawCeremony, {
      deskManagerId,
      address,
      confirmedByPrivySubject: identity.subject,
    })) as ConfirmWithdrawCeremonyResult;
  },
});

/** List recent mcpRequests (audit) for one of the caller's issued MCP desks (operator debug). */
export const listRecentMcpRequestsForMyDesk = query({
  args: {
    deskManagerId: v.id("deskManagers"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx: QueryCtx,
    {
      deskManagerId,
      limit = 50,
    }: { deskManagerId: Id<"deskManagers">; limit?: number }
  ): Promise<McpRequestDebugRow[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Verify ownership via issued key
    const keys = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
    const owns = keys.some((k) => k.issuedByPrivySubject === identity.subject);
    if (!owns) return [];

    const rows = await ctx.db
      .query("mcpRequests")
      .withIndex("byDeskManagerAndCreatedAt", (q) =>
        q.eq("deskManagerId", deskManagerId)
      )
      .order("desc")
      .take(limit);

    return rows.map((r) => ({
      _id: r._id,
      tool: r.tool,
      idempotencyKey: r.idempotencyKey,
      result: r.result,
      error: r.error,
      txHash: r.txHash,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    }));
  },
});
