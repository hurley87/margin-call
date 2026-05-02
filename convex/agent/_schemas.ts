/**
 * Zod schemas for LLM structured outputs used in the cycle pipeline.
 * Mirrors src/lib/llm/schemas.ts (deal-selection + outcome resolver subsets).
 */

import { z } from "zod";

// ── Deal evaluation (selection) ────────────────────────────────────────────────

export const DealEvaluationSchema = z.object({
  ranked_deal_ids: z.array(z.string()).max(30),
  skip_all: z.boolean(),
  reasoning: z.string().max(2000),
});

export type DealEvaluation = z.infer<typeof DealEvaluationSchema>;

// ── Deal outcome (resolution) ──────────────────────────────────────────────────

const WipeoutReasonEnum = z.enum([
  "margin_call",
  "sec_bust",
  "burnout",
  "heart_attack",
  "prison",
]);

const AssetGainedSchema = z.object({
  name: z.string(),
  value_usdc: z.number(),
});

export const DealOutcomeSchema = z.object({
  narrative: z.string(),
  balance_change_usdc: z.number(),
  assets_gained: z.array(AssetGainedSchema),
  assets_lost: z.array(z.string()),
  trader_wiped_out: z.boolean(),
  wipeout_reason: WipeoutReasonEnum.nullable(),
});

export type DealOutcomePayload = z.infer<typeof DealOutcomeSchema>;
