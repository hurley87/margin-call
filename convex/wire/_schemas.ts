import { z } from "zod";

const DispatchSchema = z.object({
  /** Stable per-drop identifier the LLM emits so a deal seed can point at its source dispatch. */
  dispatchKey: z.string().min(1).max(64),
  headline: z.string().max(100),
  body: z.string().max(180),
  category: z.string(),
  role: z.enum(["main", "supporting", "deal_seed"]),
  arcSlug: z.string().nullable(),
  referenceEpoch: z.number().nullable(),
});

const WorldStateSchema = z.object({
  mood: z.string(),
  sec_heat: z.number().min(0).max(10),
  sectors: z.array(z.string()).nullable(),
  active_storylines: z.array(z.string()).nullable(),
  notable_traders: z.array(z.string()).nullable(),
});

const ArcUpdateSchema = z.object({
  arcSlug: z.string(),
  tensionDelta: z.number().min(-3).max(3),
});

const DealSeedSchema = z.object({
  /** Must match exactly one dispatch.dispatchKey in this drop. */
  dispatchKey: z.string().min(1).max(64),
  /** Required: a Deal Seed always points at an active arc. */
  arcSlug: z.string(),
  /** Prefillable into the Create Deal dialog. */
  prompt: z.string().min(8).max(280),
  suggestedPotUsdc: z.number().positive(),
  suggestedEntryCostUsdc: z.number().positive(),
});

export const NarrativeEpochSchema = z.object({
  dropTitle: z.string(),
  worldState: WorldStateSchema,
  dispatches: z.array(DispatchSchema).min(2).max(3),
  /** Optional structured Deal Seed; cadence rule enforced in validator. */
  dealSeed: DealSeedSchema.nullable(),
  arcUpdates: z.array(ArcUpdateSchema).max(3).nullable(),
  entityMentions: z.array(z.string()).nullable(),
});

export type NarrativeEpoch = z.infer<typeof NarrativeEpochSchema>;
export type Dispatch = z.infer<typeof DispatchSchema>;
export type ArcUpdate = z.infer<typeof ArcUpdateSchema>;
export type DealSeed = z.infer<typeof DealSeedSchema>;
