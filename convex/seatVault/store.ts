import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  capacityForTiers,
  seatVaultEventDedupeKey,
  SEAT_VAULT_V1,
  type SeatTierName,
} from "./policy";
import {
  seatTierValidator,
  seatVaultEventNameValidator,
  seatVaultSyncStatusValidator,
} from "./validators";
import { normalizeAddress, resolveConfirmationDepth } from "./config";

async function getActiveDeployment(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"seatVaultDeployments"> | null> {
  return ctx.db
    .query("seatVaultDeployments")
    .withIndex("byIsActive", (q) => q.eq("isActive", true))
    .first();
}

export const getActiveDeploymentInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("seatVaultDeployments"),
      version: v.number(),
      address: v.string(),
      isActive: v.boolean(),
      seatThresholdWei: v.string(),
      cornerOfficeThresholdWei: v.string(),
      unstakeCooldownSeconds: v.number(),
      margincallToken: v.optional(v.string()),
      escrow: v.optional(v.string()),
      deployedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const row = await getActiveDeployment(ctx);
    if (!row) return null;
    return {
      _id: row._id,
      version: row.version,
      address: row.address,
      isActive: row.isActive,
      seatThresholdWei: row.seatThresholdWei,
      cornerOfficeThresholdWei: row.cornerOfficeThresholdWei,
      unstakeCooldownSeconds: row.unstakeCooldownSeconds,
      margincallToken: row.margincallToken,
      escrow: row.escrow,
      deployedAt: row.deployedAt,
    };
  },
});

export const listDeploymentsInternal = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("seatVaultDeployments"),
      version: v.number(),
      address: v.string(),
      isActive: v.boolean(),
      seatThresholdWei: v.string(),
      cornerOfficeThresholdWei: v.string(),
      unstakeCooldownSeconds: v.number(),
      deployedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("seatVaultDeployments").collect();
    return rows
      .map((row) => ({
        _id: row._id,
        version: row.version,
        address: row.address,
        isActive: row.isActive,
        seatThresholdWei: row.seatThresholdWei,
        cornerOfficeThresholdWei: row.cornerOfficeThresholdWei,
        unstakeCooldownSeconds: row.unstakeCooldownSeconds,
        deployedAt: row.deployedAt,
      }))
      .sort((a, b) => a.version - b.version);
  },
});

/**
 * Ensure the configured vault exists as a deployment row and is marked active.
 * Idempotent; does not wipe prior vault withdrawal metadata.
 */
export const ensureActiveVaultDeployment = internalMutation({
  args: {
    address: v.string(),
    version: v.optional(v.number()),
    seatThresholdWei: v.optional(v.string()),
    cornerOfficeThresholdWei: v.optional(v.string()),
    unstakeCooldownSeconds: v.optional(v.number()),
    margincallToken: v.optional(v.string()),
    escrow: v.optional(v.string()),
  },
  returns: v.object({
    deploymentId: v.id("seatVaultDeployments"),
    activated: v.boolean(),
    address: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    const address = normalizeAddress(args.address);
    const now = Date.now();
    const existing = await ctx.db
      .query("seatVaultDeployments")
      .withIndex("byAddress", (q) => q.eq("address", address))
      .unique();

    const version =
      args.version ?? existing?.version ?? (await nextVaultVersion(ctx));

    let deploymentId: Id<"seatVaultDeployments">;
    if (existing) {
      deploymentId = existing._id;
      await ctx.db.patch(existing._id, {
        version,
        seatThresholdWei: args.seatThresholdWei ?? existing.seatThresholdWei,
        cornerOfficeThresholdWei:
          args.cornerOfficeThresholdWei ?? existing.cornerOfficeThresholdWei,
        unstakeCooldownSeconds:
          args.unstakeCooldownSeconds ?? existing.unstakeCooldownSeconds,
        margincallToken: args.margincallToken ?? existing.margincallToken,
        escrow: args.escrow ?? existing.escrow,
        updatedAt: now,
      });
    } else {
      deploymentId = await ctx.db.insert("seatVaultDeployments", {
        version,
        address,
        isActive: false,
        seatThresholdWei:
          args.seatThresholdWei ?? SEAT_VAULT_V1.seatThresholdWei,
        cornerOfficeThresholdWei:
          args.cornerOfficeThresholdWei ??
          SEAT_VAULT_V1.cornerOfficeThresholdWei,
        unstakeCooldownSeconds:
          args.unstakeCooldownSeconds ?? SEAT_VAULT_V1.unstakeCooldownSeconds,
        margincallToken: args.margincallToken ?? SEAT_VAULT_V1.margincallToken,
        escrow: args.escrow ?? SEAT_VAULT_V1.escrow,
        deployedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const activated = await activateVaultInternal(ctx, deploymentId, now);
    return { deploymentId, activated, address, version };
  },
});

async function nextVaultVersion(ctx: MutationCtx): Promise<number> {
  const rows = await ctx.db.query("seatVaultDeployments").collect();
  if (rows.length === 0) return SEAT_VAULT_V1.version;
  return Math.max(...rows.map((r) => r.version)) + 1;
}

async function activateVaultInternal(
  ctx: MutationCtx,
  deploymentId: Id<"seatVaultDeployments">,
  now: number
): Promise<boolean> {
  const target = await ctx.db.get(deploymentId);
  if (!target) throw new Error("SeatVault deployment not found");

  if (target.isActive) return false;

  const previouslyActive = await ctx.db
    .query("seatVaultDeployments")
    .withIndex("byIsActive", (q) => q.eq("isActive", true))
    .collect();

  for (const row of previouslyActive) {
    if (row._id === deploymentId) continue;
    await ctx.db.patch(row._id, { isActive: false, updatedAt: now });
    await demoteCapacityForVault(ctx, row.address, now);
  }

  await ctx.db.patch(deploymentId, { isActive: true, updatedAt: now });
  await promoteActiveFlagForVault(ctx, target.address, target.version, now);
  return true;
}

/** Strip capacity from a former active vault; keep withdrawal fields. */
async function demoteCapacityForVault(
  ctx: MutationCtx,
  vaultAddress: string,
  now: number
): Promise<void> {
  const address = normalizeAddress(vaultAddress);
  const states = await ctx.db
    .query("traderSeatState")
    .withIndex("byVaultAddress", (q) => q.eq("vaultAddress", address))
    .collect();

  for (const state of states) {
    await ctx.db.patch(state._id, {
      isActiveVault: false,
      effectiveTier: "Gallery",
      updatedAt: now,
    });
  }
}

async function promoteActiveFlagForVault(
  ctx: MutationCtx,
  vaultAddress: string,
  vaultVersion: number,
  now: number
): Promise<void> {
  const address = normalizeAddress(vaultAddress);
  const states = await ctx.db
    .query("traderSeatState")
    .withIndex("byVaultAddress", (q) => q.eq("vaultAddress", address))
    .collect();

  for (const state of states) {
    await ctx.db.patch(state._id, {
      isActiveVault: true,
      vaultVersion,
      // Capacity stays Gallery until reconcile publishes authoritative tierOf.
      effectiveTier: "Gallery",
      syncStatus: "syncing",
      syncError: undefined,
      updatedAt: now,
    });
  }
}

export const activateVaultVersion = internalMutation({
  args: {
    address: v.string(),
  },
  returns: v.object({
    activated: v.boolean(),
    address: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    const address = normalizeAddress(args.address);
    const deployment = await ctx.db
      .query("seatVaultDeployments")
      .withIndex("byAddress", (q) => q.eq("address", address))
      .unique();
    if (!deployment) {
      throw new Error(`Unknown SeatVault deployment: ${address}`);
    }
    const activated = await activateVaultInternal(
      ctx,
      deployment._id,
      Date.now()
    );
    return {
      activated,
      address: deployment.address,
      version: deployment.version,
    };
  },
});

export const getCursorInternal = internalQuery({
  args: { vaultAddress: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("seatVaultSyncCursors"),
      vaultAddress: v.string(),
      lastProcessedBlock: v.number(),
      confirmationDepth: v.number(),
      syncStatus: seatVaultSyncStatusValidator,
      lastError: v.optional(v.string()),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const vaultAddress = normalizeAddress(args.vaultAddress);
    const row = await ctx.db
      .query("seatVaultSyncCursors")
      .withIndex("byVaultAddress", (q) => q.eq("vaultAddress", vaultAddress))
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      vaultAddress: row.vaultAddress,
      lastProcessedBlock: row.lastProcessedBlock,
      confirmationDepth: row.confirmationDepth,
      syncStatus: row.syncStatus,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    };
  },
});

export const upsertCursor = internalMutation({
  args: {
    vaultAddress: v.string(),
    lastProcessedBlock: v.number(),
    syncStatus: seatVaultSyncStatusValidator,
    lastError: v.optional(v.union(v.string(), v.null())),
    confirmationDepth: v.optional(v.number()),
  },
  returns: v.id("seatVaultSyncCursors"),
  handler: async (ctx, args) => {
    const vaultAddress = normalizeAddress(args.vaultAddress);
    const now = Date.now();
    const existing = await ctx.db
      .query("seatVaultSyncCursors")
      .withIndex("byVaultAddress", (q) => q.eq("vaultAddress", vaultAddress))
      .unique();

    const confirmationDepth =
      args.confirmationDepth ??
      existing?.confirmationDepth ??
      resolveConfirmationDepth();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastProcessedBlock: args.lastProcessedBlock,
        syncStatus: args.syncStatus,
        lastError:
          args.lastError === null ? undefined : (args.lastError ?? undefined),
        confirmationDepth,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("seatVaultSyncCursors", {
      vaultAddress,
      lastProcessedBlock: args.lastProcessedBlock,
      confirmationDepth,
      syncStatus: args.syncStatus,
      lastError:
        args.lastError === null ? undefined : (args.lastError ?? undefined),
      updatedAt: now,
      createdAt: now,
    });
  },
});

export const insertEventIfNew = internalMutation({
  args: {
    vaultAddress: v.string(),
    vaultVersion: v.number(),
    eventName: seatVaultEventNameValidator,
    onChainTraderId: v.number(),
    staker: v.string(),
    amountWei: v.string(),
    unlockTime: v.optional(v.number()),
    blockNumber: v.number(),
    logIndex: v.number(),
    txHash: v.string(),
  },
  returns: v.object({
    inserted: v.boolean(),
    eventId: v.union(v.id("seatVaultEvents"), v.null()),
    traderId: v.union(v.id("traders"), v.null()),
  }),
  handler: async (ctx, args) => {
    const vaultAddress = normalizeAddress(args.vaultAddress);
    const dedupeKey = seatVaultEventDedupeKey(
      vaultAddress,
      args.blockNumber,
      args.logIndex
    );

    const existing = await ctx.db
      .query("seatVaultEvents")
      .withIndex("byDedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (existing) {
      return {
        inserted: false,
        eventId: existing._id,
        traderId: existing.traderId ?? null,
      };
    }

    const trader = await ctx.db
      .query("traders")
      .withIndex("byTokenId", (q) => q.eq("tokenId", args.onChainTraderId))
      .first();

    const eventId = await ctx.db.insert("seatVaultEvents", {
      vaultAddress,
      vaultVersion: args.vaultVersion,
      eventName: args.eventName,
      onChainTraderId: args.onChainTraderId,
      traderId: trader?._id,
      staker: normalizeAddress(args.staker),
      amountWei: args.amountWei,
      unlockTime: args.unlockTime,
      blockNumber: args.blockNumber,
      logIndex: args.logIndex,
      txHash: args.txHash.toLowerCase(),
      dedupeKey,
      createdAt: Date.now(),
    });

    return {
      inserted: true,
      eventId,
      traderId: trader?._id ?? null,
    };
  },
});

export const findTraderByTokenId = internalQuery({
  args: { onChainTraderId: v.number() },
  returns: v.union(
    v.object({
      _id: v.id("traders"),
      ownerSubject: v.string(),
      tokenId: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const trader = await ctx.db
      .query("traders")
      .withIndex("byTokenId", (q) => q.eq("tokenId", args.onChainTraderId))
      .first();
    if (!trader) return null;
    return {
      _id: trader._id,
      ownerSubject: trader.ownerSubject,
      tokenId: trader.tokenId,
    };
  },
});

/**
 * Publish reconciled stake/tier. Failures must call with effectiveTier=Gallery
 * and syncStatus=error (fail closed — never grant capacity on RPC errors).
 */
export const publishReconciledSeatState = internalMutation({
  args: {
    traderId: v.id("traders"),
    onChainTraderId: v.number(),
    vaultAddress: v.string(),
    vaultVersion: v.number(),
    isActiveVault: v.boolean(),
    effectiveTier: seatTierValidator,
    staker: v.union(v.string(), v.null()),
    activeAmountWei: v.string(),
    pendingAmountWei: v.string(),
    unlockTime: v.number(),
    syncStatus: seatVaultSyncStatusValidator,
    syncError: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("traderSeatState"),
  handler: async (ctx, args) => {
    const vaultAddress = normalizeAddress(args.vaultAddress);
    const now = Date.now();

    // Only the active vault may publish non-Gallery capacity.
    const effectiveTier: SeatTierName =
      args.isActiveVault && args.syncStatus === "ok"
        ? args.effectiveTier
        : "Gallery";

    const existing = await ctx.db
      .query("traderSeatState")
      .withIndex("byTraderAndVault", (q) =>
        q.eq("traderId", args.traderId).eq("vaultAddress", vaultAddress)
      )
      .unique();

    const patch = {
      onChainTraderId: args.onChainTraderId,
      vaultVersion: args.vaultVersion,
      isActiveVault: args.isActiveVault,
      effectiveTier,
      staker: args.staker ?? undefined,
      activeAmountWei: args.activeAmountWei,
      pendingAmountWei: args.pendingAmountWei,
      unlockTime: args.unlockTime,
      syncStatus: args.syncStatus,
      syncError:
        args.syncError === null ? undefined : (args.syncError ?? undefined),
      lastReconciledAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("traderSeatState", {
      traderId: args.traderId,
      vaultAddress,
      createdAt: now,
      ...patch,
    });
  },
});

export const listSeatStatesForVault = internalQuery({
  args: { vaultAddress: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("traderSeatState"),
      traderId: v.id("traders"),
      onChainTraderId: v.number(),
      effectiveTier: seatTierValidator,
      activeAmountWei: v.string(),
      pendingAmountWei: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const vaultAddress = normalizeAddress(args.vaultAddress);
    const rows = await ctx.db
      .query("traderSeatState")
      .withIndex("byVaultAddress", (q) => q.eq("vaultAddress", vaultAddress))
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      traderId: row.traderId,
      onChainTraderId: row.onChainTraderId,
      effectiveTier: row.effectiveTier,
      activeAmountWei: row.activeAmountWei,
      pendingAmountWei: row.pendingAmountWei,
    }));
  },
});

/** Exported for unit tests — capacity mapping from published tier. */
export function capacitySnapshot(tier: SeatTierName) {
  return capacityForTiers(tier);
}
