"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { CYCLE_LEASE_TTL_MS } from "./internal";
import { APPROVAL_EXPIRY_MS } from "./_constants";
import { selectDeal } from "./dealSelection";
import { resolveOutcome } from "./outcomeResolver";
import type { Mandate } from "./_types";

// ── x402 deal-entry helper ───────────────────────────────────────────────────

/**
 * Call the Next.js /api/deal/enter route with SIWA authentication.
 *
 * Design:
 *  - The Convex action calls Next.js over HTTP; Next.js owns the x402
 *    verification and the Convex recordVerifiedEntry write. The cycle never
 *    directly writes paid/verified/settled state to Convex.
 *  - SIWA signing: the cycle holds CDP env vars and can instantiate the CDP
 *    SDK to get the trader's accounts, sign the SIWA message, and pass the
 *    auth headers to /api/deal/enter — identical to the legacy Next.js cycle.
 *  - Idempotency: /api/deal/enter calls recordVerifiedEntry which is a CAS on
 *    paymentId (enterTxHash ?? noop:<traderId>:<dealId>). Duplicate callbacks
 *    from a retry or a crashed cycle return the existing record without error.
 *
 * @param traderId  Convex trader id string
 * @param tokenId   ERC-8004 token id (used as agent identity in SIWA)
 * @param dealId    Convex deal id string
 * @param baseUrl   NEXT_PUBLIC_APP_URL (e.g. https://app.example.com)
 * @returns         The parsed JSON response from /api/deal/enter
 */
async function callDealEnter(
  traderId: string,
  tokenId: number,
  dealId: string,
  baseUrl: string
): Promise<{
  outcome: {
    trader_pnl_usdc: number;
    rake_usdc: number;
    narrative: string;
    trader_wiped_out: boolean;
    wipeout_reason: string | null;
    payment_id: string;
  };
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

  // CONTRACTS_CHAIN_ID is only accessible from src/; read the env var directly.
  const chainId = Number(
    process.env.CONTRACTS_CHAIN_ID ??
      process.env.NEXT_PUBLIC_CHAIN_ID ??
      "84532" // Base Sepolia fallback
  );
  const identityRegistryAddress =
    process.env.IDENTITY_REGISTRY_ADDRESS ??
    "0x0000000000000000000000000000000000000000";

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
    const errBody = await enterRes
      .json()
      .catch(() => ({ error: "Unknown error" }));
    const err = new Error(
      `[cycle] /api/deal/enter failed: ${enterRes.status} – ${errBody.error ?? "unknown"}`
    );
    // Attach the HTTP status so callers can distinguish 409 (duplicate)
    (err as Error & { httpStatus: number }).httpStatus = enterRes.status;
    throw err;
  }

  return enterRes.json();
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
 *    (90 s). The next scheduler tick sees no active lease and enqueues a fresh
 *    cycle with an incremented generation.
 *
 * Overlapping ticks: if the cron fires while a cycle is in flight,
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
 * Scope (#86): deal selection + outcome resolution wired in.
 * Out of scope: x402 deal-entry HTTP call (#87).
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

    // Defensive guard: only run for active + ready traders
    if (trader.status !== "active" || trader.walletStatus !== "ready") {
      console.log(
        `[cycle] trader ${traderId} not eligible (status=${trader.status}, wallet=${trader.walletStatus}) — skipping`
      );
      return;
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

      // ── 4. Deal selection ──────────────────────────────────────────────────
      const mandate = (trader.mandate ?? {}) as Mandate;
      const selection = await selectDeal(ctx, {
        traderId: traderId as string,
        traderName: trader.name,
        deskManagerId: trader.deskManagerId as string,
        escrowBalanceUsdc: trader.escrowBalanceUsdc ?? 0,
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

      const bestDeal = selection.deal;
      // Map to Convex id type for downstream mutations
      const dealId = bestDeal.id as Parameters<
        typeof ctx.runMutation
      >[1] extends { dealId: infer T }
        ? T
        : never;

      // ── 5. Approval gate ───────────────────────────────────────────────────
      const threshold = mandate.approval_threshold_usdc;
      if (threshold !== undefined && bestDeal.entry_cost_usdc >= threshold) {
        // Check if there's an approved (consumed-ready) approval
        const existingApproval = await ctx.runQuery(
          internal.dealApprovals.findPendingByTraderAndDeal,
          { traderId, dealId: dealId as never }
        );

        if (!existingApproval || existingApproval.status !== "approved") {
          // Request approval if no pending approval exists
          if (!existingApproval) {
            await ctx.runMutation(internal.dealApprovals.request, {
              traderId,
              dealId: dealId as never,
              deskManagerId: trader.deskManagerId,
              entryCostUsdc: bestDeal.entry_cost_usdc,
              potUsdc: bestDeal.pot_usdc,
              expiresAt: Date.now() + APPROVAL_EXPIRY_MS,
            });
          }

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

        // Approval exists and is approved — consume it
        await ctx.runMutation(internal.dealApprovals.consume, {
          approvalId: existingApproval._id,
        });
        await ctx.runMutation(internal.agentActivityLog.append, {
          traderId,
          activityType: "approved",
          message: "Consumed desk manager approval and entering deal",
          dealId: dealId as never,
          metadata: { approval_id: existingApproval._id },
          correlationId,
        });
      }

      // ── 6. Log deal entry ──────────────────────────────────────────────────
      await ctx.runMutation(internal.agentActivityLog.append, {
        traderId,
        activityType: "enter",
        message: `Entering deal: "${bestDeal.prompt.slice(0, 80)}${bestDeal.prompt.length > 80 ? "..." : ""}" (entry: $${bestDeal.entry_cost_usdc}, pot: $${bestDeal.pot_usdc})`,
        dealId: dealId as never,
        correlationId,
      });

      // ── 7. x402 deal entry via Next.js HTTP boundary ──────────────────────
      // The cycle does NOT write paid/verified state directly to Convex.
      // It calls /api/deal/enter over HTTP; Next.js verifies the x402 payment
      // and then calls internal.deals.recordVerifiedEntry (single writer path).
      // Idempotency: recordVerifiedEntry is a CAS on paymentId, so duplicate
      // retries (e.g. after a cycle crash) are safe and return the existing id.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const traderTokenId = trader.tokenId;

      let entryPaymentId: string | undefined;

      if (traderTokenId !== undefined) {
        try {
          const entryResult = await callDealEnter(
            traderId as string,
            traderTokenId,
            bestDeal.id,
            appUrl
          );
          entryPaymentId = entryResult.outcome.payment_id;

          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "enter",
            message: `x402 deal entry complete (paymentId=${entryPaymentId}, pnl=$${entryResult.outcome.trader_pnl_usdc.toFixed(2)})`,
            dealId: dealId as never,
            metadata: { payment_id: entryPaymentId },
            correlationId,
          });
        } catch (enterErr) {
          const httpStatus = (enterErr as Error & { httpStatus?: number })
            .httpStatus;

          if (httpStatus === 409) {
            // Duplicate entry — deal already entered by this trader; skip cycle
            await ctx.runMutation(internal.agentActivityLog.append, {
              traderId,
              activityType: "skip",
              message: "Deal already entered (duplicate); skipping cycle",
              dealId: dealId as never,
              correlationId,
            });
            await ctx.runMutation(internal.agentActivityLog.append, {
              traderId,
              activityType: "cycle_end",
              message: "Cycle ended — duplicate deal entry prevented",
              correlationId,
            });
            await ctx.runMutation(internal.agent.internal.markCycleComplete, {
              traderId,
              generation,
              lastCycleAt: Date.now(),
            });
            return;
          }

          // Non-409 error: log and re-throw so the lease is released
          const msg =
            enterErr instanceof Error ? enterErr.message : String(enterErr);
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "error",
            message: `x402 deal entry failed: ${msg.slice(0, 500)}`,
            dealId: dealId as never,
            correlationId,
          });
          throw enterErr;
        }
      } else {
        // tokenId not set — wallet not fully ready; skip the on-chain step
        console.warn(
          `[cycle] trader ${traderId} has no tokenId — skipping x402 entry`
        );
      }

      // ── 8. Outcome resolution ──────────────────────────────────────────────
      // Check idempotency: if outcome already exists for (traderId, dealId), skip LLM
      const existingOutcome = await ctx.runQuery(
        internal.dealOutcomes.findByTraderAndDeal,
        { traderId: traderId as string, dealId: dealId as never }
      );

      let outcomeId: string;
      let traderPnlUsdc: number;
      let traderWipedOut: boolean;
      let narrative: string;

      if (existingOutcome) {
        // Outcome already recorded (e.g. from a previous crashed cycle) — reuse it
        outcomeId = existingOutcome._id as string;
        traderPnlUsdc = existingOutcome.traderPnlUsdc ?? 0;
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
          traderId: traderId as string,
          traderName: trader.name,
          escrowBalanceUsdc: trader.escrowBalanceUsdc ?? 0,
        });

        traderPnlUsdc = resolved.traderPnlUsdc;
        traderWipedOut = resolved.traderWipedOut;
        narrative =
          typeof resolved.narrative === "string"
            ? resolved.narrative
            : "Deal resolved.";

        // Persist outcome (idempotent CAS: returns existing id if already written)
        outcomeId = (await ctx.runMutation(internal.dealOutcomes.apply, {
          dealId: dealId as never,
          traderId: traderId as string,
          narrative: resolved.narrative,
          traderPnlUsdc: resolved.traderPnlUsdc,
          traderWipedOut: resolved.traderWipedOut,
          wipeoutReason: resolved.wipeoutReason ?? undefined,
          assetsGained: resolved.assetsGained,
          assetsLost: resolved.assetsLost,
        })) as string;
      }

      // ── 9. Apply PnL to trader balance (single-writer, idempotent) ─────────
      await ctx.runMutation(internal.traders.applyOutcomeBalance, {
        traderId,
        pnlUsdc: traderPnlUsdc,
        wipedOut: traderWipedOut,
        outcomeId: outcomeId as never,
      });

      // ── 10. Log outcome ────────────────────────────────────────────────────
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

      // ── 11. Mark complete (updates lastCycleAt, releases lease) ──────────
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
