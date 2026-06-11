import type {
  Category,
  Dispatch,
  GeneratedNarrativeEpoch,
  NarrativeEpoch,
} from "./_schemas";

export type NormalizedEpochResult = {
  epoch: NarrativeEpoch;
  repairedCategoryAliases: number;
};

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
    return { ...dispatch, category };
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
