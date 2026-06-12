import { z } from "zod";

/**
 * Wire dispatch / epoch schemas.
 *
 * The LLM produces PROSE ONLY. Code owns every number, arc stage, tension
 * level, mood, and SEC-heat value — those are computed in worldState.ts and
 * attached to the stored drop by the generator/persist layer, NOT emitted by
 * the model. So the model-output schema here is deliberately small: a title,
 * one dispatch, and continuity hints.
 */

export const CategoryEnum = z.enum([
  "wire",
  "floor_talk",
  "sec_watch",
  "boardroom",
  "ticker",
  "positioning",
]);

/** Tolerate the legacy "market" alias from older prompt phrasing. */
export const CategoryInputEnum = z.union([CategoryEnum, z.literal("market")]);

export const MaterialChangeKindEnum = z.enum([
  "asset_loss",
  "personnel_exit",
  "regulatory_action",
  "counterparty_break",
  "filing",
  "position_unwind",
]);

/**
 * Material change attached to a dispatch by CODE (from the computed firm delta
 * or lead event). The figure in `magnitude.unitsUsdc` is authoritative — the
 * LLM is told to use exactly this number in its prose.
 */
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

/** Real game entity a drop reports on, for UI deep-linking. */
export const SubjectSchema = z.object({
  type: z.enum(["trader", "deal", "manager"]),
  id: z.string().min(1),
});

/** OpenAI structured-output maxLength for dispatch body prose. */
export const DISPATCH_BODY_MAX_LENGTH = 600;

const BaseDispatchSchema = z.object({
  /** Stable per-drop identifier. */
  dispatchKey: z.string().min(1).max(64),
  headline: z.string().max(100),
  body: z.string().max(DISPATCH_BODY_MAX_LENGTH),
  role: z.enum(["main", "supporting"]),
  arcSlug: z.string().nullable(),
  referenceEpoch: z.number().nullable(),
});

/** Output (validated) dispatch — exact category. */
const DispatchSchema = BaseDispatchSchema.extend({
  category: CategoryEnum,
});

/** Generated (raw-from-LLM) dispatch — tolerates the "market" alias. */
const GeneratedDispatchSchema = BaseDispatchSchema.extend({
  category: CategoryInputEnum,
});

export const NarrativeEpochSchema = z.object({
  dropTitle: z.string(),
  dispatches: z.array(DispatchSchema).length(1),
  entityMentions: z.array(z.string()).nullable(),
  confirmedFacts: z.array(z.string().min(1).max(160)).max(8).optional(),
  openQuestions: z.array(z.string().min(1).max(160)).max(6).optional(),
});

export const GeneratedNarrativeEpochSchema = NarrativeEpochSchema.extend({
  dispatches: z.array(GeneratedDispatchSchema).length(1),
  confirmedFacts: z.array(z.string().min(1).max(160)).max(8).nullable(),
  openQuestions: z.array(z.string().min(1).max(160)).max(6).nullable(),
});

export type NarrativeEpoch = z.infer<typeof NarrativeEpochSchema>;
export type GeneratedNarrativeEpoch = z.infer<
  typeof GeneratedNarrativeEpochSchema
>;
export type Dispatch = z.infer<typeof DispatchSchema>;
export type Category = z.infer<typeof CategoryEnum>;
export type MaterialChange = z.infer<typeof MaterialChangeSchema>;
export type MaterialChangeKind = z.infer<typeof MaterialChangeKindEnum>;
export type Subject = z.infer<typeof SubjectSchema>;

/** A dispatch as persisted — LLM prose plus code-attached structured fields. */
export type StoredDispatch = Dispatch & {
  materialChange?: MaterialChange | null;
};
