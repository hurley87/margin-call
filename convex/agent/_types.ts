/**
 * Shared types for the agent cycle pipeline.
 * Mirrors src/lib/agent/evaluator.ts — kept in sync manually.
 */

export interface Mandate {
  max_entry_cost_usdc?: number;
  min_pot_usdc?: number;
  max_pot_usdc?: number;
  bankroll_pct?: number;
  keywords?: string[];
  approval_threshold_usdc?: number;
  /** When false, skip GPT deal ranking and use pot/entry ratio only. Default: true when unset. */
  llm_deal_selection?: boolean;
}

export interface Deal {
  id: string;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  status: string;
  on_chain_deal_id?: number | null;
  creator_id?: string | null;
  creator_address?: string | null;
  entry_count?: number;
  wipeout_count?: number;
  [key: string]: unknown;
}

export interface EvaluationResult {
  eligible: Deal[];
  skipped: { deal: Deal; reason: string }[];
}
