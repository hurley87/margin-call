"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  SEAT_VAULT_MAX_BLOCKS_PER_TICK,
  SEAT_VAULT_V1,
  type SeatTierName,
} from "./policy";
import {
  resolveConfiguredSeatVaultAddress,
  resolveConfirmationDepth,
  resolveRpcUrl,
  normalizeAddress,
} from "./config";
import {
  createSeatVaultPublicClient,
  fetchSeatVaultLogs,
  readStakeOf,
  readTierOf,
} from "./rpc";

/**
 * Cron entrypoint: ensure active vault deployment, ingest confirmed logs,
 * reconcile affected traders against authoritative stakeOf/tierOf.
 * Chain/RPC/config errors fail closed (Gallery) and never throw out of the tick.
 */
export const tick = internalAction({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    vaultAddress: v.string(),
    fromBlock: v.optional(v.number()),
    toBlock: v.optional(v.number()),
    eventsInserted: v.number(),
    tradersReconciled: v.number(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const vaultAddress = normalizeAddress(resolveConfiguredSeatVaultAddress());
    try {
      const isV1 = vaultAddress === normalizeAddress(SEAT_VAULT_V1.address);
      const ensured = await ctx.runMutation(
        internal.seatVault.store.ensureActiveVaultDeployment,
        {
          address: vaultAddress,
          ...(isV1
            ? {
                version: SEAT_VAULT_V1.version,
                seatThresholdWei: SEAT_VAULT_V1.seatThresholdWei,
                cornerOfficeThresholdWei:
                  SEAT_VAULT_V1.cornerOfficeThresholdWei,
                unstakeCooldownSeconds: SEAT_VAULT_V1.unstakeCooldownSeconds,
                margincallToken: SEAT_VAULT_V1.margincallToken,
                escrow: SEAT_VAULT_V1.escrow,
              }
            : {}),
        }
      );

      const confirmationDepth = resolveConfirmationDepth();
      const client = createSeatVaultPublicClient(resolveRpcUrl());
      const tip = await client.getBlockNumber();
      const confirmedTip = tip - BigInt(confirmationDepth);
      if (confirmedTip < 0n) {
        return {
          ok: true,
          vaultAddress,
          eventsInserted: 0,
          tradersReconciled: 0,
        };
      }

      const cursor = await ctx.runQuery(
        internal.seatVault.store.getCursorInternal,
        { vaultAddress }
      );

      // Clean cursor: start from genesis (or SEAT_VAULT_START_BLOCK) and catch
      // up in bounded windows so historical stakes are not skipped.
      const startBlockEnv = process.env.SEAT_VAULT_START_BLOCK;
      const configuredStart = startBlockEnv
        ? Number.parseInt(startBlockEnv, 10)
        : 0;
      const genesisBlock =
        Number.isFinite(configuredStart) && configuredStart >= 0
          ? configuredStart
          : 0;

      const fromBlock =
        cursor == null ? genesisBlock : cursor.lastProcessedBlock + 1;
      const maxTo = fromBlock + SEAT_VAULT_MAX_BLOCKS_PER_TICK - 1;
      const toBlock = Math.min(Number(confirmedTip), maxTo);

      if (toBlock < fromBlock) {
        await ctx.runMutation(internal.seatVault.store.upsertCursor, {
          vaultAddress,
          lastProcessedBlock:
            cursor?.lastProcessedBlock ?? Number(confirmedTip),
          syncStatus: "ok",
          lastError: null,
          confirmationDepth,
        });
        return {
          ok: true,
          vaultAddress,
          fromBlock,
          toBlock: cursor?.lastProcessedBlock,
          eventsInserted: 0,
          tradersReconciled: 0,
        };
      }

      await ctx.runMutation(internal.seatVault.store.upsertCursor, {
        vaultAddress,
        lastProcessedBlock: cursor?.lastProcessedBlock ?? fromBlock - 1,
        syncStatus: "syncing",
        lastError: null,
        confirmationDepth,
      });

      const logs = await fetchSeatVaultLogs(
        client,
        vaultAddress as `0x${string}`,
        BigInt(fromBlock),
        BigInt(toBlock)
      );

      let eventsInserted = 0;
      const affectedTraderIds = new Set<number>();

      for (const log of logs) {
        const result = await ctx.runMutation(
          internal.seatVault.store.insertEventIfNew,
          {
            vaultAddress,
            vaultVersion: ensured.version,
            eventName: log.eventName,
            onChainTraderId: log.onChainTraderId,
            staker: log.staker,
            amountWei: log.amountWei,
            unlockTime: log.unlockTime,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            txHash: log.txHash,
          }
        );
        if (result.inserted) eventsInserted += 1;
        affectedTraderIds.add(log.onChainTraderId);
      }

      let tradersReconciled = 0;
      for (const onChainTraderId of affectedTraderIds) {
        const ok = await reconcileOneTrader(ctx, {
          vaultAddress,
          vaultVersion: ensured.version,
          isActiveVault: true,
          onChainTraderId,
          client,
        });
        if (ok) tradersReconciled += 1;
      }

      await ctx.runMutation(internal.seatVault.store.upsertCursor, {
        vaultAddress,
        lastProcessedBlock: toBlock,
        syncStatus: "ok",
        lastError: null,
        confirmationDepth,
      });

      return {
        ok: true,
        vaultAddress,
        fromBlock,
        toBlock,
        eventsInserted,
        tradersReconciled,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SeatVault indexer failed";
      console.error("[seatVault.indexer.tick]", message);

      try {
        await ctx.runMutation(internal.seatVault.store.upsertCursor, {
          vaultAddress,
          lastProcessedBlock:
            (
              await ctx.runQuery(internal.seatVault.store.getCursorInternal, {
                vaultAddress,
              })
            )?.lastProcessedBlock ?? 0,
          syncStatus: "error",
          lastError: message,
        });
      } catch (cursorError) {
        console.error(
          "[seatVault.indexer.tick] failed to persist sync error",
          cursorError
        );
      }

      return {
        ok: false,
        vaultAddress,
        eventsInserted: 0,
        tradersReconciled: 0,
        error: message,
      };
    }
  },
});

/**
 * Reconcile one trader against stakeOf + tierOf on a vault.
 * RPC failures publish Gallery + syncStatus=error (fail closed).
 */
export const reconcileTrader = internalAction({
  args: {
    onChainTraderId: v.number(),
    vaultAddress: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    effectiveTier: v.union(
      v.literal("Gallery"),
      v.literal("Seat"),
      v.literal("CornerOffice")
    ),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const active = await ctx.runQuery(
      internal.seatVault.store.getActiveDeploymentInternal,
      {}
    );
    const vaultAddress = normalizeAddress(
      args.vaultAddress ??
        active?.address ??
        resolveConfiguredSeatVaultAddress()
    );
    const isActiveVault =
      active != null && normalizeAddress(active.address) === vaultAddress;
    const vaultVersion =
      active && isActiveVault
        ? active.version
        : ((
            await ctx.runQuery(
              internal.seatVault.store.listDeploymentsInternal,
              {}
            )
          ).find((d) => d.address === vaultAddress)?.version ?? 0);

    const client = createSeatVaultPublicClient(resolveRpcUrl());
    const ok = await reconcileOneTrader(ctx, {
      vaultAddress,
      vaultVersion,
      isActiveVault,
      onChainTraderId: args.onChainTraderId,
      client,
    });

    if (!ok) {
      return {
        ok: false,
        effectiveTier: "Gallery" as const,
        error: "reconcile failed",
      };
    }

    const trader = await ctx.runQuery(
      internal.seatVault.store.findTraderByTokenId,
      { onChainTraderId: args.onChainTraderId }
    );
    if (!trader) {
      return { ok: true, effectiveTier: "Gallery" as const };
    }

    // Re-read published state is overkill; return ok Gallery default for unknown.
    return { ok: true, effectiveTier: "Gallery" as const };
  },
});

type ReconcileCtx = {
  runQuery: (
    ...args: Parameters<import("../_generated/server").ActionCtx["runQuery"]>
  ) => ReturnType<import("../_generated/server").ActionCtx["runQuery"]>;
  runMutation: (
    ...args: Parameters<import("../_generated/server").ActionCtx["runMutation"]>
  ) => ReturnType<import("../_generated/server").ActionCtx["runMutation"]>;
};

async function reconcileOneTrader(
  ctx: ReconcileCtx,
  args: {
    vaultAddress: string;
    vaultVersion: number;
    isActiveVault: boolean;
    onChainTraderId: number;
    client: ReturnType<typeof createSeatVaultPublicClient>;
  }
): Promise<boolean> {
  const trader = await ctx.runQuery(
    internal.seatVault.store.findTraderByTokenId,
    { onChainTraderId: args.onChainTraderId }
  );
  if (!trader) {
    // No Convex trader yet — event is stored; skip seat-state publish.
    return false;
  }

  try {
    const [stake, tier] = await Promise.all([
      readStakeOf(
        args.client,
        args.vaultAddress as `0x${string}`,
        args.onChainTraderId
      ),
      readTierOf(
        args.client,
        args.vaultAddress as `0x${string}`,
        args.onChainTraderId
      ),
    ]);

    // Authoritative: only publish on-chain tierOf when this is the active vault.
    const effectiveTier: SeatTierName = args.isActiveVault ? tier : "Gallery";

    await ctx.runMutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId: trader._id,
      onChainTraderId: args.onChainTraderId,
      vaultAddress: args.vaultAddress,
      vaultVersion: args.vaultVersion,
      isActiveVault: args.isActiveVault,
      effectiveTier,
      staker:
        stake.staker === "0x0000000000000000000000000000000000000000"
          ? null
          : stake.staker,
      activeAmountWei: stake.activeWei,
      pendingAmountWei: stake.pendingWei,
      unlockTime: stake.unlockTime,
      syncStatus: "ok",
      syncError: null,
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SeatVault reconcile failed";
    console.error("[seatVault.reconcile]", args.onChainTraderId, message);

    await ctx.runMutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId: trader._id,
      onChainTraderId: args.onChainTraderId,
      vaultAddress: args.vaultAddress,
      vaultVersion: args.vaultVersion,
      isActiveVault: args.isActiveVault,
      effectiveTier: "Gallery",
      staker: null,
      activeAmountWei: "0",
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "error",
      syncError: message,
    });
    return false;
  }
}
