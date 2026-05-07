import { z } from "zod";

const DispatchSchema = z.object({
  headline: z.string().max(100),
  body: z.string().max(180),
  category: z.string(),
  role: z.enum(["main", "supporting", "deal_seed"]),
  arcSlug: z.string().optional(),
  referenceEpoch: z.number().optional(),
});

const WorldStateSchema = z.object({
  mood: z.string(),
  sec_heat: z.number().min(0).max(10),
  sectors: z.array(z.string()).optional(),
  active_storylines: z.array(z.string()).optional(),
  notable_traders: z.array(z.string()).optional(),
});

const ArcUpdateSchema = z.object({
  arcSlug: z.string(),
  tensionDelta: z.number().min(-3).max(3),
});

export const NarrativeEpochSchema = z.object({
  dropTitle: z.string(),
  worldState: WorldStateSchema,
  dispatches: z.array(DispatchSchema).min(2).max(3),
  arcUpdates: z.array(ArcUpdateSchema).max(3).optional(),
  entityMentions: z.array(z.string()).optional(),
});

export type NarrativeEpoch = z.infer<typeof NarrativeEpochSchema>;
export type Dispatch = z.infer<typeof DispatchSchema>;
export type ArcUpdate = z.infer<typeof ArcUpdateSchema>;
