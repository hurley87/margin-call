import { callModel, LLMError } from "@/lib/llm/call-model";
import { DealEvaluationSchema, type DealEvaluation } from "@/lib/llm/schemas";
import { buildDealEvaluationMessages } from "@/lib/llm/messages";
import type { Deal } from "./evaluator";
import {
  getCreatorDealAggregates,
  getDealOutcomeStatsByDealIds,
  getDeskManagerDisplayByIds,
  getDealIdsEnteredRecentlyByTraders,
  listRecentOutcomesForTrader,
  listTraderIdsByOwnerExcept,
  getTraderAssets,
  type DealOutcomeDealStats,
  type CreatorDealAggStats,
} from "@/lib/supabase/queries";
import { DESK_DEAL_DEDUP_HOURS } from "@/lib/constants";
import { resolvePersonalityText } from "./personality";

export type DealSelectionMethod = "llm" | "ratio" | "skip";

export interface DealSelectionResult {
  deal: Deal | null;
  reasoning: string;
  method: DealSelectionMethod;
}

function ratioFallback(eligible: Deal[]): DealSelectionResult {
  if (eligible.length === 0) {
    return { deal: null, reasoning: "No eligible deals", method: "skip" };
  }
  const best = eligible.reduce((a, b) => {
    const ra = a.pot_usdc / a.entry_cost_usdc;
    const rb = b.pot_usdc / b.entry_cost_usdc;
    return rb > ra ? b : a;
  });
  return {
    deal: best,
    reasoning: `Highest pot/entry ratio among mandate-eligible deals (${best.id}).`,
    method: "ratio",
  };
}

/** Remove deals another trader on the same desk recently entered (same owner wallet). */
export async function excludeDealsForDeskDedup(
  eligible: Deal[],
  traderId: string,
  ownerAddress: string
): Promise<{ filtered: Deal[]; excludedIds: string[] }> {
  if (eligible.length === 0) {
    return { filtered: [], excludedIds: [] };
  }

  const siblingIds = await listTraderIdsByOwnerExcept(ownerAddress, traderId);
  if (siblingIds.length === 0) {
    return { filtered: eligible, excludedIds: [] };
  }

  const dealIds = eligible.map((d) => d.id);
  const since = new Date(
    Date.now() - DESK_DEAL_DEDUP_HOURS * 60 * 60 * 1000
  ).toISOString();
  const blocked = await getDealIdsEnteredRecentlyByTraders(
    siblingIds,
    dealIds,
    since
  );

  const excludedIds = [...blocked];
  const filtered = eligible.filter((d) => !blocked.has(d.id));
  return { filtered, excludedIds };
}

interface BuildContextParams {
  eligible: Deal[];
  traderId: string;
  traderName: string;
  escrowBalanceUsdc: number;
  personalityText: string | null | undefined;
}

async function buildEvaluationContext(params: BuildContextParams) {
  const { eligible, traderId, traderName, escrowBalanceUsdc, personalityText } =
    params;

  const dealIds = eligible.map((d) => d.id);
  const creatorIds = eligible.map((d) => d.creator_id ?? null);

  const uniqueCreatorIds = [
    ...new Set(creatorIds.filter((id): id is string => Boolean(id))),
  ];

  const [outcomeByDeal, creatorAggs, recentOutcomes, assets, deskByCreator] =
    await Promise.all([
      getDealOutcomeStatsByDealIds(dealIds),
      getCreatorDealAggregates(creatorIds),
      listRecentOutcomesForTrader(traderId, 5),
      getTraderAssets(traderId),
      getDeskManagerDisplayByIds(uniqueCreatorIds),
    ]);

  const personality = resolvePersonalityText(personalityText);

  const dealsPayload = eligible.map((d) =>
    formatDealForPrompt(
      d,
      outcomeByDeal.get(d.id),
      d.creator_id ? creatorAggs.get(d.creator_id) : undefined,
      d.creator_id ? deskByCreator.get(d.creator_id) : undefined
    )
  );

  const recentSummary =
    recentOutcomes.length === 0
      ? "No recent deal history for this trader."
      : recentOutcomes
          .map((o) => {
            if (o.trader_wiped_out) return `Wipeout on ${o.created_at}`;
            const pnl = Number(o.trader_pnl_usdc);
            return `${pnl >= 0 ? "Win" : "Loss"} $${Math.abs(pnl).toFixed(2)} on ${o.created_at}`;
          })
          .join("; ");

  const inventory =
    assets.length === 0
      ? "None"
      : assets.map((a) => `${a.name} ($${a.value_usdc})`).join(", ");

  return {
    messages: buildDealEvaluationMessages({
      traderName,
      escrowBalanceUsdc,
      personality,
      recentOutcomesSummary: recentSummary,
      inventorySummary: inventory,
      deals: dealsPayload,
    }),
    personality,
  };
}

function formatDealForPrompt(
  deal: Deal,
  stats: DealOutcomeDealStats | undefined,
  creatorAgg: CreatorDealAggStats | undefined,
  desk: { display_name: string | null; wallet_address: string } | undefined
) {
  let creatorLabel = desk?.display_name?.trim();
  if (!creatorLabel) {
    if (deal.creator_address) {
      creatorLabel = `wallet ${String(deal.creator_address).slice(0, 10)}…`;
    } else if (deal.creator_id) {
      creatorLabel = `desk ${deal.creator_id.slice(0, 8)}…`;
    } else {
      creatorLabel = "unknown creator";
    }
  }

  return {
    id: deal.id,
    prompt: deal.prompt,
    pot_usdc: deal.pot_usdc,
    entry_cost_usdc: deal.entry_cost_usdc,
    deal_table_entry_count: deal.entry_count ?? 0,
    deal_table_wipeout_count: deal.wipeout_count ?? 0,
    resolved_outcomes: stats?.outcomeCount ?? 0,
    resolved_wins: stats?.wins ?? 0,
    resolved_losses: stats?.losses ?? 0,
    resolved_wipeouts: stats?.wipeouts ?? 0,
    creator_label: creatorLabel,
    creator_total_deals: creatorAgg?.dealCount ?? 0,
    creator_total_trader_entries: creatorAgg?.totalEntries ?? 0,
    creator_total_wipeouts_on_deals: creatorAgg?.totalWipeoutsOnDeals ?? 0,
  };
}

function pickFirstRankedEligible(
  evaluation: DealEvaluation,
  eligible: Deal[]
): Deal | null {
  const idSet = new Set(eligible.map((d) => d.id));
  for (const id of evaluation.ranked_deal_ids) {
    if (idSet.has(id)) {
      return eligible.find((d) => d.id === id) ?? null;
    }
  }
  return null;
}

/**
 * Rank mandate-eligible deals with GPT-5 mini, or fall back to pot/entry ratio.
 */
export async function selectDealForTrader(
  eligible: Deal[],
  ctx: {
    traderId: string;
    traderName: string;
    escrowBalanceUsdc: number;
    personality: string | null | undefined;
    useLlm: boolean;
  }
): Promise<DealSelectionResult> {
  if (eligible.length === 0) {
    return { deal: null, reasoning: "No eligible deals", method: "skip" };
  }

  if (eligible.length === 1) {
    return {
      deal: eligible[0]!,
      reasoning: "Only one mandate-eligible deal.",
      method: "ratio",
    };
  }

  if (!ctx.useLlm || !process.env.OPENAI_API_KEY) {
    return ratioFallback(eligible);
  }

  try {
    const { messages } = await buildEvaluationContext({
      eligible,
      traderId: ctx.traderId,
      traderName: ctx.traderName,
      escrowBalanceUsdc: ctx.escrowBalanceUsdc,
      personalityText: ctx.personality,
    });

    const evaluation = await callModel<DealEvaluation>(
      messages,
      DealEvaluationSchema,
      "deal_evaluation"
    );

    if (evaluation.skip_all || evaluation.ranked_deal_ids.length === 0) {
      return {
        deal: null,
        reasoning: evaluation.reasoning || "Model chose to skip all deals.",
        method: "llm",
      };
    }

    const chosen = pickFirstRankedEligible(evaluation, eligible);
    if (!chosen) {
      return {
        deal: null,
        reasoning: `${evaluation.reasoning} (no ranked ID matched eligible list; treating as skip).`,
        method: "llm",
      };
    }

    return {
      deal: chosen,
      reasoning: evaluation.reasoning,
      method: "llm",
    };
  } catch (err) {
    const msg = err instanceof LLMError ? err.message : String(err);
    console.error("deal-selection LLM error, falling back to ratio:", msg);
    const fb = ratioFallback(eligible);
    return {
      ...fb,
      reasoning: `${fb.reasoning} (LLM error: ${msg})`,
    };
  }
}
