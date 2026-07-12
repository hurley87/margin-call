import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { capacityForTier, type SeatTierName } from "./policy";
import {
  seatVaultDeploymentPublicValidator,
  seatVaultEventPublicValidator,
  seatVaultSyncCursorPublicValidator,
  traderSeatStatePublicValidator,
} from "./validators";
import { normalizeAddress } from "./config";

/** Map a persisted seat-state row to the public shape with tier capacity. */
function toPublicSeatState(
  row: Doc<"traderSeatState">,
  effectiveTier: SeatTierName
) {
  const capacity = capacityForTier(effectiveTier);
  return {
    traderId: row.traderId,
    onChainTraderId: row.onChainTraderId,
    vaultAddress: row.vaultAddress,
    vaultVersion: row.vaultVersion,
    isActiveVault: row.isActiveVault,
    effectiveTier,
    staker: row.staker ?? null,
    activeAmountWei: row.activeAmountWei,
    pendingAmountWei: row.pendingAmountWei,
    unlockTime: row.unlockTime,
    syncStatus: row.syncStatus,
    syncError: row.syncError ?? null,
    lastReconciledAt: row.lastReconciledAt ?? null,
    cycleIntervalMs: capacity.cycleIntervalMs,
    maxUnresolvedEntries: capacity.maxUnresolvedEntries,
  };
}

/**
 * Private stake details for a trader the caller owns.
 * Returns Gallery + sync error surface when no state / sync failed (fail closed).
 */
export const getTraderSeatState = query({
  args: { traderId: v.id("traders") },
  returns: v.union(traderSeatStatePublicValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const trader = await ctx.db.get(args.traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      return null;
    }

    const activeDeployment = await ctx.db
      .query("seatVaultDeployments")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .first();

    const activeState = activeDeployment
      ? await ctx.db
          .query("traderSeatState")
          .withIndex("byTraderAndVault", (q) =>
            q
              .eq("traderId", args.traderId)
              .eq("vaultAddress", activeDeployment.address)
          )
          .unique()
      : null;

    if (activeState) {
      return toPublicSeatState(activeState, activeState.effectiveTier);
    }

    // No row yet — fail closed to Gallery for UI badges.
    if (!trader.tokenId) return null;
    const capacity = capacityForTier("Gallery");
    return {
      traderId: args.traderId,
      onChainTraderId: trader.tokenId,
      vaultAddress: activeDeployment?.address ?? "",
      vaultVersion: activeDeployment?.version ?? 0,
      isActiveVault: true,
      effectiveTier: "Gallery" as const,
      staker: null,
      activeAmountWei: "0",
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "syncing" as const,
      syncError: null,
      lastReconciledAt: null,
      cycleIntervalMs: capacity.cycleIntervalMs,
      maxUnresolvedEntries: capacity.maxUnresolvedEntries,
    };
  },
});

/**
 * Withdrawal metadata across all vault versions for a trader the caller owns.
 * Inactive vaults never grant capacity (effectiveTier forced Gallery).
 */
export const listTraderVaultWithdrawals = query({
  args: { traderId: v.id("traders") },
  returns: v.array(traderSeatStatePublicValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const trader = await ctx.db.get(args.traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      return [];
    }

    const rows = await ctx.db
      .query("traderSeatState")
      .withIndex("byTrader", (q) => q.eq("traderId", args.traderId))
      .collect();

    return rows.map((row) =>
      toPublicSeatState(row, row.isActiveVault ? row.effectiveTier : "Gallery")
    );
  },
});

/** Public badge feed: active-vault effective tier only (no private amounts). */
export const getPublicTraderTier = query({
  args: { traderId: v.id("traders") },
  returns: v.union(
    v.object({
      traderId: v.id("traders"),
      effectiveTier: v.union(
        v.literal("Gallery"),
        v.literal("Seat"),
        v.literal("CornerOffice")
      ),
      syncStatus: v.union(
        v.literal("ok"),
        v.literal("syncing"),
        v.literal("error")
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const trader = await ctx.db.get(args.traderId);
    if (!trader) return null;

    const active = await ctx.db
      .query("traderSeatState")
      .withIndex("byTrader", (q) => q.eq("traderId", args.traderId))
      .collect();

    const activeRow = active.find((r) => r.isActiveVault);
    if (!activeRow) {
      return {
        traderId: args.traderId,
        effectiveTier: "Gallery" as const,
        syncStatus: "syncing" as const,
      };
    }

    return {
      traderId: args.traderId,
      effectiveTier:
        activeRow.syncStatus === "ok" ? activeRow.effectiveTier : "Gallery",
      syncStatus: activeRow.syncStatus,
    };
  },
});

export const listDeployments = query({
  args: {},
  returns: v.array(seatVaultDeploymentPublicValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("seatVaultDeployments").collect();
    return rows
      .map((row) => ({
        version: row.version,
        address: row.address,
        isActive: row.isActive,
        seatThresholdWei: row.seatThresholdWei,
        cornerOfficeThresholdWei: row.cornerOfficeThresholdWei,
        unstakeCooldownSeconds: row.unstakeCooldownSeconds,
        margincallToken: row.margincallToken,
        escrow: row.escrow,
        deployedAt: row.deployedAt,
      }))
      .sort((a, b) => a.version - b.version);
  },
});

export const getSyncStatus = query({
  args: { vaultAddress: v.optional(v.string()) },
  returns: v.union(seatVaultSyncCursorPublicValidator, v.null()),
  handler: async (ctx, args) => {
    let address = args.vaultAddress
      ? normalizeAddress(args.vaultAddress)
      : null;
    if (!address) {
      const active = await ctx.db
        .query("seatVaultDeployments")
        .withIndex("byIsActive", (q) => q.eq("isActive", true))
        .first();
      address = active?.address ?? null;
    }
    if (!address) return null;

    const row = await ctx.db
      .query("seatVaultSyncCursors")
      .withIndex("byVaultAddress", (q) => q.eq("vaultAddress", address))
      .unique();
    if (!row) return null;

    return {
      vaultAddress: row.vaultAddress,
      lastProcessedBlock: row.lastProcessedBlock,
      confirmationDepth: row.confirmationDepth,
      syncStatus: row.syncStatus,
      lastError: row.lastError ?? null,
      updatedAt: row.updatedAt,
    };
  },
});

export const listRecentEventsForTrader = query({
  args: {
    traderId: v.id("traders"),
    limit: v.optional(v.number()),
  },
  returns: v.array(seatVaultEventPublicValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const trader = await ctx.db.get(args.traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      return [];
    }

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("seatVaultEvents")
      .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", args.traderId))
      .order("desc")
      .take(limit);

    return rows.map((row) => ({
      vaultAddress: row.vaultAddress,
      vaultVersion: row.vaultVersion,
      eventName: row.eventName,
      onChainTraderId: row.onChainTraderId,
      staker: row.staker,
      amountWei: row.amountWei,
      unlockTime: row.unlockTime,
      blockNumber: row.blockNumber,
      logIndex: row.logIndex,
      txHash: row.txHash,
      createdAt: row.createdAt,
    }));
  },
});
