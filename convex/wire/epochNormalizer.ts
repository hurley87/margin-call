import type { NarrativeEpoch } from "./_schemas";

export type NormalizedEpochResult = {
  epoch: NarrativeEpoch;
  repairedDealSeedDispatchKey: {
    from: string;
    to: string;
  } | null;
};

export function normalizeGeneratedEpoch(
  epoch: NarrativeEpoch
): NormalizedEpochResult {
  const { dealSeed } = epoch;
  if (!dealSeed) {
    return { epoch, repairedDealSeedDispatchKey: null };
  }

  const matchingDispatches = epoch.dispatches.filter(
    (d) => d.dispatchKey === dealSeed.dispatchKey
  );
  if (
    matchingDispatches.length > 1 ||
    (matchingDispatches.length === 1 &&
      matchingDispatches[0].role === "deal_seed")
  ) {
    return { epoch, repairedDealSeedDispatchKey: null };
  }

  const dealSeedDispatches = epoch.dispatches.filter(
    (d) => d.role === "deal_seed"
  );
  if (dealSeedDispatches.length !== 1) {
    return { epoch, repairedDealSeedDispatchKey: null };
  }

  const repairedDispatchKey = dealSeedDispatches[0].dispatchKey;
  return {
    epoch: {
      ...epoch,
      dealSeed: {
        ...dealSeed,
        dispatchKey: repairedDispatchKey,
      },
    },
    repairedDealSeedDispatchKey: {
      from: dealSeed.dispatchKey,
      to: repairedDispatchKey,
    },
  };
}
