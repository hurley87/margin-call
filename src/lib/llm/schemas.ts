import { z } from "zod";

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

export const CorrectionNarrativeSchema = z.object({
  corrected_narrative: z.string(),
});

export const DealPromptSuggestionsSchema = z.object({
  suggestions: z.array(z.string()).length(3),
});

// --- Market Wire / Narrative schemas ---

const NarrativeCategoryEnum = z.enum([
  "rumor",
  "breaking",
  "investigation",
  "market_move",
  "corporate_drama",
  "politics",
]);

const NarrativeHeadlineSchema = z.object({
  headline: z.string(),
  body: z.string(),
  category: NarrativeCategoryEnum,
});

const WorldStateSchema = z.object({
  mood: z.string(),
  sec_heat: z.number().min(0).max(10),
  sectors: z.record(z.string(), z.string()),
  active_storylines: z.array(z.string()),
  notable_traders: z.array(z.string()),
});

export const NarrativeEpochSchema = z.object({
  world_state: WorldStateSchema,
  headlines: z.array(NarrativeHeadlineSchema).min(3).max(5),
  raw_narrative: z.string(),
});

export type DealOutcome = z.infer<typeof DealOutcomeSchema>;
export type CorrectionNarrative = z.infer<typeof CorrectionNarrativeSchema>;
export type DealPromptSuggestions = z.infer<typeof DealPromptSuggestionsSchema>;
export type NarrativeHeadline = z.infer<typeof NarrativeHeadlineSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type NarrativeEpoch = z.infer<typeof NarrativeEpochSchema>;

/** LLM ranks which mandate-eligible deal the trader should enter (Margin Call agent selection). */
export const DealEvaluationSchema = z.object({
  ranked_deal_ids: z.array(z.string()).max(30),
  skip_all: z.boolean(),
  reasoning: z.string().max(2000),
});

export type DealEvaluation = z.infer<typeof DealEvaluationSchema>;
