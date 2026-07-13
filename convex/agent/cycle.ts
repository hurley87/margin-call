"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { CYCLE_LEASE_TTL_MS } from "./internal";
import {
  getTierOfReaderOverride,
  isCycleIntervalElapsed,
  resolveAuthoritativeCapacity,
  type AuthoritativeCapacity,
  type TierOfReader,
} from "./capacity";
import { APPROVAL_EXPIRY_MS } from "./_constants";
import { selectDeal } from "./dealSelection";
import { resolveOutcome, type ResolvedOutcome } from "./outcomeResolver";
import type { Deal, Mandate } from "./_types";
import {
  getTodayDateNY,
  getTodayOpenMs,
  getTradingHoursState,
  isTradingHours,
} from "../lib/tradingHours";
import { ESCROW_ADDRESS, escrowAbi } from "../mcp/escrowConstants";
import { createSeatVaultPublicClient, readTierOf } from "../seatVault/rpc";
const USDC_DECIMALS = 1_000_000;

async function defaultReadTierOf(
  vaultAddress: `0x${string}`,
  onChainTraderId: number
) {
  const client = createSeatVaultPublicClient();
  return readTierOf(client, vaultAddress, onChainTraderId);
}

function resolveTierReader(): TierOfReader {
  return getTierOfReaderOverride() ?? defaultReadTierOf;
}

async function loadAuthoritativeCapacity(
  ctx: ActionCtx,
  trader: { tokenId?: number | null }
): Promise<AuthoritativeCapacity> {
  const deployment = await ctx.runQuery(
    internal.seatVault.store.getActiveDeploymentInternal,
    {}
  );
  return resolveAuthoritativeCapacity({
    onChainTraderId: trader.tokenId,
    vaultAddress: deployment?.address ?? null,
    readTierOf: resolveTierReader(),
  });
}

async function logCapacityDiagnostic(
  ctx: ActionCtx,
  {
    traderId,
    capacity,
    correlationId,
  }: {
    traderId: Id<"traders">;
    capacity: AuthoritativeCapacity;
    correlationId?: string;
  }
) {
  if (capacity.source !== "fail_closed" || !capacity.diagnostic) return;
  console.warn(
    `[cycle] capacity fail-closed Gallery for ${traderId}: ${capacity.diagnostic}`
  );
  await ctx.runMutation(internal.agentActivityLog.append, {
    traderId,
    activityType: "capacity_diagnostic",
    message: `SeatVault tier read failed closed to Gallery: ${capacity.diagnostic}`,
    metadata: {
      diagnostic: capacity.diagnostic,
      tier: capacity.tier,
      source: capacity.source,
    },
    correlationId,
  });
}

function usdcToRaw(amountUsdc: number): bigint {
  return BigInt(Math.max(0, Math.round(amountUsdc * USDC_DECIMALS)));
}

import {
  classifySettleEntryRevert,
  reconciledTxHash,
  type OnChainResolveResult,
} from "./onChainSettlement";

async function finalizeOnChainOutcome(
  ctx: ActionCtx,
  {
    traderId,
    outcomeId,
    traderPnlUsdc,
    onChainTxHash,
    dealId,
    correlationId,
    logMessage,
  }: {
    traderId: Id<"traders">;
    outcomeId: Id<"dealOutcomes">;
    traderPnlUsdc: number;
    onChainTxHash: string;
    dealId?: Id<"deals">;
    correlationId?: string;
    logMessage?: string;
  }
) {
  await ctx.runMutation(internal.dealOutcomes.markOnChainResolved, {
    outcomeId,
    onChainTxHash,
  });
  await ctx.runMutation(internal.traders.applyOutcomeBalance, {
    traderId,
    pnlUsdc: traderPnlUsdc,
    outcomeId,
  });
  if (dealId && correlationId) {
    await ctx.runMutation(internal.agentActivityLog.append, {
      traderId,
      activityType: "resolve",
      message: logMessage ?? `On-chain outcome reconciled (${onChainTxHash})`,
      dealId,
      metadata: {
        outcome_id: outcomeId,
        resolve_tx_hash: onChainTxHash,
      },
      correlationId,
    });
  }
}

/**
 * Void an outcome that the chain has already settled in some other path.
 * Records the sentinel hash and stamps balanceAppliedAt so retries stop, but
 * does NOT mutate the trader balance — the next chain sync is the source of
 * truth for what actually happened on-chain.
 */
async function voidOnChainOutcome(
  ctx: ActionCtx,
  {
    traderId,
    outcomeId,
    onChainTxHash,
    dealId,
    correlationId,
    logMessage,
  }: {
    traderId: Id<"traders">;
    outcomeId: Id<"dealOutcomes">;
    onChainTxHash: string;
    dealId?: Id<"deals">;
    correlationId?: string;
    logMessage?: string;
  }
) {
  await ctx.runMutation(internal.dealOutcomes.voidOnChainOutcome, {
    outcomeId,
    onChainTxHash,
  });
  if (dealId && correlationId) {
    await ctx.runMutation(internal.agentActivityLog.append, {
      traderId,
      activityType: "resolve",
      message:
        logMessage ??
        `On-chain outcome voided (${onChainTxHash}) — no PnL applied`,
      dealId,
      metadata: {
        outcome_id: outcomeId,
        resolve_tx_hash: onChainTxHash,
      },
      correlationId,
    });
  }
}

export async function resolveOnChainEntry({
  onChainDealId,
  tokenId,
  entryCostUsdc,
  traderPnlUsdc,
  rakeUsdc,
}: {
  onChainDealId: number;
  tokenId: number;
  entryCostUsdc: number;
  traderPnlUsdc: number;
  rakeUsdc: number;
}): Promise<OnChainResolveResult> {
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!operatorKey) {
    throw new Error("OPERATOR_PRIVATE_KEY env var is not set");
  }

  const { createPublicClient, createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { CONTRACTS_CHAIN } = await import("../lib/baseSepoliaNetwork");
  const { requireBaseSepoliaRpcUrl } =
    await import("../lib/requireBaseSepoliaRpcUrl");

  const transport = http(requireBaseSepoliaRpcUrl());
  const account = privateKeyToAccount(operatorKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: CONTRACTS_CHAIN,
    transport,
  });
  const publicClient = createPublicClient({
    chain: CONTRACTS_CHAIN,
    transport,
  });

  // Gate on THIS trader's pending status, read first. The global
  // `pendingEntries` count is unsafe as a short-circuit: a lagging RPC replica
  // that hasn't yet indexed this trader's own `enterDeal` returns
  // `pendingEntries === 0`, which previously voided the outcome
  // (`reconciled:deal-settled`) and permanently stranded a genuinely-pending
  // entry on-chain — blocking the creator from ever closing the deal. We only
  // conclude "already resolved" when the contract says this specific trader has
  // no pending entry; the global count then just distinguishes the two reasons.
  const hasPending = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "hasPendingEntry",
    args: [BigInt(onChainDealId), BigInt(tokenId)],
  });
  if (!hasPending) {
    const onChainDeal = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getDeal",
      args: [BigInt(onChainDealId)],
    });
    return {
      status: "already_resolved",
      reason:
        onChainDeal.pendingEntries === BigInt(0)
          ? "deal_settled"
          : "no_trader_entry",
    };
  }

  const grossPayoutUsdc = Math.max(0, entryCostUsdc + traderPnlUsdc + rakeUsdc);
  try {
    const hash = await walletClient.writeContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "settleEntry",
      args: [
        BigInt(onChainDealId),
        BigInt(tokenId),
        usdcToRaw(grossPayoutUsdc),
        usdcToRaw(rakeUsdc),
      ],
      chain: CONTRACTS_CHAIN,
      account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { status: "resolved", txHash: receipt.transactionHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classified = classifySettleEntryRevert(message);
    if (classified) {
      return classified;
    }
    throw err;
  }
}

// ── x402 deal-entry helper ───────────────────────────────────────────────────

/**
 * Call the Next.js /api/deal/enter route with SIWA authentication
 * (`_agent_cycle: true`).
 *
 * Design:
 *  - Entry transport only: Next.js performs on-chain `enterDeal` (if applicable)
 *    and `recordVerifiedEntry`. It does **not** resolve outcomes for agent
 *    cycles (#86) — Convex `resolveOutcome` + `dealOutcomes.apply` own that.
 *  - Idempotency: replay-safe via Convex `dealEntries` + paymentId CAS.
 *
 * @param traderId  Convex trader id string
 * @param tokenId   ERC-8004 token id (used as agent identity in SIWA)
 * @param dealId    Convex deal id string
 * @param baseUrl   NEXT_PUBLIC_APP_URL (e.g. https://app.example.com)
 */
async function callDealEnter(
  traderId: string,
  tokenId: number,
  dealId: string,
  baseUrl: string
): Promise<{
  entry: { payment_id: string; already_entered: boolean };
  summary?: { enter_tx_hash: string | null; resolve_tx_hash: string | null };
}> {
  // ── 1. Get CDP accounts (matches `getOrCreateTraderSmartAccount` pattern) ─
  const { CdpClient } = await import("@coinbase/cdp-sdk");
  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
  });

  const owner = await cdp.evm.getOrCreateAccount({ name: `trader-${tokenId}` });
  const smartAccount = await cdp.evm.getOrCreateSmartAccount({
    name: `trader-sa-${tokenId}`,
    owner,
  });

  // ── 2. Fetch SIWA nonce for this agent identity ────────────────────────────
  const nonceRes = await fetch(`${baseUrl}/api/siwa/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: tokenId, address: smartAccount.address }),
  });

  if (!nonceRes.ok) {
    throw new Error(
      `[cycle] SIWA nonce fetch failed: ${nonceRes.status} ${await nonceRes.text()}`
    );
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  // ── 3. Sign SIWA message ───────────────────────────────────────────────────
  // Inline the signSIWAMessage call rather than importing from src/ (server-only).
  const { signSIWAMessage } = await import("@buildersgarden/siwa/siwa");
  const domain = baseUrl.replace(/^https?:\/\//, "");

  const { BASE_SEPOLIA_CHAIN_ID, IDENTITY_REGISTRY_ADDRESS } =
    await import("../lib/baseSepoliaNetwork");
  const { resolveAddress } = await import("../lib/resolveAddress");

  const chainId = BASE_SEPOLIA_CHAIN_ID;
  const identityRegistryAddress = resolveAddress(
    [process.env.IDENTITY_REGISTRY_ADDRESS],
    IDENTITY_REGISTRY_ADDRESS,
    "IDENTITY_REGISTRY_ADDRESS"
  );

  const signer = {
    getAddress: async () => smartAccount.address as `0x${string}`,
    signMessage: async (message: string) =>
      owner.signMessage({ message }) as Promise<`0x${string}`>,
  };

  const { message, signature } = await signSIWAMessage(
    {
      domain,
      uri: baseUrl,
      agentId: tokenId,
      agentRegistry: `eip155:${chainId}:${identityRegistryAddress}`,
      chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    },
    signer
  );

  // ── 4. POST /api/deal/enter with SIWA auth headers ─────────────────────────
  const enterRes = await fetch(`${baseUrl}/api/deal/enter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-siwa-message": Buffer.from(message).toString("base64"),
      "x-siwa-signature": signature,
    },
    body: JSON.stringify({
      deal_id: dealId,
      trader_id: traderId,
      _agent_cycle: true,
    }),
  });

  if (!enterRes.ok) {
    const errBody: unknown = await enterRes
      .json()
      .catch(() => ({ error: "Unknown error" }));
    const errorMessage =
      typeof errBody === "object" &&
      errBody !== null &&
      "error" in errBody &&
      typeof errBody.error === "string"
        ? errBody.error
        : "unknown";
    const err = new Error(
      `[cycle] /api/deal/enter failed: ${enterRes.status} – ${errorMessage}`
    );
    // Attach the HTTP status so callers can distinguish 409 (duplicate)
    (err as Error & { httpStatus: number }).httpStatus = enterRes.status;
    throw err;
  }

  const json = (await enterRes.json()) as {
    entry?: { payment_id: string; already_entered?: boolean };
    agent_cycle?: boolean;
    summary?: { enter_tx_hash: string | null; resolve_tx_hash: string | null };
  };
  const paymentId = json.entry?.payment_id;
  if (!paymentId) {
    throw new Error(
      `[cycle] /api/deal/enter missing entry.payment_id in response`
    );
  }
  return {
    entry: {
      payment_id: paymentId,
      already_entered: json.entry?.already_entered ?? false,
    },
    summary: json.summary,
  };
}

/**
 * Idempotent cycle action for a single trader agent.
 *
 * Idempotency strategy (lease-based CAS)
 * ----------------------------------------
 * 1. The scheduler reads cycleGeneration from listStaleTradersForCycle.
 * 2. Before any work this action calls acquireCycleLease with:
 *      expectedGeneration = trader.cycleGeneration ?? 0
 *      leaseUntil = now + CYCLE_LEASE_TTL_MS
 *    acquireCycleLease is an atomic Convex mutation: it only increments
 *    cycleGeneration and stamps cycleLeaseUntil if currentGeneration === expectedGeneration
 *    AND there is no active lease. If two concurrent invocations race, exactly
 *    one wins the CAS; the other receives { acquired: false } and exits cleanly.
 * 3. On success the action holds { acquired: true, generation: N }.
 * 4. On completion it calls markCycleComplete({ generation: N }) which updates
 *    lastCycleAt and clears the lease — but only if generation still equals N.
 *    This prevents a stale cycle from clobbering a recovery cycle's state.
 * 5. On crash / timeout the lease expires automatically after CYCLE_LEASE_TTL_MS
 *    (90 s). The next cron heartbeat sees no active lease and may enqueue a fresh
 *    cycle once the trader also satisfies their eligibility interval for lastCycleAt.
 *
 * Overlapping heartbeats: if the cron fires while a cycle is in flight,
 * listStaleTradersForCycle filters out traders with cycleLeaseUntil > now,
 * so the scheduler never even enqueues a second cycle. Belt-and-suspenders:
 * even if it did enqueue one (e.g. clock skew) the CAS would reject it.
 *
 * Outcome idempotency:
 *   - dealOutcomes.apply is a CAS on (traderId, dealId): duplicate = existing record.
 *   - traders.applyOutcomeBalance uses outcomeId as idempotency key.
 *   - Activity log uses dedupeKey = (traderId, dealId, eventType, correlationId).
 *   - Outcome resolution is keyed on (traderId, dealId), NOT generation, so a
 *     recovery cycle can finish stuck work without re-resolving.
 *
 * Scope (#86): deal selection + outcome resolution in Convex; HTTP entry is
 * transport-only (no legacy LLM outcome in `/api/deal/enter` for agent).
 */
export const cycle = internalAction({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const now = Date.now();
    // Stable correlation ID for this cycle run (for activity log dedupe)
    const correlationId = `${traderId}-${now}`;

    // ── 1. Load trader ────────────────────────────────────────────────────────
    const trader = await ctx.runQuery(
      internal.agent.internal.loadTraderForCycle,
      { traderId }
    );
    if (!trader) {
      console.warn(`[cycle] trader ${traderId} not found — skipping`);
      return;
    }

    // Defensive guard: only run for active, wallet-ready, funded traders.
    if (
      trader.status !== "active" ||
      trader.walletStatus !== "ready" ||
      (trader.escrowBalanceUsdc ?? 0) <= 0
    ) {
      console.log(
        `[cycle] trader ${traderId} not eligible (status=${trader.status}, wallet=${trader.walletStatus}, balance=${trader.escrowBalanceUsdc ?? 0}) — skipping`
      );
      return;
    }

    // ── 1b. Trading-hours pre-lease gate (spec §5.2 step 3) ──────────────────
    // If the market is closed, only proceed when there is paid-but-unresolved
    // recovery work; otherwise stamp lastCycleAt past the next-open boundary
    // so the scheduler's staleness gate keeps the trader idle until the bell
    // (spec §5.3 — recovery is always permitted). The post-lease re-query of
    // findPendingRecoveryEntry handles the race where another worker resolved
    // the orphan between this check and the lease grant.
    const marketOpen = isTradingHours(now);
    if (!marketOpen) {
      const recoveryEntry = await ctx.runQuery(
        internal.agent.internal.findPendingRecoveryEntry,
        { traderId }
      );
      if (!recoveryEntry) {
        // Stamp `lastCycleAt = nextOpenAt - intervalMs` so the trader becomes
        // stale exactly at the next open. Use authoritative tier cadence.
        // Falls back to `now` if the trading calendar can't resolve a next open.
        // Fail-closed diagnostics stay on console here so the silent skip
        // (no activity rows) contract from trading-hours tests is preserved.
        const capacity = await loadAuthoritativeCapacity(ctx, trader);
        if (capacity.source === "fail_closed" && capacity.diagnostic) {
          console.warn(
            `[cycle] capacity fail-closed Gallery for ${traderId}: ${capacity.diagnostic}`
          );
        }
        const state = getTradingHoursState(now);
        const lastCycleAt =
          state.nextOpenAt !== undefined
            ? state.nextOpenAt - capacity.cycleIntervalMs
            : now;
        await ctx.runMutation(internal.agent.internal.stampLastCycleAt, {
          traderId,
          lastCycleAt,
        });
        return;
      }
    }

    // ── 2. Acquire lease (CAS) ────────────────────────────────────────────────
    const expectedGeneration = trader.cycleGeneration ?? 0;
    const leaseResult = await ctx.runMutation(
      internal.agent.internal.acquireCycleLease,
      {
        traderId,
        expectedGeneration,
        leaseUntil: now + CYCLE_LEASE_TTL_MS,
      }
    );

    if (!leaseResult.acquired) {
      console.log(
        `[cycle] lease not acquired for ${traderId} (generation mismatch or active lease) — skipping`
      );
      return;
    }

    const { generation } = leaseResult;
    console.log(
      `[cycle] lease acquired for ${traderId} generation=${generation}`
    );

    try {
      // ── 3. Log cycle start ─────────────────────────────────────────────────
      await ctx.runMutation(internal.agentActivityLog.append, {
        traderId,
        activityType: "cycle_start",
        message: `Starting trade cycle (generation=${generation})`,
        correlationId,
      });

      // ── 3b. First-cycle-of-trading-day marker (spec §5.2 step 5, §8) ──────
      // Emit one `market_open` activity row per trader per ET trading day.
      // dedupeKey ensures concurrent recovery + lease retries can't double-emit.
      if (marketOpen) {
        const todayOpenMs = getTodayOpenMs(now);
        const lastCycleAt = trader.lastCycleAt;
        if (lastCycleAt === undefined || lastCycleAt < todayOpenMs) {
          const todayDateNY = getTodayDateNY(now);
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "market_open",
            message: "Cycle resumed at market open",
            eventId: `${traderId}-market_open-${todayDateNY}`,
          });
        }
      }

      // ── 3c. On-chain settlement retry ─────────────────────────────────────
      // If a prior cycle persisted an outcome but the contract reverted the
      // settleEntry call, retry only the on-chain step here. Skips both
      // selectDeal and the LLM — the outcome is already authoritative off-chain.
      if (trader.tokenId !== undefined && trader.tokenId !== null) {
        const pending = await ctx.runQuery(
          internal.dealOutcomes.findUnresolvedOnChain,
          { traderId, now }
        );
        if (
          pending &&
          pending.deal.onChainDealId !== null &&
          pending.deal.onChainDealId !== undefined
        ) {
          const retry = await resolveOnChainEntry({
            onChainDealId: pending.deal.onChainDealId,
            tokenId: trader.tokenId,
            entryCostUsdc: pending.deal.entryCostUsdc,
            traderPnlUsdc: pending.outcome.traderPnlUsdc ?? 0,
            rakeUsdc: pending.outcome.rakeUsdc ?? 0,
          });

          if (retry.status === "resolved") {
            await finalizeOnChainOutcome(ctx, {
              traderId,
              outcomeId: pending.outcome._id,
              traderPnlUsdc: pending.outcome.traderPnlUsdc ?? 0,
              onChainTxHash: retry.txHash,
              dealId: pending.outcome.dealId as never,
              correlationId,
              logMessage: `On-chain entry resolved on retry (tx=${retry.txHash})`,
            });
          } else if (retry.status === "already_resolved") {
            // Chain already settled (deal closed or no pending entry for this
            // trader). We can't trust the LLM-computed PnL because we don't
            // know whether the chain actually credited this trader — void the
            // outcome and let the next chain sync set the authoritative balance.
            await voidOnChainOutcome(ctx, {
              traderId,
              outcomeId: pending.outcome._id,
              onChainTxHash: reconciledTxHash(retry.reason),
              dealId: pending.outcome.dealId as never,
              correlationId,
              logMessage: `On-chain entry reconciled (${retry.reason}) — no PnL applied; chain sync is source of truth`,
            });
          }
        }

        const unapplied = await ctx.runQuery(
          internal.dealOutcomes.findUnappliedBalanceOutcome,
          { traderId, now }
        );
        if (unapplied) {
          await ctx.runMutation(internal.traders.applyOutcomeBalance, {
            traderId,
            pnlUsdc: unapplied.traderPnlUsdc ?? 0,
            outcomeId: unapplied._id,
          });
        }

        // Re-load trader: 3c may have flipped status to wiped_out via a real
        // loss outcome. Don't proceed to deal selection on a stale in-memory copy.
        const traderAfter3c = await ctx.runQuery(
          internal.agent.internal.loadTraderForCycle,
          { traderId }
        );
        if (!traderAfter3c || traderAfter3c.status !== "active") {
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          return;
        }
      }

      // ── 4. Deal selection (only when market is open) ───────────────────────
      const mandate = (trader.mandate ?? {}) as Mandate;

      // Read live on-chain balance so stale Convex cache never blocks trading.
      // Hoisted so after-hours recovery / outcome resolution can reuse it.
      let escrowBalanceUsdc = trader.escrowBalanceUsdc ?? 0;
      if (trader.tokenId !== undefined && trader.tokenId !== null) {
        try {
          const { getBaseSepoliaPublicClient } = await import("../mcp/deskByo");
          const publicClient = await getBaseSepoliaPublicClient();
          const raw = await publicClient.readContract({
            address: ESCROW_ADDRESS,
            abi: [
              {
                type: "function",
                name: "getBalance",
                inputs: [{ name: "traderId", type: "uint256" }],
                outputs: [{ name: "", type: "uint256" }],
                stateMutability: "view",
              },
            ] as const,
            functionName: "getBalance",
            args: [BigInt(trader.tokenId)],
          });
          escrowBalanceUsdc = Number(raw) / USDC_DECIMALS;
          if (escrowBalanceUsdc !== (trader.escrowBalanceUsdc ?? 0)) {
            await ctx.runMutation(internal.traders.syncEscrowBalance, {
              traderId,
              balanceUsdc: escrowBalanceUsdc,
            });
          }
        } catch (err) {
          console.warn(
            "[cycle] on-chain balance read failed, using cached value",
            err
          );
        }
      }

      // Deal targeted by this cycle iteration. Populated by selectDeal when
      // the market is open, or by the recovery probe when we're after-hours
      // resolving an orphaned paid entry (spec §5.3).
      let bestDeal: Deal | null = null;

      if (marketOpen) {
        // Capacity gate for NEW entries (approval bypass + cron share this path).
        // §3c recovery above is intentionally ungated. Cadence + unresolved-entry
        // caps always apply before selectDeal / enterDeal.
        const capacity = await loadAuthoritativeCapacity(ctx, trader);
        await logCapacityDiagnostic(ctx, {
          traderId,
          capacity,
          correlationId,
        });

        if (
          !isCycleIntervalElapsed(
            trader.lastCycleAt,
            now,
            capacity.cycleIntervalMs
          )
        ) {
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: `Cycle complete — cadence not elapsed for ${capacity.tier} (${capacity.cycleIntervalMs}ms)`,
            metadata: {
              tier: capacity.tier,
              cycle_interval_ms: capacity.cycleIntervalMs,
              source: capacity.source,
            },
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: trader.lastCycleAt ?? now,
          });
          return;
        }

        const unresolvedCount = await ctx.runQuery(
          internal.agent.capacity.countUnresolvedEntries,
          { traderId, now }
        );
        if (unresolvedCount >= capacity.maxUnresolvedEntries) {
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: `Cycle complete — unresolved entry cap reached (${unresolvedCount}/${capacity.maxUnresolvedEntries} for ${capacity.tier})`,
            metadata: {
              tier: capacity.tier,
              unresolved_count: unresolvedCount,
              max_unresolved_entries: capacity.maxUnresolvedEntries,
              source: capacity.source,
            },
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          return;
        }

        const selection = await selectDeal(ctx, {
          traderId,
          traderName: trader.name,
          deskManagerId: trader.deskManagerId as string,
          escrowBalanceUsdc,
          personality: trader.personality,
          mandate,
        });

        await ctx.runMutation(internal.agentActivityLog.append, {
          traderId,
          activityType: "evaluate",
          message: `Deal selection (${selection.method}): ${selection.reasoning.slice(0, 500)}`,
          metadata: { selection_method: selection.method },
          correlationId,
        });

        if (!selection.deal) {
          // No deal to enter — complete the cycle cleanly
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: "Cycle complete — no deal selected",
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          console.log(
            `[cycle] no deal selected for ${traderId} generation=${generation}`
          );
          return;
        }

        bestDeal = selection.deal;
      } else {
        // After-hours recovery (spec §5.3): the pre-lease gate already
        // observed an orphan. Re-query under the lease as the authoritative
        // check (another worker may have resolved it in the meantime), then
        // rebuild a minimal Deal payload so the outcome-resolution path below
        // can run without re-running selectDeal or callDealEnter.
        const recoveryEntry = await ctx.runQuery(
          internal.agent.internal.findPendingRecoveryEntry,
          { traderId }
        );
        if (!recoveryEntry) {
          // Race: recovery work disappeared between the probe and now. Stamp
          // and exit cleanly — the lease is released by markCycleComplete.
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: "Cycle complete — no recovery work after lease",
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          return;
        }

        const recoveryDeal = await ctx.runQuery(internal.deals.loadInternal, {
          dealId: recoveryEntry.dealId,
        });
        if (!recoveryDeal) {
          // Orphan entry references a deleted deal — nothing we can resolve.
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: "Cycle complete — recovery deal missing",
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          return;
        }

        bestDeal = {
          id: recoveryDeal._id as string,
          prompt: recoveryDeal.prompt,
          pot_usdc: recoveryDeal.potUsdc,
          entry_cost_usdc: recoveryDeal.entryCostUsdc,
          status: recoveryDeal.status,
          on_chain_deal_id: recoveryDeal.onChainDealId ?? null,
          creator_id: recoveryDeal.creatorDeskManagerId ?? null,
          creator_address: recoveryDeal.creatorAddress ?? null,
          entry_count: recoveryDeal.entryCount ?? 0,
          wipeout_count: recoveryDeal.wipeoutCount ?? 0,
        };
      }

      // Map to Convex id type for downstream mutations
      const dealId = bestDeal.id as Parameters<
        typeof ctx.runMutation
      >[1] extends { dealId: infer T }
        ? T
        : never;

      // ── 5. Approval gate (open-market only — recovery skips this) ──────────
      const threshold = mandate.approval_threshold_usdc;
      let approvalToConsume: Id<"dealApprovals"> | undefined;
      if (
        marketOpen &&
        threshold !== undefined &&
        bestDeal.entry_cost_usdc >= threshold
      ) {
        const [pendingApproval, approvedApproval] = await Promise.all([
          ctx.runQuery(internal.dealApprovals.findPendingByTraderAndDeal, {
            traderId,
            dealId: dealId as never,
            now,
          }),
          ctx.runQuery(internal.dealApprovals.findApprovedByTraderAndDeal, {
            traderId,
            dealId: dealId as never,
          }),
        ]);

        if (approvedApproval) {
          approvalToConsume = approvedApproval._id;
          // Defer consume until after verified entry (R4).
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "approved",
            message: "Desk manager approval on file — entering deal",
            dealId: dealId as never,
            metadata: { approval_id: approvedApproval._id },
            correlationId,
          });
        } else if (pendingApproval) {
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "approval_required",
            message: `Deal requires approval: entry $${bestDeal.entry_cost_usdc} >= threshold $${threshold} (pending)`,
            dealId: dealId as never,
            correlationId,
          });
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: "Cycle paused — awaiting desk manager approval",
            dealId: dealId as never,
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          console.log(
            `[cycle] awaiting approval for ${traderId} deal=${bestDeal.id}`
          );
          return;
        } else {
          await ctx.runMutation(internal.dealApprovals.request, {
            traderId,
            dealId: dealId as never,
            deskManagerId: trader.deskManagerId,
            entryCostUsdc: bestDeal.entry_cost_usdc,
            potUsdc: bestDeal.pot_usdc,
            expiresAt: Date.now() + APPROVAL_EXPIRY_MS,
          });

          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "approval_required",
            message: `Deal requires approval: entry $${bestDeal.entry_cost_usdc} >= threshold $${threshold}`,
            dealId: dealId as never,
            correlationId,
          });
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "cycle_end",
            message: "Cycle paused — awaiting desk manager approval",
            dealId: dealId as never,
            correlationId,
          });
          await ctx.runMutation(internal.agent.internal.markCycleComplete, {
            traderId,
            generation,
            lastCycleAt: Date.now(),
          });
          console.log(
            `[cycle] awaiting approval for ${traderId} deal=${bestDeal.id}`
          );
          return;
        }
      }

      // ── 6. Log deal entry ──────────────────────────────────────────────────
      const traderTokenId = trader.tokenId;
      let entryPaymentId: string | undefined;
      let marketClosedAtEntry = false;
      let entryVerified = !marketOpen;

      if (marketOpen) {
        await ctx.runMutation(internal.agentActivityLog.append, {
          traderId,
          activityType: "enter",
          message: `Entering deal: "${bestDeal.prompt.slice(0, 80)}${bestDeal.prompt.length > 80 ? "..." : ""}" (entry: $${bestDeal.entry_cost_usdc}, pot: $${bestDeal.pot_usdc})`,
          dealId: dealId as never,
          correlationId,
        });

        // ── 7. Deal entry via Next.js HTTP boundary (transport only, #86) ───
        // Next.js `handleAgentCycleDealEnter`: on-chain enterDeal + recordVerifiedEntry.
        // Outcome / PnL / narrative are applied below via Convex only.
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

        if (traderTokenId !== undefined) {
          try {
            const entryResult = await callDealEnter(
              traderId,
              traderTokenId,
              bestDeal.id,
              appUrl
            );
            entryPaymentId = entryResult.entry.payment_id;
            entryVerified = true;

            if (entryResult.entry.already_entered) {
              await ctx.runMutation(internal.agentActivityLog.append, {
                traderId,
                activityType: "enter",
                message: `Deal entry already recorded (paymentId=${entryPaymentId}); reconciling Convex outcome`,
                dealId: dealId as never,
                metadata: {
                  payment_id: entryPaymentId,
                  already_entered: true,
                },
                correlationId,
              });
            } else {
              await ctx.runMutation(internal.agentActivityLog.append, {
                traderId,
                activityType: "enter",
                message: `On-chain deal entry recorded (paymentId=${entryPaymentId}${entryResult.summary?.enter_tx_hash ? `, enterTx=${entryResult.summary.enter_tx_hash}` : ""}) — outcome resolves in Convex`,
                dealId: dealId as never,
                metadata: { payment_id: entryPaymentId },
                correlationId,
              });
            }
          } catch (enterErr) {
            const httpStatus = (enterErr as Error & { httpStatus?: number })
              .httpStatus;

            if (httpStatus === 409) {
              entryVerified = true;
              // Legacy duplicate response: still run Convex outcome reconciliation
              await ctx.runMutation(internal.agentActivityLog.append, {
                traderId,
                activityType: "enter",
                message:
                  "HTTP 409 duplicate deal entry — reconciling Convex outcome",
                dealId: dealId as never,
                correlationId,
              });
            } else if (httpStatus === 423) {
              // Market closed at the HTTP boundary (spec §7.3). Log a single
              // diagnostic line, do not append to activity log, exit the cycle
              // cleanly. Non-retryable for this invocation; the next heartbeat
              // at/after 09:30 will retry naturally.
              console.log("[cycle] /api/deal/enter rejected — market closed");
              marketClosedAtEntry = true;
            } else {
              // Non-409 / non-423 error: log and re-throw so the lease is released
              const msg =
                enterErr instanceof Error ? enterErr.message : String(enterErr);
              await ctx.runMutation(internal.agentActivityLog.append, {
                traderId,
                activityType: "error",
                message: `Deal entry HTTP failed: ${msg.slice(0, 500)}`,
                dealId: dealId as never,
                correlationId,
              });
              throw enterErr;
            }
          }
        } else {
          // tokenId not set — wallet not fully ready; skip the on-chain step
          console.warn(
            `[cycle] trader ${traderId} has no tokenId — skipping x402 entry`
          );
        }
      }

      // If /api/deal/enter rejected with 423 there is nothing to resolve this
      // cycle; release the lease and bail before invoking the LLM.
      if (marketClosedAtEntry) {
        await ctx.runMutation(internal.agent.internal.markCycleComplete, {
          traderId,
          generation,
          lastCycleAt: Date.now(),
        });
        return;
      }

      if (entryVerified && approvalToConsume) {
        await ctx.runMutation(internal.dealApprovals.consume, {
          approvalId: approvalToConsume,
        });
      }

      // ── 8. Outcome resolution ──────────────────────────────────────────────
      // Check idempotency: if outcome already exists for (traderId, dealId), skip LLM
      const existingOutcome = await ctx.runQuery(
        internal.dealOutcomes.findByTraderAndDeal,
        { traderId, dealId: dealId as never }
      );

      let outcomeId: string | null = null;
      let traderPnlUsdc: number;
      let rakeUsdc: number;
      let traderWipedOut: boolean;
      let narrative: string;
      let pendingOutcome: ResolvedOutcome | null = null;

      if (existingOutcome) {
        // Outcome already recorded (e.g. from a previous crashed cycle) — reuse it
        outcomeId = existingOutcome._id as string;
        traderPnlUsdc = existingOutcome.traderPnlUsdc ?? 0;
        rakeUsdc = existingOutcome.rakeUsdc ?? 0;
        traderWipedOut = existingOutcome.traderWipedOut ?? false;
        narrative =
          typeof existingOutcome.narrative === "string"
            ? existingOutcome.narrative
            : "Outcome already recorded.";
        console.log(
          `[cycle] reusing existing outcome ${outcomeId} for trader=${traderId} deal=${bestDeal.id}`
        );
      } else {
        // Resolve a fresh outcome via LLM
        const resolved = await resolveOutcome(ctx, {
          deal: bestDeal,
          traderId,
          traderName: trader.name,
          escrowBalanceUsdc,
          entryCostUsdc: bestDeal.entry_cost_usdc,
        });

        traderPnlUsdc = resolved.traderPnlUsdc;
        rakeUsdc = resolved.rakeUsdc;
        traderWipedOut = resolved.traderWipedOut;
        narrative =
          typeof resolved.narrative === "string"
            ? resolved.narrative
            : "Deal resolved.";

        pendingOutcome = resolved;
      }

      // ── 9. Persist outcome BEFORE on-chain settle ────────────────────────────
      // Apply order matters: we record the off-chain outcome first so that if
      // the contract reverts settleEntry, the next cycle's
      // `findUnresolvedOnChain` query picks it up and retries only the on-chain
      // step — without re-running the LLM.
      if (pendingOutcome) {
        outcomeId = (await ctx.runMutation(internal.dealOutcomes.apply, {
          dealId: dealId as never,
          traderId,
          narrative: pendingOutcome.narrative,
          traderPnlUsdc: pendingOutcome.traderPnlUsdc,
          potChangeUsdc: pendingOutcome.potChangeUsdc,
          rakeUsdc: pendingOutcome.rakeUsdc,
          traderWipedOut: pendingOutcome.traderWipedOut,
          wipeoutReason: pendingOutcome.wipeoutReason ?? undefined,
          assetsGained: pendingOutcome.assetsGained,
          assetsLost: pendingOutcome.assetsLost,
        })) as string;
      }

      // ── 10. Settle on-chain pending entry ──────────────────────────────────
      let resolveResult: OnChainResolveResult | null = null;
      if (
        bestDeal.on_chain_deal_id !== undefined &&
        bestDeal.on_chain_deal_id !== null &&
        traderTokenId !== undefined
      ) {
        resolveResult = await resolveOnChainEntry({
          onChainDealId: bestDeal.on_chain_deal_id,
          tokenId: traderTokenId,
          entryCostUsdc: bestDeal.entry_cost_usdc,
          traderPnlUsdc,
          rakeUsdc,
        });
      }

      if (resolveResult?.status === "resolved" && outcomeId !== null) {
        await ctx.runMutation(internal.dealOutcomes.markOnChainResolved, {
          outcomeId: outcomeId as never,
          onChainTxHash: resolveResult.txHash,
        });
      } else if (
        resolveResult?.status === "already_resolved" &&
        outcomeId !== null
      ) {
        // Void: stop retries AND skip applyOutcomeBalance below. The LLM PnL
        // cannot be trusted because we don't know how the chain settled it.
        await ctx.runMutation(internal.dealOutcomes.voidOnChainOutcome, {
          outcomeId: outcomeId as never,
          onChainTxHash: reconciledTxHash(resolveResult.reason),
        });
      }

      if (resolveResult !== null && outcomeId !== null) {
        const txHash =
          resolveResult.status === "resolved"
            ? resolveResult.txHash
            : resolveResult.status === "already_resolved"
              ? reconciledTxHash(resolveResult.reason)
              : null;
        await ctx.runMutation(internal.agentActivityLog.append, {
          traderId,
          activityType: "resolve",
          message:
            resolveResult.status === "resolved"
              ? `On-chain entry resolved (tx=${resolveResult.txHash})`
              : resolveResult.status === "already_resolved"
                ? `On-chain entry reconciled (${resolveResult.reason})`
                : "On-chain entry was already resolved",
          dealId: dealId as never,
          metadata: {
            outcome_id: outcomeId,
            resolve_tx_hash: txHash,
          },
          correlationId,
        });
      }

      // ── 10. Apply PnL to trader balance (single-writer, idempotent) ────────
      const balanceResult = await ctx.runMutation(
        internal.traders.applyOutcomeBalance,
        {
          traderId,
          pnlUsdc: traderPnlUsdc,
          outcomeId: outcomeId as never,
        }
      );
      if (balanceResult) {
        traderWipedOut = balanceResult.wipedOut;
      }

      // ── 11. Log outcome ────────────────────────────────────────────────────
      const activityType = traderWipedOut
        ? "wipeout"
        : traderPnlUsdc >= 0
          ? "win"
          : "loss";

      await ctx.runMutation(internal.agentActivityLog.append, {
        traderId,
        activityType,
        message: `Deal outcome: PnL $${traderPnlUsdc.toFixed(2)}${traderWipedOut ? " — WIPED OUT" : ""}. ${narrative.slice(0, 300)}`,
        dealId: dealId as never,
        metadata: {
          pnl: traderPnlUsdc,
          wiped_out: traderWipedOut,
          outcome_id: outcomeId,
        },
        correlationId,
      });

      // ── 12. Mark complete (updates lastCycleAt, releases lease) ──────────
      const cycleEndMessage = traderWipedOut
        ? "Trader wiped out — cycle ended"
        : "Cycle complete";

      await ctx.runMutation(internal.agentActivityLog.append, {
        traderId,
        activityType: "cycle_end",
        message: cycleEndMessage,
        dealId: dealId as never,
        correlationId,
      });

      await ctx.runMutation(internal.agent.internal.markCycleComplete, {
        traderId,
        generation,
        lastCycleAt: Date.now(),
      });

      console.log(
        `[cycle] completed for ${traderId} generation=${generation} pnl=${traderPnlUsdc.toFixed(2)} wipedOut=${traderWipedOut}`
      );
    } catch (err) {
      // Release lease so the next tick can retry after TTL.
      // LLM failures leave state valid: no partial-corrupt writes since all
      // mutations are independent idempotent operations.
      await ctx.runMutation(internal.agent.internal.releaseCycleLease, {
        traderId,
        generation,
      });

      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[cycle] error for ${traderId} generation=${generation}: ${message}`
      );

      // Best-effort: log the error to activity (non-fatal if this also fails)
      try {
        await ctx.runMutation(internal.agentActivityLog.append, {
          traderId,
          activityType: "cycle_error",
          message: `Cycle error (generation=${generation}): ${message.slice(0, 500)}`,
          metadata: { generation, error: message },
          correlationId,
        });
      } catch (logErr) {
        console.error("[cycle] failed to log error to activity log:", logErr);
      }

      throw err; // re-throw so Convex marks the action as failed
    }
  },
});
