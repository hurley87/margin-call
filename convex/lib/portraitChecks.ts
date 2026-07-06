// Post-generation verification for v4 portraits. Pure module (NOT "use node"):
// it takes an injected `grader` (and, in the orchestrator, an injected `generate`)
// so the decision logic is unit-testable with a fake grader — no OpenAI, no
// network. The real grader lives in convex/portraits.ts.
//
// The grader is a QA aid, not the safety gate — the prompt's exclusion block is
// the actual guardrail. So checks FAIL only on an affirmative negative verdict;
// a null verdict (grader infra error) is treated as pass (fail-open) so a vision
// outage can't flip the whole fleet to error.

import {
  SURFACED_SLOTS,
  TRAIT_META,
  type PublicPortraitTraits,
} from "./portraitSeed";

export type GraderVerdict = {
  present: boolean | null;
  confidence?: number;
  note?: string;
};

export type Grader = (
  base64: string,
  question: string
) => Promise<GraderVerdict>;

// A clean flat cream border is REQUIRED in v4 (review5). The question is phrased
// so an affirmative "yes" means the border is defective.
export const BORDER_QUESTION =
  "the outer border/edge of this square image has a soft glow, halo, vignette, " +
  "drop-shadow or bevel around the field — i.e. the border is NOT a clean, flat, " +
  "crisp edge";

// Trait-visibility questions, keyed by trait id. Ported from scratchpad/grade7.py
// and re-keyed to the v4 (post-redesign) trait ids. Only rare/legendary values
// are checked (commons/uncommons are not gated).
export const RUBRIC: Record<string, string> = {
  // Expression
  manic:
    "the person's mouth is wide open in a big laugh (head-back, teeth showing, eyes wide) — NOT merely a closed smile, smirk, or grin",
  // Field Ink
  silver:
    "the flat background field behind the person is a cool metallic SILVER / grey — not red, blue, teal, gold, ochre, or cream",
  goldleaf:
    "the flat background field behind the person is a lustrous metallic GOLD (shiny gold-leaf / foil), clearly gold — not ochre, amber, silver, or cream",
  // Attire
  goldthread:
    "the suit has clearly visible GOLD-colored pinstripes or gold thread accents woven into it",
  // Vice
  litcigar:
    "there is a cigar with a visible curl or wisp of SMOKE rising from it",
  martini: "the person is holding a stemmed martini / cocktail glass in a hand",
  cigbouquet:
    "the person is holding a fistful of MANY lit cigarettes (five or more) fanned out, with multiple glowing tips — clearly more than two",
  coupe:
    "the person is holding or raising a wide, shallow champagne COUPE glass overflowing with foam or bubbles",
  // Field Flourish
  tickerbold:
    "the background field has several BOLD pale horizontal ticker-tape bands running across it (not a plain solid field)",
  confetti:
    "the background field is filled with FALLING ticker-tape / confetti streamer shapes (busy, not a plain solid field)",
};

export type CheckResult = { ok: boolean; note?: string };

/** Fails only when the grader affirmatively reports a defective border. */
export async function checkFlatBorder(
  grader: Grader,
  base64: string
): Promise<CheckResult> {
  const verdict = await grader(base64, BORDER_QUESTION);
  if (verdict.present === true) {
    return { ok: false, note: verdict.note ?? "non-flat border" };
  }
  return { ok: true };
}

/**
 * For each rare/legendary surfaced trait with a rubric, asks the grader that the
 * trait is visible. Fails only on an affirmative "not present". `traits === null`
 * (e.g. a fallback-prompt render) has nothing to verify → passes.
 */
export async function checkTraitVisibility(
  grader: Grader,
  base64: string,
  traits: PublicPortraitTraits | null
): Promise<CheckResult & { missing?: string }> {
  if (!traits) return { ok: true };
  for (const slot of SURFACED_SLOTS) {
    const id = traits[slot.key];
    const meta = TRAIT_META[slot.key][id];
    if (!meta) continue;
    if (meta.tier !== "Rare" && meta.tier !== "Legendary") continue;
    const question = RUBRIC[id];
    if (!question) continue;
    const verdict = await grader(base64, question);
    if (verdict.present === false) {
      return { ok: false, missing: id, note: verdict.note ?? `missing ${id}` };
    }
  }
  return { ok: true };
}

export type AttemptOutcome =
  | { status: "ready"; base64: string }
  | { status: "error"; reason: string };

/**
 * Generate → verify → regenerate up to `maxAttempts`. Never ships a failing tile:
 * on an affirmative border/trait failure it regenerates; after exhausting all
 * attempts it returns a distinct error reason from the last failure. Grader
 * infra-nulls are fail-open (treated as pass by the checks).
 */
export async function runPortraitAttempts(opts: {
  generate: () => Promise<string>;
  grader: Grader;
  traits: PublicPortraitTraits | null;
  maxAttempts?: number;
}): Promise<AttemptOutcome> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastReason = "portrait_generation_failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let base64: string;
    try {
      base64 = await opts.generate();
    } catch (err) {
      lastReason = `generation_error: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    if (!base64) {
      lastReason = "generation_error: empty image";
      continue;
    }

    const border = await checkFlatBorder(opts.grader, base64);
    if (!border.ok) {
      lastReason = "failed_border_check";
      continue;
    }
    const visibility = await checkTraitVisibility(
      opts.grader,
      base64,
      opts.traits
    );
    if (!visibility.ok) {
      lastReason = "failed_trait_visibility";
      continue;
    }
    return { status: "ready", base64 };
  }

  return { status: "error", reason: lastReason };
}
