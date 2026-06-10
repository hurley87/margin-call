"use client";

import { useState } from "react";

import { collectNewIds } from "@/lib/new-item-ids";

type NewItemState = {
  /** Joined id signature of the last processed result; null until seeded. */
  signature: string | null;
  seen: ReadonlySet<string>;
  fresh: ReadonlyMap<string, number>;
};

const INITIAL_STATE: NewItemState = {
  signature: null,
  seen: new Set(),
  fresh: new Map(),
};

/**
 * Tracks which items appeared since the previous subscription result.
 * Returns a map of id → burst index (0 = newest) for items that should play
 * an arrival animation. The first non-undefined result seeds the seen set and
 * returns an empty map, so initial loads and refetches never animate.
 */
export function useNewItemIds<T>(
  items: readonly T[] | undefined,
  getId: (item: T) => string
): ReadonlyMap<string, number> {
  const [state, setState] = useState<NewItemState>(INITIAL_STATE);

  if (items !== undefined) {
    const ids = items.map(getId);
    const signature = ids.join("\n");
    if (state.signature === null) {
      setState({ signature, seen: new Set(ids), fresh: new Map() });
    } else if (signature !== state.signature) {
      const { fresh, seen } = collectNewIds(state.seen, ids);
      setState({
        signature,
        seen,
        // Keep the previous batch marked when nothing new arrived (e.g. an
        // item dropped off the list) so in-flight animations aren't cut.
        fresh: fresh.size > 0 ? fresh : state.fresh,
      });
    }
  }

  return state.fresh;
}
