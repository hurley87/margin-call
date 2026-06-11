import { NarrativeEpochSchema, type NarrativeEpoch } from "./_schemas";

export type ValidatedEpoch = NarrativeEpoch;

/**
 * Phrases the satirical wire must never print — lazy AP-wire filler and
 * compliance-memo cadence. Enforced as case-insensitive substrings (so
 * multi-word phrases are caught regardless of surrounding text).
 */
export const BANNED_PHRASES = [
  "watch for fallout",
  "market responds with heightened anxiety",
  "heightened anxiety",
  "concerns mount",
  "pressure intensifies",
  "pressure mounts",
  "in a developing story",
  "remains to be seen",
  "only time will tell",
  "sending shockwaves",
];

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

  // Require at least one "main" dispatch.
  if (!data.dispatches.some((d) => d.role === "main")) {
    return { ok: false, error: "At least one dispatch must have role 'main'" };
  }

  // Dispatch keys must be unique within the drop.
  const seenKeys = new Set<string>();
  for (const d of data.dispatches) {
    if (seenKeys.has(d.dispatchKey)) {
      return { ok: false, error: `Duplicate dispatchKey: "${d.dispatchKey}"` };
    }
    seenKeys.add(d.dispatchKey);
  }

  // arcSlug references must be on-roster.
  for (const dispatch of data.dispatches) {
    if (dispatch.arcSlug && !ctx.arcSlugs.has(dispatch.arcSlug)) {
      return {
        ok: false,
        error: `Unknown arcSlug in dispatch: "${dispatch.arcSlug}"`,
      };
    }
  }

  // entityMentions is a soft continuity hint (roster slugs only). Real desks
  // and traders legitimately appear in prose but are NOT roster entities, so
  // filter unknown mentions out rather than failing an otherwise-good drop.
  if (data.entityMentions) {
    data.entityMentions = data.entityMentions.filter((slug) =>
      ctx.entitySlugs.has(slug)
    );
  }

  const fullText = [
    data.dropTitle,
    ...data.dispatches.map((d) => `${d.headline} ${d.body}`),
  ]
    .join(" ")
    .toLowerCase();

  // Forbidden vocabulary (word-boundary, e.g. crypto/AI terms).
  for (const word of ctx.forbiddenLanguage) {
    const pattern = new RegExp(
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (pattern.test(fullText)) {
      return { ok: false, error: `Forbidden language: "${word}"` };
    }
  }

  // Banned filler phrases (substring — catches the AP-wire cadence we killed).
  for (const phrase of BANNED_PHRASES) {
    if (fullText.includes(phrase)) {
      return { ok: false, error: `Banned phrase: "${phrase}"` };
    }
  }

  return { ok: true, data };
}
