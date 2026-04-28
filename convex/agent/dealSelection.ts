"use node";

/**
 * Convex-native deal-selection adapter.
 *
 * Bridges the pure deal-selection logic with Convex internal queries.
 * The pure mandate-filter (evaluateDeals) is preserved unchanged.
 * LLM ranking uses the same GPT-5 mini structured output as src/lib/agent/deal-selection.ts.
 *
 * Pipeline:
 *   1. Load open deals from Convex
 *   2. Exclude deals already resolved by this trader
 *   3. Mandate filter (pure: evaluateDeals)
 *   4. Desk dedup (sibling traders on same desk, via Convex)
 *   5. LLM rank (GPT-4o-mini) → ratio fallback on error / disabled
 */

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { RunActionCtx } from "./_ctx";
import { internal } from "../_generated/api";
import { DESK_DEAL_DEDUP_HOURS } from "./_constants";
import type { Mandate, Deal } from "./_types";
import { evaluateDeals } from "./_evaluator";
import { DealEvaluationSchema, type DealEvaluation } from "./_schemas";

export type { Mandate, Deal };
export { evaluateDeals };

export type DealSelectionMethod = "llm" | "ratio" | "skip";

export interface DealSelectionResult {
  deal: Deal | null;
  reasoning: string;
  method: DealSelectionMethod;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDealLabel(deal: Deal): string {
  const normalized = deal.prompt.replace(/\s+/g, " ").trim();
  return normalized.length <= 72
    ? `"${normalized}"`
    : `"${normalized.slice(0, 69)}..."`;
}

function replaceDealIdsWithLabels(text: string, deals: Deal[]): string {
  return deals.reduce(
    (msg, d) => msg.replaceAll(d.id, formatDealLabel(d)),
    text
  );
}

function ratioFallback(eligible: Deal[]): DealSelectionResult {
  if (eligible.length === 0) {
    return { deal: null, reasoning: "No eligible deals", method: "skip" };
  }
  const best = eligible.reduce((a, b) =>
    b.pot_usdc / b.entry_cost_usdc > a.pot_usdc / a.entry_cost_usdc ? b : a
  );
  return {
    deal: best,
    reasoning: `Highest pot/entry ratio among mandate-eligible deals: ${formatDealLabel(best)}.`,
    method: "ratio",
  };
}

const DEAL_EVALUATION_SYSTEM = `You are the judgment layer for a 1980s Wall Street autonomous trader. The desk has already filtered deals by hard risk rules (mandate). Your job is to rank which ONE deal the trader should enter next, or refuse all.

You must:
- Only reference deal IDs that appear in the DEALS JSON array.
- Follow the trader PERSONALITY when weighing risk vs reward.
- Treat deal creator statistics as a trap signal: many wipeouts across their deals suggests hostile prompts.
- Use per-deal resolved outcome counts (wins/losses/wipeouts) as market feedback on that specific opportunity.
- The pot/entry ratio is one signal among many, not the only objective.

Output structured JSON: ranked_deal_ids (best first), skip_all (if true, enter nothing), and reasoning (concise, in-universe trader voice).`;

// ── Context types ─────────────────────────────────────────────────────────────

export interface SelectDealContext {
  traderId: string;
  traderName: string;
  deskManagerId: string;
  escrowBalanceUsdc: number;
  personality: string | null | undefined;
  mandate: Mandate;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Run the full deal-selection pipeline for a trader cycle.
 *
 * LLM calls happen in this action; all Convex reads are via runQuery.
 * No writes — the caller is responsible for persisting results.
 */
export async function selectDeal(
  ctx: RunActionCtx,
  selCtx: SelectDealContext
): Promise<DealSelectionResult> {
  const {
    traderId,
    traderName,
    deskManagerId,
    escrowBalanceUsdc,
    personality,
    mandate,
  } = selCtx;

  // ── 1. Load open deals ──────────────────────────────────────────────────────
  const rawDeals = await ctx.runQuery(internal.deals.listOpenInternal, {});

  if (rawDeals.length === 0) {
    return { deal: null, reasoning: "No open deals available", method: "skip" };
  }

  // ── 2. Exclude already-resolved deals ──────────────────────────────────────
  const resolvedDealIds = (await ctx.runQuery(
    internal.dealOutcomes.listResolvedDealIdsForTrader,
    { traderId }
  )) as string[];
  const resolvedSet = new Set(resolvedDealIds);

  const deals: Deal[] = rawDeals
    .filter((d) => !resolvedSet.has(d._id as string))
    .map((d) => ({
      id: d._id as string,
      prompt: d.prompt,
      pot_usdc: d.potUsdc,
      entry_cost_usdc: d.entryCostUsdc,
      status: d.status,
      on_chain_deal_id: d.onChainDealId ?? null,
      creator_id: d.creatorDeskManagerId ?? null,
      creator_address: d.creatorAddress ?? null,
      entry_count: d.entryCount ?? 0,
      wipeout_count: d.wipeoutCount ?? 0,
    }));

  if (deals.length === 0) {
    return {
      deal: null,
      reasoning: "All open deals already resolved by this trader",
      method: "skip",
    };
  }

  // ── 3. Mandate filter (pure) ────────────────────────────────────────────────
  const { eligible, skipped: mandateSkipped } = evaluateDeals(
    deals,
    mandate,
    escrowBalanceUsdc
  );

  if (eligible.length === 0) {
    const reasons = mandateSkipped
      .slice(0, 3)
      .map((s) => s.reason)
      .join("; ");
    return {
      deal: null,
      reasoning: `No deals passed mandate filter. Sample reasons: ${reasons}`,
      method: "skip",
    };
  }

  // ── 4. Desk dedup ──────────────────────────────────────────────────────────
  const siblingTraderIds = (await ctx.runQuery(
    internal.traders.listSiblingTraderIds,
    {
      deskManagerId: deskManagerId as never,
      excludeTraderId: traderId as never,
    }
  )) as string[];

  let dedupedEligible = eligible;
  if (siblingTraderIds.length > 0) {
    const since = Date.now() - DESK_DEAL_DEDUP_HOURS * 60 * 60 * 1000;
    const blockedDealIds = (await ctx.runQuery(
      internal.dealOutcomes.getDealIdsEnteredBySiblingsSince,
      { siblingTraderIds, since }
    )) as string[];
    const blockedSet = new Set(blockedDealIds);
    dedupedEligible = eligible.filter((d) => !blockedSet.has(d.id));
  }

  if (dedupedEligible.length === 0) {
    return {
      deal: null,
      reasoning:
        "All eligible deals already entered by sibling traders on this desk",
      method: "skip",
    };
  }

  if (dedupedEligible.length === 1) {
    return {
      deal: dedupedEligible[0]!,
      reasoning: "Only one mandate-eligible deal after deduplication.",
      method: "ratio",
    };
  }

  // ── 5. LLM rank or ratio fallback ─────────────────────────────────────────
  const useLlm =
    mandate.llm_deal_selection !== false && Boolean(process.env.OPENAI_API_KEY);

  if (!useLlm) {
    return ratioFallback(dedupedEligible);
  }

  try {
    // Build context: recent outcomes + assets (for LLM prompt)
    const [recentOutcomes, assets] = await Promise.all([
      ctx.runQuery(internal.dealOutcomes.listRecentForTrader, {
        traderId,
        limit: 5,
      }),
      ctx.runQuery(internal.assets.listForTraderInternal, {
        traderId: traderId as never,
      }),
    ]);

    const recentSummary =
      (
        recentOutcomes as Array<{
          traderWipedOut?: boolean;
          createdAt: number;
          traderPnlUsdc?: number;
        }>
      ).length === 0
        ? "No recent deal history for this trader."
        : (
            recentOutcomes as Array<{
              traderWipedOut?: boolean;
              createdAt: number;
              traderPnlUsdc?: number;
            }>
          )
            .map((o) => {
              if (o.traderWipedOut)
                return `Wipeout on ${new Date(o.createdAt).toISOString()}`;
              const pnl = Number(o.traderPnlUsdc ?? 0);
              return `${pnl >= 0 ? "Win" : "Loss"} $${Math.abs(pnl).toFixed(2)} on ${new Date(o.createdAt).toISOString()}`;
            })
            .join("; ");

    const inventorySummary =
      (assets as Array<{ name: string; valueUsdc?: number }>).length === 0
        ? "None"
        : (assets as Array<{ name: string; valueUsdc?: number }>)
            .map((a) => `${a.name} ($${a.valueUsdc ?? 0})`)
            .join(", ");

    const resolvedPersonality =
      personality?.trim() ||
      "Opportunistic, ratio-driven, no strong preferences.";

    const dealsPayload = dedupedEligible.map((d) => ({
      id: d.id,
      prompt: d.prompt,
      pot_usdc: d.pot_usdc,
      entry_cost_usdc: d.entry_cost_usdc,
      entry_count: d.entry_count ?? 0,
      wipeout_count: d.wipeout_count ?? 0,
    }));

    const messages = [
      { role: "system" as const, content: DEAL_EVALUATION_SYSTEM },
      {
        role: "user" as const,
        content: `TRADER: ${traderName}
ESCROW BALANCE (USDC): ${escrowBalanceUsdc.toFixed(2)}
PERSONALITY: ${resolvedPersonality}

RECENT OUTCOMES (this trader): ${recentSummary}

INVENTORY: ${inventorySummary}

DEALS (mandate-eligible, JSON):
${JSON.stringify(dealsPayload, null, 2)}

Rank deal IDs from most desirable to enter first. If none are acceptable, set skip_all to true and explain why.`,
      },
    ];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.parse(
      {
        model: "gpt-4o-mini",
        messages,
        response_format: zodResponseFormat(
          DealEvaluationSchema,
          "deal_evaluation"
        ),
      },
      { timeout: 30_000 }
    );

    const msg = completion.choices[0]?.message;
    if (msg?.refusal || !msg?.parsed) {
      console.warn(
        "[dealSelection] LLM refusal or empty response, falling back to ratio"
      );
      return ratioFallback(dedupedEligible);
    }

    const evaluation = msg.parsed as DealEvaluation;

    if (evaluation.skip_all || evaluation.ranked_deal_ids.length === 0) {
      return {
        deal: null,
        reasoning: replaceDealIdsWithLabels(
          evaluation.reasoning || "Model chose to skip all deals.",
          dedupedEligible
        ),
        method: "llm",
      };
    }

    const idSet = new Set(dedupedEligible.map((d) => d.id));
    let chosen: Deal | null = null;
    for (const id of evaluation.ranked_deal_ids) {
      if (idSet.has(id)) {
        chosen = dedupedEligible.find((d) => d.id === id) ?? null;
        if (chosen) break;
      }
    }

    if (!chosen) {
      const fb = ratioFallback(dedupedEligible);
      return {
        ...fb,
        reasoning: `${replaceDealIdsWithLabels(evaluation.reasoning, dedupedEligible)} (no ranked ID matched eligible list; falling back to ratio).`,
      };
    }

    return {
      deal: chosen,
      reasoning: replaceDealIdsWithLabels(
        evaluation.reasoning,
        dedupedEligible
      ),
      method: "llm",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dealSelection] LLM error, falling back to ratio:", msg);
    const fb = ratioFallback(dedupedEligible);
    return {
      ...fb,
      reasoning: `${fb.reasoning} (LLM error: ${msg})`,
    };
  }
}
