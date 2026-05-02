/**
 * Pure deal evaluator — filters open deals against a trader's mandate.
 * Mirrors src/lib/agent/evaluator.ts — kept in sync manually.
 */

import type { Mandate, Deal, EvaluationResult } from "./_types";

const DEFAULT_BANKROLL_PCT = 25;

export function evaluateDeals(
  deals: Deal[],
  mandate: Mandate,
  balanceUsdc: number
): EvaluationResult {
  const eligible: Deal[] = [];
  const skipped: { deal: Deal; reason: string }[] = [];

  const bankrollPct = mandate.bankroll_pct ?? DEFAULT_BANKROLL_PCT;
  const maxRisk = balanceUsdc * (bankrollPct / 100);
  const keywordsLower = mandate.keywords?.map((kw) => kw.toLowerCase());

  for (const deal of deals) {
    if (deal.status !== "open") {
      skipped.push({ deal, reason: "deal not open" });
      continue;
    }

    if (deal.entry_cost_usdc > maxRisk) {
      skipped.push({
        deal,
        reason: `entry cost $${deal.entry_cost_usdc} exceeds bankroll limit $${maxRisk.toFixed(2)} (${bankrollPct}% of $${balanceUsdc.toFixed(2)})`,
      });
      continue;
    }

    if (deal.entry_cost_usdc > balanceUsdc) {
      skipped.push({
        deal,
        reason: `insufficient balance ($${balanceUsdc.toFixed(2)}) for entry cost ($${deal.entry_cost_usdc})`,
      });
      continue;
    }

    if (
      mandate.max_entry_cost_usdc !== undefined &&
      deal.entry_cost_usdc > mandate.max_entry_cost_usdc
    ) {
      skipped.push({
        deal,
        reason: `entry cost $${deal.entry_cost_usdc} exceeds mandate max $${mandate.max_entry_cost_usdc}`,
      });
      continue;
    }

    if (
      mandate.min_pot_usdc !== undefined &&
      deal.pot_usdc < mandate.min_pot_usdc
    ) {
      skipped.push({
        deal,
        reason: `pot $${deal.pot_usdc} below mandate min $${mandate.min_pot_usdc}`,
      });
      continue;
    }

    if (
      mandate.max_pot_usdc !== undefined &&
      deal.pot_usdc > mandate.max_pot_usdc
    ) {
      skipped.push({
        deal,
        reason: `pot $${deal.pot_usdc} exceeds mandate max $${mandate.max_pot_usdc}`,
      });
      continue;
    }

    if (keywordsLower && keywordsLower.length > 0) {
      const promptLower = deal.prompt.toLowerCase();
      const hasKeyword = keywordsLower.some((kw) => promptLower.includes(kw));
      if (!hasKeyword) {
        skipped.push({
          deal,
          reason: `prompt doesn't match keywords: ${(mandate.keywords ?? []).join(", ")}`,
        });
        continue;
      }
    }

    eligible.push(deal);
  }

  return { eligible, skipped };
}
