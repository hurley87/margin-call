import type {
  Dispatch,
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
    if (dispatch.category === "market") {
      repairedCategoryAliases++;
      return { ...dispatch, category: "wire" };
    }
    return { ...dispatch, category: dispatch.category };
  });
  const categoryNormalizedEpoch: NarrativeEpoch = { ...epoch, dispatches };

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

  const dealSeedDispatches = categoryNormalizedEpoch.dispatches.filter(
    (d) => d.role === "deal_seed"
  );
  if (dealSeedDispatches.length !== 1) {
    return {
      epoch: categoryNormalizedEpoch,
      repairedDealSeedDispatchKey: null,
      repairedCategoryAliases,
    };
  }

  const repairedDispatchKey = dealSeedDispatches[0].dispatchKey;
  return {
    epoch: {
      ...categoryNormalizedEpoch,
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
