import { NarrativeEpochSchema, type NarrativeEpoch } from "./_schemas";

export type ValidatedEpoch = NarrativeEpoch;

export function validateEpoch(
  raw: unknown,
  ctx: {
    arcSlugs: Set<string>;
    entitySlugs: Set<string>;
    forbiddenLanguage: string[];
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

  // Forbidden language check (case-insensitive substring)
  const fullText = [
    data.dropTitle,
    ...data.dispatches.map((d) => `${d.headline} ${d.body}`),
  ]
    .join(" ")
    .toLowerCase();

  for (const word of ctx.forbiddenLanguage) {
    if (fullText.includes(word.toLowerCase())) {
      return { ok: false, error: `Forbidden language: "${word}"` };
    }
  }

  return { ok: true, data };
}
