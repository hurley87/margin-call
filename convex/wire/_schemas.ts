import { z } from "zod";
import {
  MAX_SUGGESTED_POT_USDC,
  MAX_SUGGESTED_ENTRY_USDC,
} from "../agent/_constants";

export const CategoryEnum = z.enum([
  "wire",
  "floor_talk",
  "sec_watch",
  "boardroom",
  "ticker",
  "positioning",
  "deal_seed",
]);

export const CategoryInputEnum = z.union([CategoryEnum, z.literal("market")]);

export const PhaseEnum = z.enum([
  "rumor",
  "crack",
  "panic",
  "rupture",
  "fallout",
  "countermove",
  "resolution",
]);

export const MaterialChangeKindEnum = z.enum([
  "asset_loss",
  "personnel_exit",
  "regulatory_action",
  "counterparty_break",
  "filing",
  "position_unwind",
]);

export const MaterialChangeSchema = z.object({
  kind: MaterialChangeKindEnum,
  entitySlug: z.string().min(1),
  magnitude: z
    .object({
      unitsUsdc: z.number().positive().optional(),
      label: z.string().min(1).max(60).optional(),
    })
    .optional(),
});

const GeneratedMaterialChangeSchema = z.object({
  kind: MaterialChangeKindEnum,
  entitySlug: z.string().min(1),
  magnitude: z
    .object({
      unitsUsdc: z.number().positive().nullable(),
      label: z.string().min(1).max(60).nullable(),
    })
    .nullable(),
});

const BaseDispatchSchema = z.object({
  /** Stable per-drop identifier the LLM emits so a deal seed can point at its source dispatch. */
  dispatchKey: z.string().min(1).max(64),
  headline: z.string().max(100),
  body: z.string().max(180),
  role: z.enum(["main", "supporting", "deal_seed"]),
  arcSlug: z.string().nullable(),
  referenceEpoch: z.number().nullable(),
  materialChange: MaterialChangeSchema.nullable().optional(),
});

const GeneratedBaseDispatchSchema = BaseDispatchSchema.omit({
  materialChange: true,
}).extend({
  materialChange: GeneratedMaterialChangeSchema.nullable(),
});

const DispatchSchema = BaseDispatchSchema.extend({
  category: CategoryEnum,
});

const GeneratedDispatchSchema = GeneratedBaseDispatchSchema.extend({
  category: CategoryInputEnum,
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
  phase: PhaseEnum.optional(),
});

const GeneratedArcUpdateSchema = z.object({
  arcSlug: z.string(),
  tensionDelta: z.number().min(-3).max(3),
  phase: PhaseEnum.nullable(),
});

const DealSeedSchema = z.object({
  /** Must match exactly one dispatch.dispatchKey in this drop. */
  dispatchKey: z.string().min(1).max(64),
  /** Required: a Deal Seed always points at an active arc. */
  arcSlug: z.string(),
  /** Prefillable into the Create Deal dialog. */
  prompt: z.string().min(8).max(280),
  suggestedPotUsdc: z.number().positive().max(MAX_SUGGESTED_POT_USDC),
  suggestedEntryCostUsdc: z.number().positive().max(MAX_SUGGESTED_ENTRY_USDC),
});

export const NarrativeEpochSchema = z.object({
  dropTitle: z.string(),
  worldState: WorldStateSchema,
  dispatches: z.array(DispatchSchema).length(1),
  /** Structured Deal Seeds are retained for legacy rows but no longer generated. */
  dealSeed: DealSeedSchema.nullable(),
  arcUpdates: z.array(ArcUpdateSchema).max(3).nullable(),
  entityMentions: z.array(z.string()).nullable(),
  confirmedFacts: z.array(z.string().min(1).max(160)).max(8).optional(),
  openQuestions: z.array(z.string().min(1).max(160)).max(6).optional(),
});

export const GeneratedNarrativeEpochSchema = NarrativeEpochSchema.extend({
  dispatches: z.array(GeneratedDispatchSchema).length(1),
  arcUpdates: z.array(GeneratedArcUpdateSchema).max(3).nullable(),
  confirmedFacts: z.array(z.string().min(1).max(160)).max(8).nullable(),
  openQuestions: z.array(z.string().min(1).max(160)).max(6).nullable(),
});

export type NarrativeEpoch = z.infer<typeof NarrativeEpochSchema>;
export type GeneratedNarrativeEpoch = z.infer<
  typeof GeneratedNarrativeEpochSchema
>;
export type Dispatch = z.infer<typeof DispatchSchema>;
export type ArcUpdate = z.infer<typeof ArcUpdateSchema>;
export type DealSeed = z.infer<typeof DealSeedSchema>;
export type Phase = z.infer<typeof PhaseEnum>;
export type Category = z.infer<typeof CategoryEnum>;
export type MaterialChange = z.infer<typeof MaterialChangeSchema>;
export type MaterialChangeKind = z.infer<typeof MaterialChangeKindEnum>;
