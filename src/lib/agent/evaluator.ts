/**
 * Deal evaluator — filters open deals against a trader's mandate.
 *
 * Mandate shape (stored as JSONB on traders.mandate):
 * {
 *   max_entry_cost_usdc?: number;   // skip deals with entry cost above this
 *   min_pot_usdc?: number;          // skip deals with pot below this
 *   max_pot_usdc?: number;          // skip deals with pot above this
 *   bankroll_pct?: number;          // max % of balance to risk per deal (default 25)
 *   keywords?: string[];            // only enter deals whose prompt contains a keyword
 * }
 */

export interface Mandate {
  max_entry_cost_usdc?: number;
  min_pot_usdc?: number;
  max_pot_usdc?: number;
  bankroll_pct?: number;
  keywords?: string[];
}

export interface Deal {
  id: string;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  status: string;
  on_chain_deal_id?: number | null;
  [key: string]: unknown;
}

export interface EvaluationResult {
  eligible: Deal[];
  skipped: { deal: Deal; reason: string }[];
}

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
    // Must be open
    if (deal.status !== "open") {
      skipped.push({ deal, reason: "deal not open" });
      continue;
    }

    // Entry cost exceeds bankroll rule
    if (deal.entry_cost_usdc > maxRisk) {
      skipped.push({
        deal,
        reason: `entry cost $${deal.entry_cost_usdc} exceeds bankroll limit $${maxRisk.toFixed(2)} (${bankrollPct}% of $${balanceUsdc.toFixed(2)})`,
      });
      continue;
    }

    // Balance check
    if (deal.entry_cost_usdc > balanceUsdc) {
      skipped.push({
        deal,
        reason: `insufficient balance ($${balanceUsdc.toFixed(2)}) for entry cost ($${deal.entry_cost_usdc})`,
      });
      continue;
    }

    // Mandate: max entry cost
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

    // Mandate: min pot
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

    // Mandate: max pot
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

    // Mandate: keyword filter
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

/** Pick the best deal from eligible list (highest pot-to-entry ratio). */
export function pickBestDeal(eligible: Deal[]): Deal | null {
  if (eligible.length === 0) return null;
  return eligible.reduce((best, deal) => {
    const ratio = deal.pot_usdc / deal.entry_cost_usdc;
    const bestRatio = best.pot_usdc / best.entry_cost_usdc;
    return ratio > bestRatio ? deal : best;
  });
}
