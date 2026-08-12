"use node";

import {
  KEEPER_ROUND_STATUS,
  failedAttestationAlert,
  missingCredentialsAlert,
  planKeeperTick,
  type KeeperAction,
  type KeeperAlert,
  type KeeperRoundSnapshot,
  type KeeperRoundStatus,
  type KeeperSnapshot,
  type KeeperVaultSnapshot,
} from "@margin-call/shared/crash-keeper";
import { parseAddress } from "@margin-call/shared/address";
import { parsePrivateKey } from "@margin-call/shared/parse-private-key";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { v } from "convex/values";
import deployments from "../contracts/deployments/base_sepolia.json";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Defaults from the curated Base Sepolia record — override via Convex env. */
const DEFAULT_GAME = deployments.marginCallCrash as Address;
const DEFAULT_VAULT = deployments.bankrollVault as Address;
const DEFAULT_INCO = deployments.incoLightning as Address;

/** Scan this many prior epochs for overdue expiry / delayed reveal work. */
const WORK_LOOKBACK = 20n;

const NO_BLOCKING_ROUND =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

const gameAbi = parseAbi([
  "function currentRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function openRound(uint256 roundId) payable",
  "function requestReveal(uint256 roundId)",
  "function finalizeRound(uint256 roundId, uint256 plaintext, bytes[] signatures)",
  "function expireRound(uint256 roundId)",
]);

const vaultAbi = parseAbi([
  "function grossAssets() view returns (uint256)",
  "function freeLiquidity() view returns (uint256)",
  "function shareOperationsFrozen() view returns (bool)",
  "function oldestBlockingRound() view returns (uint256)",
  "function frozenRoundCount() view returns (uint256)",
  "function getBlockingRound(uint256 roundId) view returns (bool present, uint64 expiresAt, bool revealFrozen, uint256 nextRoundId)",
]);

const incoAbi = parseAbi(["function getFee() view returns (uint256)"]);

function envAddress(name: string, fallback: Address): Address {
  try {
    return parseAddress(process.env[name]) ?? fallback;
  } catch {
    throw new Error(`${name} format`);
  }
}

function readCredentials():
  | {
      ok: true;
      privateKey: Hex;
      rpcUrl: string;
      game: Address;
      vault: Address;
      inco: Address;
    }
  | { ok: false; detail: string } {
  const privateKey = process.env.KEEPER_PRIVATE_KEY;
  const rpcUrl =
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  if (!privateKey) {
    return { ok: false, detail: "KEEPER_PRIVATE_KEY" };
  }
  if (!rpcUrl) {
    return { ok: false, detail: "BASE_SEPOLIA_RPC_URL" };
  }
  try {
    return {
      ok: true,
      privateKey: parsePrivateKey(privateKey),
      rpcUrl,
      game: envAddress("MARGIN_CALL_CRASH_ADDRESS", DEFAULT_GAME),
      vault: envAddress("BANKROLL_VAULT_ADDRESS", DEFAULT_VAULT),
      inco: envAddress("INCO_LIGHTNING_ADDRESS", DEFAULT_INCO),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "invalid keeper env",
    };
  }
}

function stubRound(id: bigint): KeeperRoundSnapshot {
  return {
    id,
    status: KEEPER_ROUND_STATUS.uninitialized,
    openAt: 0n,
    lockAt: 0n,
    expiresAt: 0n,
    totalMargin: 0n,
  };
}

function toStoredAlert(alert: KeeperAlert) {
  return {
    kind: alert.kind,
    severity: alert.severity,
    message: alert.message,
    roundId: alert.roundId?.toString(),
    fingerprint: alert.fingerprint,
  };
}

async function postWebhook(alerts: KeeperAlert[]): Promise<void> {
  const url = process.env.KEEPER_ALERT_WEBHOOK_URL;
  if (!url || alerts.length === 0) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "margin-call-keeper",
        alerts: alerts.map(toStoredAlert),
      }),
    });
  } catch (error) {
    console.error("[keeper] webhook post failed", error);
  }
}

/** Single attempt per tick — the cron re-plans finalize from chain state 20s later. */
async function fetchAttestation(
  crashRandom: Hex
): Promise<{ plaintext: bigint; signatures: Hex[] }> {
  const base =
    process.env.KEEPER_ATTESTATION_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    throw new Error("KEEPER_ATTESTATION_URL (or NEXT_PUBLIC_APP_URL) unset");
  }
  const response = await fetch(
    new URL("/api/crash-attestation", base).toString(),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ crashRandom }),
    }
  );
  const body = (await response.json()) as {
    plaintext?: string;
    signatures?: Hex[];
    error?: string;
  };
  if (!response.ok || !body.plaintext || !body.signatures) {
    throw new Error(body.error ?? "Attestation request failed");
  }
  return {
    plaintext: BigInt(body.plaintext),
    signatures: body.signatures,
  };
}

function isBenignRevert(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /InvalidRoundStatus|RoundAlready|already|execution reverted/i.test(
    message
  );
}

export const run = internalAction({
  args: {},
  returns: v.object({
    actionCount: v.number(),
    alertCount: v.number(),
    skippedReason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const startedAt = Date.now();
    const credentials = readCredentials();
    if (!credentials.ok) {
      const skippedReason = `missing_credentials:${credentials.detail}`;
      const inserted = await ctx.runMutation(
        internal.keeperAlerts.recordAlerts,
        {
          observedAt: startedAt,
          alerts: [toStoredAlert(missingCredentialsAlert(credentials.detail))],
        }
      );
      // Only record a run when the alert was fresh — a permanently
      // unconfigured deployment must not grow keeperRuns every 20s.
      if (inserted > 0) {
        await ctx.runMutation(internal.keeperAlerts.recordRun, {
          startedAt,
          finishedAt: Date.now(),
          actionCount: 0,
          alertCount: 1,
          txHashes: [],
          skippedReason,
          sessionActive: false,
        });
      }
      return { actionCount: 0, alertCount: 1, skippedReason };
    }

    const account = privateKeyToAccount(credentials.privateKey);
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(credentials.rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(credentials.rpcUrl),
    });
    const game = getContract({
      address: credentials.game,
      abi: gameAbi,
      client: { public: publicClient, wallet: walletClient },
    });
    const vaultContract = getContract({
      address: credentials.vault,
      abi: vaultAbi,
      client: publicClient,
    });

    const confirmTx = async (hash: Hex): Promise<Hex> => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Keeper tx failed: ${hash}`);
      }
      return hash;
    };

    const [
      currentRoundId,
      block,
      grossAssets,
      freeLiquidity,
      shareOperationsFrozen,
      oldestBlockingRound,
      frozenRoundCount,
      keeperEthWei,
    ] = await Promise.all([
      game.read.currentRoundId(),
      publicClient.getBlock({ blockTag: "latest" }),
      vaultContract.read.grossAssets(),
      vaultContract.read.freeLiquidity(),
      vaultContract.read.shareOperationsFrozen(),
      vaultContract.read.oldestBlockingRound(),
      vaultContract.read.frozenRoundCount(),
      publicClient.getBalance({ address: account.address }),
    ]);
    const now = block.timestamp;

    // Current + next always present so pre-open planning sees them.
    const roundIds = new Set<bigint>([currentRoundId, currentRoundId + 1n]);
    const startId =
      currentRoundId > WORK_LOOKBACK ? currentRoundId - WORK_LOOKBACK : 1n;
    for (let id = startId; id <= currentRoundId; id++) {
      roundIds.add(id);
    }

    let oldestBlockingExpiresAt: bigint | null = null;
    if (oldestBlockingRound !== NO_BLOCKING_ROUND) {
      roundIds.add(oldestBlockingRound);
      const blocking = await vaultContract.read.getBlockingRound([
        oldestBlockingRound,
      ]);
      if (blocking[0]) {
        oldestBlockingExpiresAt = BigInt(blocking[1]);
        let next = blocking[3];
        let guard = 0;
        while (next !== NO_BLOCKING_ROUND && guard < 32) {
          roundIds.add(next);
          const row = await vaultContract.read.getBlockingRound([next]);
          next = row[3];
          guard += 1;
        }
      }
    }

    const sortedIds = [...roundIds].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    const roundReads = await Promise.all(
      sortedIds.map(async (id) => ({
        id,
        raw: await game.read.getRound([id]).catch(() => null),
      }))
    );

    const rounds: KeeperRoundSnapshot[] = [];
    const crashRandomByRound = new Map<bigint, Hex>();
    for (const { id, raw } of roundReads) {
      if (!raw) {
        rounds.push(stubRound(id));
        continue;
      }
      rounds.push({
        id: raw.id,
        status: Number(raw.status) as KeeperRoundStatus,
        openAt: BigInt(raw.openAt),
        lockAt: BigInt(raw.lockAt),
        expiresAt: BigInt(raw.expiresAt),
        totalMargin: raw.totalMargin,
      });
      crashRandomByRound.set(id, raw.crashRandom);
    }

    const vault: KeeperVaultSnapshot = {
      shareOperationsFrozen,
      oldestBlockingRound,
      frozenRoundCount,
      freeLiquidity,
      grossAssets,
      oldestBlockingExpiresAt,
    };

    const spendBudgetEnv = process.env.KEEPER_PAYMASTER_SPEND_BUDGET_WEI;
    let spendBudgetWei: bigint | null = null;
    if (spendBudgetEnv) {
      try {
        spendBudgetWei = BigInt(spendBudgetEnv);
      } catch {
        console.error(
          "[keeper] KEEPER_PAYMASTER_SPEND_BUDGET_WEI is not a wei integer; spend alerts disabled"
        );
      }
    }
    const sponsorshipSample = await ctx.runQuery(
      internal.keeperSponsorship.getSponsorshipWindowSample,
      { now: startedAt }
    );

    const snapshot: KeeperSnapshot = {
      now,
      currentRoundId,
      rounds,
      vault,
      keeperEthWei,
      preopenEnabled: process.env.KEEPER_PREOPEN_ENABLED === "true",
      sponsorship: {
        failuresInWindow: sponsorshipSample.failuresInWindow,
        spendWeiInWindow: BigInt(sponsorshipSample.spendWeiInWindow),
        spendBudgetWei,
      },
    };

    const plan = planKeeperTick(snapshot);
    const txHashes: string[] = [];
    const alerts: KeeperAlert[] = [...plan.alerts];
    let incoFee: bigint | null = null;

    const execute = async (action: KeeperAction): Promise<Hex | null> => {
      try {
        switch (action.type) {
          case "expire":
            return await confirmTx(
              await game.write.expireRound([action.roundId])
            );
          case "requestReveal":
            return await confirmTx(
              await game.write.requestReveal([action.roundId])
            );
          case "finalize": {
            const crashRandom = crashRandomByRound.get(action.roundId);
            if (!crashRandom) {
              throw new Error(
                `Missing crashRandom for round ${action.roundId}`
              );
            }
            let attestation;
            try {
              attestation = await fetchAttestation(crashRandom);
            } catch (error) {
              alerts.push(failedAttestationAlert(action.roundId));
              throw error;
            }
            return await confirmTx(
              await game.write.finalizeRound([
                action.roundId,
                attestation.plaintext,
                attestation.signatures,
              ])
            );
          }
          case "openRound": {
            incoFee ??= await publicClient.readContract({
              address: credentials.inco,
              abi: incoAbi,
              functionName: "getFee",
            });
            return await confirmTx(
              await game.write.openRound([action.roundId], { value: incoFee })
            );
          }
          default: {
            const _exhaustive: never = action;
            return _exhaustive;
          }
        }
      } catch (error) {
        if (isBenignRevert(error)) {
          console.error(
            `[keeper] benign revert on ${action.type} ${action.roundId}`,
            error
          );
        } else {
          console.error(
            `[keeper] action failed: ${action.type}`,
            error instanceof Error ? error.message : error
          );
        }
        return null;
      }
    };

    for (const action of plan.actions) {
      const hash = await execute(action);
      if (hash) txHashes.push(hash);
    }

    await postWebhook(alerts);

    const insertedAlerts =
      alerts.length === 0
        ? 0
        : await ctx.runMutation(internal.keeperAlerts.recordAlerts, {
            observedAt: Date.now(),
            alerts: alerts.map(toStoredAlert),
          });

    // Idle ticks (no actions, nothing newly alerted) leave no keeperRuns row —
    // a 20s cron would otherwise grow the table without bound.
    if (plan.actions.length > 0 || insertedAlerts > 0) {
      await ctx.runMutation(internal.keeperAlerts.recordRun, {
        startedAt,
        finishedAt: Date.now(),
        actionCount: plan.actions.length,
        alertCount: alerts.length,
        txHashes,
        sessionActive: plan.sessionActive,
      });
    }

    return {
      actionCount: plan.actions.length,
      alertCount: alerts.length,
      skippedReason: null,
    };
  },
});
