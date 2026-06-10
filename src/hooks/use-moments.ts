"use client";

import { useCallback, useState } from "react";

import { useNewItemIds } from "@/hooks/use-new-item-ids";
import { BIG_MOVE_USDC } from "@/lib/motion-tokens";
import {
  selectMoment,
  type Moment,
  type MomentActivitySource,
} from "@/lib/moments";

type MomentsState = {
  /** Identity of the last fresh-batch map already turned into a moment. */
  processedBatch: ReadonlyMap<string, number> | null;
  queue: readonly Moment[];
  current: Moment | null;
};

/**
 * Watches desk-scoped activity for ceremony-worthy events (wipeouts, big
 * wins/losses) and plays them one at a time. Initial load never fires
 * (seeding handled by useNewItemIds); bursts coalesce to one moment.
 */
export function useMoments(params: {
  activity: readonly MomentActivitySource[] | undefined;
  traderNames: Record<string, string>;
}): { current: Moment | null; dismiss: () => void } {
  const fresh = useNewItemIds(params.activity, (entry) => entry.id);
  const [state, setState] = useState<MomentsState>({
    processedBatch: null,
    queue: [],
    current: null,
  });

  // Render-phase adjustment: each fresh batch is processed exactly once
  // (batch map identity is stable until the next batch arrives).
  if (
    fresh.size > 0 &&
    fresh !== state.processedBatch &&
    params.activity !== undefined
  ) {
    const newEntries = params.activity.filter((entry) => fresh.has(entry.id));
    const moment = selectMoment(newEntries, params.traderNames, {
      bigMoveUsdc: BIG_MOVE_USDC,
    });
    setState((current) => {
      if (current.processedBatch === fresh) return current;
      if (moment === null) return { ...current, processedBatch: fresh };
      if (current.current === null) {
        return { ...current, processedBatch: fresh, current: moment };
      }
      return {
        ...current,
        processedBatch: fresh,
        queue: [...current.queue, moment],
      };
    });
  }

  const dismiss = useCallback(() => {
    setState((current) => ({
      ...current,
      current: current.queue[0] ?? null,
      queue: current.queue.slice(1),
    }));
  }, []);

  return { current: state.current, dismiss };
}
