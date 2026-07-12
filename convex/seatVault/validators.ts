import { v } from "convex/values";

/** Shared validators for SeatVault Convex tables / public APIs. */
export const seatTierValidator = v.union(
  v.literal("Gallery"),
  v.literal("Seat"),
  v.literal("CornerOffice")
);

export const seatVaultSyncStatusValidator = v.union(
  v.literal("ok"),
  v.literal("syncing"),
  v.literal("error")
);

export const seatVaultEventNameValidator = v.union(
  v.literal("Staked"),
  v.literal("UnstakeInitiated"),
  v.literal("Unstaked")
);

export const traderSeatStatePublicValidator = v.object({
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
  syncError: v.union(v.string(), v.null()),
  lastReconciledAt: v.union(v.number(), v.null()),
  cycleIntervalMs: v.number(),
  maxUnresolvedEntries: v.number(),
});

export const seatVaultSyncCursorPublicValidator = v.object({
  vaultAddress: v.string(),
  lastProcessedBlock: v.number(),
  confirmationDepth: v.number(),
  syncStatus: seatVaultSyncStatusValidator,
  lastError: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

export const seatVaultDeploymentPublicValidator = v.object({
  version: v.number(),
  address: v.string(),
  isActive: v.boolean(),
  seatThresholdWei: v.string(),
  cornerOfficeThresholdWei: v.string(),
  unstakeCooldownSeconds: v.number(),
  margincallToken: v.optional(v.string()),
  escrow: v.optional(v.string()),
  deployedAt: v.number(),
});

export const seatVaultEventPublicValidator = v.object({
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
  createdAt: v.number(),
});
