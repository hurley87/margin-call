import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import {
  CORNER_OFFICE_THRESHOLD_WEI,
  SEAT_THRESHOLD_WEI,
  SEAT_VAULT_V1,
  seatVaultEventDedupeKey,
} from "../../convex/seatVault/policy";
import { makeT, seedActiveTrader, seedDeskManager } from "./setup";

const VAULT_A = SEAT_VAULT_V1.address.toLowerCase();
const VAULT_B = "0x1111111111111111111111111111111111111111";
const STAKER = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";

describe("SeatVault Convex store", () => {
  it("dedupes duplicate event logs by vault:block:logIndex", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 42 });

    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT_A,
      version: 1,
    });

    const first = await t.mutation(internal.seatVault.store.insertEventIfNew, {
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      eventName: "Staked",
      onChainTraderId: 42,
      staker: STAKER,
      amountWei: SEAT_THRESHOLD_WEI,
      blockNumber: 100,
      logIndex: 1,
      txHash: "0xdead",
    });
    expect(first.inserted).toBe(true);
    expect(first.traderId).toBe(traderId);

    const second = await t.mutation(internal.seatVault.store.insertEventIfNew, {
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      eventName: "Staked",
      onChainTraderId: 42,
      staker: STAKER,
      amountWei: SEAT_THRESHOLD_WEI,
      blockNumber: 100,
      logIndex: 1,
      txHash: "0xdead",
    });
    expect(second.inserted).toBe(false);
    expect(second.eventId).toBe(first.eventId);

    const events = await t.run(async (ctx) =>
      ctx.db
        .query("seatVaultEvents")
        .withIndex("byDedupeKey", (q) =>
          q.eq("dedupeKey", seatVaultEventDedupeKey(VAULT_A, 100, 1))
        )
        .collect()
    );
    expect(events).toHaveLength(1);
  });

  it("backfills a missed event on a later block without duplicating prior rows", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    await seedActiveTrader(t, deskId, { tokenId: 7 });

    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT_A,
      version: 1,
    });

    await t.mutation(internal.seatVault.store.insertEventIfNew, {
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      eventName: "Staked",
      onChainTraderId: 7,
      staker: STAKER,
      amountWei: SEAT_THRESHOLD_WEI,
      blockNumber: 10,
      logIndex: 0,
      txHash: "0xaaa",
    });

    // Simulate restart: re-scan overlapping range then ingest the missed log.
    await t.mutation(internal.seatVault.store.insertEventIfNew, {
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      eventName: "Staked",
      onChainTraderId: 7,
      staker: STAKER,
      amountWei: SEAT_THRESHOLD_WEI,
      blockNumber: 10,
      logIndex: 0,
      txHash: "0xaaa",
    });
    const missed = await t.mutation(internal.seatVault.store.insertEventIfNew, {
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      eventName: "UnstakeInitiated",
      onChainTraderId: 7,
      staker: STAKER,
      amountWei: "1000000000000000000",
      unlockTime: 1_700_000_000,
      blockNumber: 11,
      logIndex: 2,
      txHash: "0xbbb",
    });
    expect(missed.inserted).toBe(true);

    const count = await t.run(async (ctx) => {
      const rows = await ctx.db.query("seatVaultEvents").collect();
      return rows.length;
    });
    expect(count).toBe(2);
  });

  it("publishes Gallery on depositor-change style tierOf result", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 9 });

    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT_A,
      version: 1,
    });

    await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId,
      onChainTraderId: 9,
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      isActiveVault: true,
      effectiveTier: "Seat",
      staker: STAKER,
      activeAmountWei: SEAT_THRESHOLD_WEI,
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "ok",
      syncError: null,
    });

    // Authoritative tierOf returns Gallery after depositor change.
    await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId,
      onChainTraderId: 9,
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      isActiveVault: true,
      effectiveTier: "Gallery",
      staker: STAKER,
      activeAmountWei: SEAT_THRESHOLD_WEI,
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "ok",
      syncError: null,
    });

    const state = await t.run(async (ctx) =>
      ctx.db
        .query("traderSeatState")
        .withIndex("byTraderAndVault", (q) =>
          q.eq("traderId", traderId).eq("vaultAddress", VAULT_A)
        )
        .unique()
    );
    expect(state?.effectiveTier).toBe("Gallery");
    expect(state?.activeAmountWei).toBe(SEAT_THRESHOLD_WEI);
    expect(state?.syncStatus).toBe("ok");
  });

  it("fail-closed: RPC error publishes Gallery with sync error", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 3 });

    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT_A,
      version: 1,
    });

    await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId,
      onChainTraderId: 3,
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      isActiveVault: true,
      effectiveTier: "CornerOffice",
      staker: STAKER,
      activeAmountWei: CORNER_OFFICE_THRESHOLD_WEI,
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "ok",
      syncError: null,
    });

    await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId,
      onChainTraderId: 3,
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      isActiveVault: true,
      effectiveTier: "CornerOffice", // would-be benefit — must be stripped
      staker: null,
      activeAmountWei: "0",
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "error",
      syncError: "RPC timeout",
    });

    const state = await t.run(async (ctx) =>
      ctx.db
        .query("traderSeatState")
        .withIndex("byTraderAndVault", (q) =>
          q.eq("traderId", traderId).eq("vaultAddress", VAULT_A)
        )
        .unique()
    );
    expect(state?.effectiveTier).toBe("Gallery");
    expect(state?.syncStatus).toBe("error");
    expect(state?.syncError).toBe("RPC timeout");
  });

  it("version switch strips capacity but preserves withdrawal metadata", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 55 });

    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT_A,
      version: 1,
    });

    await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId,
      onChainTraderId: 55,
      vaultAddress: VAULT_A,
      vaultVersion: 1,
      isActiveVault: true,
      effectiveTier: "CornerOffice",
      staker: STAKER,
      activeAmountWei: CORNER_OFFICE_THRESHOLD_WEI,
      pendingAmountWei: "5000000000000000000000",
      unlockTime: 1_800_000_000,
      syncStatus: "ok",
      syncError: null,
    });

    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT_B,
      version: 2,
      seatThresholdWei: SEAT_THRESHOLD_WEI,
      cornerOfficeThresholdWei: CORNER_OFFICE_THRESHOLD_WEI,
      unstakeCooldownSeconds: 86_400,
    });

    const oldState = await t.run(async (ctx) =>
      ctx.db
        .query("traderSeatState")
        .withIndex("byTraderAndVault", (q) =>
          q.eq("traderId", traderId).eq("vaultAddress", VAULT_A)
        )
        .unique()
    );
    expect(oldState?.isActiveVault).toBe(false);
    expect(oldState?.effectiveTier).toBe("Gallery");
    expect(oldState?.activeAmountWei).toBe(CORNER_OFFICE_THRESHOLD_WEI);
    expect(oldState?.pendingAmountWei).toBe("5000000000000000000000");
    expect(oldState?.unlockTime).toBe(1_800_000_000);
    expect(oldState?.staker).toBe(STAKER);

    const deployments = await t.query(
      internal.seatVault.store.listDeploymentsInternal,
      {}
    );
    expect(deployments).toHaveLength(2);
    expect(deployments.find((d) => d.address === VAULT_A)?.isActive).toBe(
      false
    );
    expect(deployments.find((d) => d.address === VAULT_B)?.isActive).toBe(true);
  });

  it("surfaces sync cursor error state without wiping lastProcessedBlock", async () => {
    const t = makeT();
    await t.mutation(internal.seatVault.store.upsertCursor, {
      vaultAddress: VAULT_A,
      lastProcessedBlock: 500,
      syncStatus: "ok",
      lastError: null,
      confirmationDepth: 8,
    });

    await t.mutation(internal.seatVault.store.upsertCursor, {
      vaultAddress: VAULT_A,
      lastProcessedBlock: 500,
      syncStatus: "error",
      lastError: "invalid RPC URL",
    });

    const cursor = await t.query(internal.seatVault.store.getCursorInternal, {
      vaultAddress: VAULT_A,
    });
    expect(cursor?.lastProcessedBlock).toBe(500);
    expect(cursor?.syncStatus).toBe("error");
    expect(cursor?.lastError).toBe("invalid RPC URL");
  });
});
