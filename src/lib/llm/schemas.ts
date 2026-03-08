import { z } from "zod";

const WipeoutReasonEnum = z.enum([
  "margin_call",
  "sec_bust",
  "burnout",
  "heart_attack",
  "prison",
]);

const StoryEventSchema = z.object({
  event: z.string(),
  description: z.string(),
});

const AssetGainedSchema = z.object({
  name: z.string(),
  value_usdc: z.number(),
});

export const DealOutcomeSchema = z.object({
  narrative: z.array(StoryEventSchema),
  balance_change_usdc: z.number(),
  assets_gained: z.array(AssetGainedSchema),
  assets_lost: z.array(z.string()),
  trader_wiped_out: z.boolean(),
  wipeout_reason: WipeoutReasonEnum.nullable(),
});

export const CorrectionNarrativeSchema = z.object({
  corrected_narrative: z.array(StoryEventSchema),
});

export const DealPromptSuggestionsSchema = z.object({
  suggestions: z.array(z.string()).length(3),
});

export type DealOutcome = z.infer<typeof DealOutcomeSchema>;
export type CorrectionNarrative = z.infer<typeof CorrectionNarrativeSchema>;
export type DealPromptSuggestions = z.infer<typeof DealPromptSuggestionsSchema>;
