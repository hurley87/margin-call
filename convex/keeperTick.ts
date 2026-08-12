"use node";

import {
  KEEPER_ROUND_STATUS,
  missingCredentialsAlert,
  planKeeperTick,
  type KeeperAction,
  type KeeperAlert,
  type KeeperRoundSnapshot,
  type KeeperSnapshot,
  type KeeperVaultSnapshot,
} from "@margin-call/shared/crash-keeper";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Defaults from contracts/deployments/base_sepolia.json — override via Convex env. */
const DEFAULT_GAME =
  "0xD74a89e199da9E45399ec913441b25A1b4120d44" as const satisfies Address;
const DEFAULT_VAULT =
  "0xc3d6ffa7eE1635F94bd545e05c9aCFabB01A4c21" as const satisfies Address;
const DEFAULT_INCO =
  "0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624" as const satisfies Address;

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
  const value = process.env[name];
  if (!value) return fallback;
  return value as Address;
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
  let normalized: Hex;
  try {
    normalized = (
      privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    ) as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      return { ok: false, detail: "KEEPER_PRIVATE_KEY format" };
    }
  } catch {
    return { ok: false, detail: "KEEPER_PRIVATE_KEY format" };
  }

  return {
    ok: true,
    privateKey: normalized,
    rpcUrl,
    game: envAddress("MARGIN_CALL_CRASH_ADDRESS", DEFAULT_GAME),
    vault: envAddress("BANKROLL_VAULT_ADDRESS", DEFAULT_VAULT),
    inco: envAddress("INCO_LIGHTNING_ADDRESS", DEFAULT_INCO),
  };
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

async function postWebhook(alerts: KeeperAlert[]): Promise<void> {
  const url = process.env.KEEPER_ALERT_WEBHOOK_URL;
  if (!url || alerts.length === 0) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "margin-call-keeper",
        alerts: alerts.map((alert) => ({
          ...alert,
          roundId: alert.roundId?.toString(),
        })),
      }),
    });
  } catch (error) {
    console.error("[keeper] webhook post failed", error);
  }
}

async function fetchAttestation(
  crashRandom: Hex
): Promise<{ plaintext: bigint; signatures: Hex[] }> {
  const base =
    process.env.KEEPER_ATTESTATION_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    throw new Error("KEEPER_ATTESTATION_URL (or NEXT_PUBLIC_APP_URL) unset");
  }
  const attempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
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
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Attestation request failed");
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
      const alert = missingCredentialsAlert(credentials.detail);
      await ctx.runMutation(internal.keeperAlerts.recordAlerts, {
        observedAt: startedAt,
        alerts: [
          {
            kind: alert.kind,
            severity: alert.severity,
            message: alert.message,
            fingerprint: alert.fingerprint,
          },
        ],
      });
      await ctx.runMutation(internal.keeperAlerts.recordRun, {
        startedAt,
        finishedAt: Date.now(),
        actionCount: 0,
        alertCount: 1,
        txHashes: [],
        skippedReason: `missing_credentials:${credentials.detail}`,
        sessionActive: false,
      });
      return {
        actionCount: 0,
        alertCount: 1,
        skippedReason: `missing_credentials:${credentials.detail}`,
      };
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

    const sendGameTx = async (
      functionName:
        "openRound" | "requestReveal" | "finalizeRound" | "expireRound",
      args: readonly unknown[],
      value = 0n
    ): Promise<Hex> => {
      const hash = await walletClient.sendTransaction({
        to: credentials.game,
        data: encodeFunctionData({
          abi: gameAbi,
          functionName,
          args: args as never,
        }),
        value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Keeper tx failed: ${hash}`);
      }
      return hash;
    };

    const currentRoundId = await publicClient.readContract({
      address: credentials.game,
      abi: gameAbi,
      functionName: "currentRoundId",
    });

    const block = await publicClient.getBlock({ blockTag: "latest" });
    const now = block.timestamp;

    const roundIds = new Set<bigint>();
    const startId =
      currentRoundId > WORK_LOOKBACK ? currentRoundId - WORK_LOOKBACK : 1n;
    for (let id = startId; id <= currentRoundId + 1n; id++) {
      roundIds.add(id);
    }

    const [
      grossAssets,
      freeLiquidity,
      shareOperationsFrozen,
      oldestBlockingRound,
      frozenRoundCount,
      keeperEthWei,
    ] = await Promise.all([
      publicClient.readContract({
        address: credentials.vault,
        abi: vaultAbi,
        functionName: "grossAssets",
      }),
      publicClient.readContract({
        address: credentials.vault,
        abi: vaultAbi,
        functionName: "freeLiquidity",
      }),
      publicClient.readContract({
        address: credentials.vault,
        abi: vaultAbi,
        functionName: "shareOperationsFrozen",
      }),
      publicClient.readContract({
        address: credentials.vault,
        abi: vaultAbi,
        functionName: "oldestBlockingRound",
      }),
      publicClient.readContract({
        address: credentials.vault,
        abi: vaultAbi,
        functionName: "frozenRoundCount",
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    let oldestBlockingExpiresAt: bigint | null = null;
    if (oldestBlockingRound !== NO_BLOCKING_ROUND) {
      roundIds.add(oldestBlockingRound);
      const blocking = await publicClient.readContract({
        address: credentials.vault,
        abi: vaultAbi,
        functionName: "getBlockingRound",
        args: [oldestBlockingRound],
      });
      if (blocking[0]) {
        oldestBlockingExpiresAt = BigInt(blocking[1]);
        let next = blocking[3];
        let guard = 0;
        while (next !== NO_BLOCKING_ROUND && guard < 32) {
          roundIds.add(next);
          const row = await publicClient.readContract({
            address: credentials.vault,
            abi: vaultAbi,
            functionName: "getBlockingRound",
            args: [next],
          });
          next = row[3];
          guard += 1;
        }
      }
    }

    const rounds: KeeperRoundSnapshot[] = [];
    const crashRandomByRound = new Map<bigint, Hex>();
    for (const id of [...roundIds].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    )) {
      try {
        const raw = await publicClient.readContract({
          address: credentials.game,
          abi: gameAbi,
          functionName: "getRound",
          args: [id],
        });
        rounds.push({
          id: raw.id,
          status: Number(raw.status) as KeeperRoundSnapshot["status"],
          openAt: BigInt(raw.openAt),
          lockAt: BigInt(raw.lockAt),
          expiresAt: BigInt(raw.expiresAt),
          totalMargin: raw.totalMargin,
        });
        crashRandomByRound.set(id, raw.crashRandom);
      } catch {
        rounds.push(stubRound(id));
      }
    }

    // Ensure current + next exist for pre-open planning.
    if (!rounds.some((r) => r.id === currentRoundId)) {
      rounds.push(stubRound(currentRoundId));
    }
    if (!rounds.some((r) => r.id === currentRoundId + 1n)) {
      rounds.push(stubRound(currentRoundId + 1n));
    }

    const vault: KeeperVaultSnapshot = {
      shareOperationsFrozen,
      oldestBlockingRound,
      frozenRoundCount,
      freeLiquidity,
      grossAssets,
      oldestBlockingExpiresAt,
    };

    const spendBudgetWei = process.env.KEEPER_PAYMASTER_SPEND_BUDGET_WEI;
    const sponsorshipSample = await ctx.runQuery(
      internal.keeperSponsorship.getSponsorshipWindowSample,
      {
        now: startedAt,
        spendBudgetWei: spendBudgetWei ?? undefined,
      }
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
        spendBudgetWei:
          sponsorshipSample.spendBudgetWei === null
            ? null
            : BigInt(sponsorshipSample.spendBudgetWei),
      },
    };

    const plan = planKeeperTick(snapshot);
    const txHashes: string[] = [];
    const attestationFailures: bigint[] = [];
    let incoFee: bigint | null = null;

    const execute = async (action: KeeperAction): Promise<void> => {
      try {
        switch (action.type) {
          case "expire": {
            const hash = await sendGameTx("expireRound", [action.roundId]);
            txHashes.push(hash);
            return;
          }
          case "requestReveal": {
            const hash = await sendGameTx("requestReveal", [action.roundId]);
            txHashes.push(hash);
            return;
          }
          case "finalize": {
            const crashRandom = crashRandomByRound.get(action.roundId);
            if (!crashRandom) {
              throw new Error(
                `Missing crashRandom for round ${action.roundId}`
              );
            }
            try {
              const attestation = await fetchAttestation(crashRandom);
              const hash = await sendGameTx("finalizeRound", [
                action.roundId,
                attestation.plaintext,
                attestation.signatures,
              ]);
              txHashes.push(hash);
            } catch (error) {
              attestationFailures.push(action.roundId);
              throw error;
            }
            return;
          }
          case "openRound": {
            if (incoFee === null) {
              incoFee = await publicClient.readContract({
                address: credentials.inco,
                abi: incoAbi,
                functionName: "getFee",
              });
            }
            const hash = await sendGameTx(
              "openRound",
              [action.roundId],
              incoFee
            );
            txHashes.push(hash);
            return;
          }
          default: {
            const _exhaustive: never = action;
            return _exhaustive;
          }
        }
      } catch (error) {
        if (isBenignRevert(error)) {
          console.error(
            `[keeper] benign revert on ${action.type} ${"roundId" in action ? action.roundId : ""}`,
            error
          );
          return;
        }
        console.error(
          `[keeper] action failed: ${action.type}`,
          error instanceof Error ? error.message : error
        );
      }
    };

    for (const action of plan.actions) {
      await execute(action);
    }

    const alerts: KeeperAlert[] = [...plan.alerts];
    if (attestationFailures.length > 0) {
      const retrySnapshot: KeeperSnapshot = {
        ...snapshot,
        attestationFailures,
      };
      alerts.push(
        ...planKeeperTick(retrySnapshot).alerts.filter(
          (alert) => alert.kind === "failed_attestation"
        )
      );
    }

    await postWebhook(alerts);

    await ctx.runMutation(internal.keeperAlerts.recordAlerts, {
      observedAt: Date.now(),
      alerts: alerts.map((alert) => ({
        kind: alert.kind,
        severity: alert.severity,
        message: alert.message,
        roundId: alert.roundId?.toString(),
        fingerprint: alert.fingerprint,
      })),
    });

    await ctx.runMutation(internal.keeperAlerts.recordRun, {
      startedAt,
      finishedAt: Date.now(),
      actionCount: plan.actions.length,
      alertCount: alerts.length,
      txHashes,
      sessionActive: plan.sessionActive,
    });

    return {
      actionCount: plan.actions.length,
      alertCount: alerts.length,
      skippedReason: null,
    };
  },
});
