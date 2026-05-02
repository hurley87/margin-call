"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { CYCLE_LEASE_TTL_MS } from "./internal";
import { APPROVAL_EXPIRY_MS } from "./_constants";
import { selectDeal } from "./dealSelection";
import { resolveOutcome } from "./outcomeResolver";
import type { Mandate } from "./_types";

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
        const [pendingApproval, approvedApproval] = await Promise.all([
          ctx.runQuery(internal.dealApprovals.findPendingByTraderAndDeal, {
            traderId,
            dealId: dealId as never,
          }),
          ctx.runQuery(internal.dealApprovals.findApprovedByTraderAndDeal, {
            traderId,
            dealId: dealId as never,
          }),
        ]);

        if (approvedApproval) {
          await ctx.runMutation(internal.dealApprovals.consume, {
            approvalId: approvedApproval._id,
          });
          await ctx.runMutation(internal.agentActivityLog.append, {
            traderId,
            activityType: "approved",
            message: "Consumed desk manager approval and entering deal",
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
      await ctx.runMutation(internal.agentActivityLog.append, {
        traderId,
        activityType: "enter",
        message: `Entering deal: "${bestDeal.prompt.slice(0, 80)}${bestDeal.prompt.length > 80 ? "..." : ""}" (entry: $${bestDeal.entry_cost_usdc}, pot: $${bestDeal.pot_usdc})`,
        dealId: dealId as never,
        correlationId,
      });

      // NOTE (#87): x402 on-chain deal-entry HTTP call goes here.
      // For now we proceed directly to outcome resolution (simulated entry).

      // ── 7. Outcome resolution ──────────────────────────────────────────────
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

      // ── 8. Apply PnL to trader balance (single-writer, idempotent) ─────────
      await ctx.runMutation(internal.traders.applyOutcomeBalance, {
        traderId,
        pnlUsdc: traderPnlUsdc,
        wipedOut: traderWipedOut,
        outcomeId: outcomeId as never,
      });

      // ── 9. Log outcome ─────────────────────────────────────────────────────
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

      // ── 10. Mark complete (updates lastCycleAt, releases lease) ───────────
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
