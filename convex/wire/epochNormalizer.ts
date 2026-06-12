import {
  DISPATCH_BODY_MAX_LENGTH,
  type Category,
  type Dispatch,
  type GeneratedNarrativeEpoch,
  type NarrativeEpoch,
} from "./_schemas";

export type NormalizedEpochResult = {
  epoch: NarrativeEpoch;
  repairedCategoryAliases: number;
};

const SENTENCE_END = /[.!?]["']?$/;

/**
 * Structured-output maxLength can hard-cut prose mid-sentence (or mid-character
 * at the old 180 cap). Trim back to the last sentence boundary when the body
 * does not end cleanly.
 */
export function trimIncompleteDispatchBody(
  body: string,
  maxLength: number = DISPATCH_BODY_MAX_LENGTH
): string {
  const trimmed = body.trimEnd();
  if (SENTENCE_END.test(trimmed)) return trimmed;

  const window = trimmed.slice(0, maxLength);
  const boundaryCandidates = [
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("."),
    window.lastIndexOf("!"),
    window.lastIndexOf("?"),
  ];
  const lastBoundary = Math.max(...boundaryCandidates);
  const minKeep = Math.min(maxLength * 0.4, 80);
  if (lastBoundary >= minKeep) {
    return window.slice(0, lastBoundary + 1).trimEnd();
  }

  return trimmed;
}

/**
 * Normalize a raw LLM epoch into the strict output shape. The model produces
 * prose only — there are no arc updates, material changes, deal seeds, or world
 * state to reconcile here. The one repair: the legacy "market" category alias.
 */
export function normalizeGeneratedEpoch(
  epoch: GeneratedNarrativeEpoch
): NormalizedEpochResult {
  let repairedCategoryAliases = 0;
  const dispatches = epoch.dispatches.map((dispatch): Dispatch => {
    if (dispatch.category === "market") repairedCategoryAliases++;
    const category: Category =
      dispatch.category === "market" ? "wire" : dispatch.category;
    return {
      ...dispatch,
      category,
      body: trimIncompleteDispatchBody(dispatch.body),
    };
  });

  return {
    epoch: {
      ...epoch,
      dispatches,
      confirmedFacts: epoch.confirmedFacts ?? undefined,
      openQuestions: epoch.openQuestions ?? undefined,
    },
    repairedCategoryAliases,
  };
}
