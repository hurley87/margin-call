import type {
  Category,
  Dispatch,
  MaterialChange,
  GeneratedNarrativeEpoch,
  NarrativeEpoch,
} from "./_schemas";

export type NormalizedEpochResult = {
  epoch: NarrativeEpoch;
  repairedDealSeedDispatchKey: {
    from: string;
    to: string;
  } | null;
  repairedCategoryAliases: number;
};

export function normalizeGeneratedEpoch(
  epoch: GeneratedNarrativeEpoch
): NormalizedEpochResult {
  let repairedCategoryAliases = 0;
  const dispatches = epoch.dispatches.map((dispatch): Dispatch => {
    const materialChange = normalizeMaterialChange(dispatch.materialChange);
    const isSeed = isDealSeedDispatch(dispatch);
    if (dispatch.category === "market") repairedCategoryAliases++;

    const category: Category = isSeed
      ? "deal_seed"
      : dispatch.category === "market"
        ? "wire"
        : dispatch.category;
    const role = isSeed ? "deal_seed" : dispatch.role;
    return { ...dispatch, category, role, materialChange };
  });
  const categoryNormalizedEpoch: NarrativeEpoch = {
    ...epoch,
    dispatches,
    arcUpdates:
      epoch.arcUpdates?.map(({ phase, ...rest }) =>
        phase ? { ...rest, phase } : rest
      ) ?? null,
    confirmedFacts: epoch.confirmedFacts ?? undefined,
    openQuestions: epoch.openQuestions ?? undefined,
  };

  const { dealSeed } = categoryNormalizedEpoch;
  if (!dealSeed) {
    return {
      epoch: categoryNormalizedEpoch,
      repairedDealSeedDispatchKey: null,
      repairedCategoryAliases,
    };
  }

  const matchingDispatches = categoryNormalizedEpoch.dispatches.filter(
    (d) => d.dispatchKey === dealSeed.dispatchKey
  );
  if (
    matchingDispatches.length > 1 ||
    (matchingDispatches.length === 1 &&
      matchingDispatches[0].role === "deal_seed")
  ) {
    return {
      epoch: categoryNormalizedEpoch,
      repairedDealSeedDispatchKey: null,
      repairedCategoryAliases,
    };
  }

  const repairCandidate = findDealSeedRepairCandidate(
    categoryNormalizedEpoch.dispatches
  );
  if (!repairCandidate) {
    return {
      epoch: categoryNormalizedEpoch,
      repairedDealSeedDispatchKey: null,
      repairedCategoryAliases,
    };
  }

  const repairedDispatchKey = repairCandidate.dispatchKey;
  return {
    epoch: {
      ...categoryNormalizedEpoch,
      dispatches: categoryNormalizedEpoch.dispatches.map((dispatch) =>
        dispatch.dispatchKey === repairedDispatchKey
          ? { ...dispatch, category: "deal_seed", role: "deal_seed" }
          : dispatch
      ),
      dealSeed: {
        ...dealSeed,
        dispatchKey: repairedDispatchKey,
      },
    },
    repairedDealSeedDispatchKey: {
      from: dealSeed.dispatchKey,
      to: repairedDispatchKey,
    },
    repairedCategoryAliases,
  };
}

function isDealSeedDispatch(dispatch: {
  role: string;
  category: string;
}): boolean {
  return dispatch.role === "deal_seed" || dispatch.category === "deal_seed";
}

function findDealSeedRepairCandidate(dispatches: Dispatch[]): Dispatch | null {
  const explicitCandidates = dispatches.filter(isDealSeedDispatch);
  if (explicitCandidates.length === 1) return explicitCandidates[0];
  if (explicitCandidates.length > 1) return null;

  const nonMainCandidates = dispatches.filter(
    (dispatch) => dispatch.role !== "main"
  );
  return nonMainCandidates.length === 1 ? nonMainCandidates[0] : null;
}

function normalizeMaterialChange(
  materialChange: GeneratedNarrativeEpoch["dispatches"][number]["materialChange"]
): MaterialChange | null {
  if (!materialChange) return null;

  const { magnitude, ...rest } = materialChange;
  if (!magnitude) return rest;

  const { unitsUsdc, label } = magnitude;
  if (unitsUsdc == null && label == null) return rest;

  return {
    ...rest,
    magnitude: {
      ...(unitsUsdc != null ? { unitsUsdc } : {}),
      ...(label != null ? { label } : {}),
    },
  };
}
