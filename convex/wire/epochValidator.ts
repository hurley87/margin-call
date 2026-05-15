import { NarrativeEpochSchema, type NarrativeEpoch } from "./_schemas";

export type ValidatedEpoch = NarrativeEpoch;

export function validateEpoch(
  raw: unknown,
  ctx: {
    arcSlugs: Set<string>;
    entitySlugs: Set<string>;
    forbiddenLanguage: string[];
    /**
     * When true, the cadence rule requires this epoch to include a dealSeed.
     * Set by the generator when the previous market-hour drop did not include one.
     */
    requireDealSeed?: boolean;
    /** Post-suppression primary arc slug shown to the LLM. */
    topArcSlug?: string | null;
    /** Post-suppression primary arc tension shown to the LLM. */
    topArcTension?: number;
  }
): { ok: true; data: ValidatedEpoch } | { ok: false; error: string } {
  const result = NarrativeEpochSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  const data = result.data;

  // Require at least one "main" dispatch
  if (!data.dispatches.some((d) => d.role === "main")) {
    return { ok: false, error: "At least one dispatch must have role 'main'" };
  }

  // Dispatch keys must be unique within the drop so a dealSeed can point at exactly one source.
  const seenKeys = new Set<string>();
  for (const d of data.dispatches) {
    if (seenKeys.has(d.dispatchKey)) {
      return {
        ok: false,
        error: `Duplicate dispatchKey: "${d.dispatchKey}"`,
      };
    }
    seenKeys.add(d.dispatchKey);
  }

  // arcSlug references in dispatches must be on-roster
  for (const dispatch of data.dispatches) {
    if (dispatch.arcSlug && !ctx.arcSlugs.has(dispatch.arcSlug)) {
      return {
        ok: false,
        error: `Unknown arcSlug in dispatch: "${dispatch.arcSlug}"`,
      };
    }
  }

  // arcSlug references in arcUpdates must be on-roster
  for (const update of data.arcUpdates ?? []) {
    if (!ctx.arcSlugs.has(update.arcSlug)) {
      return {
        ok: false,
        error: `Unknown arcSlug in arcUpdates: "${update.arcSlug}"`,
      };
    }
  }

  // entityMentions must be on-roster
  for (const slug of data.entityMentions ?? []) {
    if (!ctx.entitySlugs.has(slug)) {
      return {
        ok: false,
        error: `Unknown entity slug in entityMentions: "${slug}"`,
      };
    }
  }

  // ── Deal seed cadence + integrity ─────────────────────────────────────────
  if (ctx.requireDealSeed && data.dealSeed === null) {
    return {
      ok: false,
      error: "deal seed required this epoch (cadence)",
    };
  }

  if (data.dealSeed) {
    if (!ctx.arcSlugs.has(data.dealSeed.arcSlug)) {
      return {
        ok: false,
        error: `Unknown arcSlug in dealSeed: "${data.dealSeed.arcSlug}"`,
      };
    }

    const matchingDispatches = data.dispatches.filter(
      (d) => d.dispatchKey === data.dealSeed!.dispatchKey
    );
    if (matchingDispatches.length !== 1) {
      return {
        ok: false,
        error: `dealSeed.dispatchKey "${data.dealSeed.dispatchKey}" must match exactly one dispatch`,
      };
    }
    if (matchingDispatches[0].role !== "deal_seed") {
      return {
        ok: false,
        error: `dispatch referenced by dealSeed must have role "deal_seed"`,
      };
    }
  }

  // role/category pairing. Category is orthogonal to role except deal_seed,
  // where persisted data must be unambiguous for the deal-seed rail.
  for (const dispatch of data.dispatches) {
    if (dispatch.role === "deal_seed" && dispatch.category !== "deal_seed") {
      return {
        ok: false,
        error: `role=deal_seed dispatch "${dispatch.dispatchKey}" must use category "deal_seed"`,
      };
    }
  }

  // materialChange references must point at a known roster entity.
  for (const dispatch of data.dispatches) {
    const materialChange = dispatch.materialChange;
    if (materialChange && !ctx.entitySlugs.has(materialChange.entitySlug)) {
      return {
        ok: false,
        error: `Unknown entitySlug in materialChange: "${materialChange.entitySlug}"`,
      };
    }
  }

  const topArcSlug = ctx.topArcSlug ?? null;
  const topArcTension = ctx.topArcTension ?? 0;
  if (topArcSlug !== null && topArcTension >= 9) {
    const primaryDispatches = data.dispatches.filter(
      (d) => d.role === "main" && d.arcSlug === topArcSlug
    );
    if (primaryDispatches.length === 0) {
      return {
        ok: false,
        error:
          "max-tension primary arc must be carried by a role=main dispatch",
      };
    }
    if (primaryDispatches.length > 1) {
      return {
        ok: false,
        error:
          "max-tension primary arc must be carried by exactly one role=main dispatch",
      };
    }
    if (!primaryDispatches[0].materialChange) {
      return {
        ok: false,
        error: `max-tension primary arc "${topArcSlug}" requires materialChange on its role=main dispatch`,
      };
    }
  }

  // Forbidden language check (case-insensitive substring)
  const fullText = [
    data.dropTitle,
    ...data.dispatches.map((d) => `${d.headline} ${d.body}`),
    data.dealSeed?.prompt ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const word of ctx.forbiddenLanguage) {
    const pattern = new RegExp(
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (pattern.test(fullText)) {
      return { ok: false, error: `Forbidden language: "${word}"` };
    }
  }

  return { ok: true, data };
}
