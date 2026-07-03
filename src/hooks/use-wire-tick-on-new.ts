"use client";

import { useEffect } from "react";

import { useNewItemIds } from "@/hooks/use-new-item-ids";
import { useSfx } from "@/hooks/use-sfx";

/**
 * Tracks newly-arrived feed items and plays the wire-tick sound when any appear.
 * Returns the id → burst-index map from {@link useNewItemIds} for arrival
 * animations. Pass `undefined` while loading so initial loads stay silent.
 */
export function useWireTickOnNew<T>(
  items: readonly T[] | undefined,
  getId: (item: T) => string
): ReadonlyMap<string, number> {
  const newIds = useNewItemIds(items, getId);
  const { playWireTick } = useSfx();
  useEffect(() => {
    if (newIds.size > 0) playWireTick();
  }, [newIds, playWireTick]);
  return newIds;
}
