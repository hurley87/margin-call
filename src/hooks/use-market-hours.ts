"use client";

import { useMemo } from "react";

import { useSecondTick } from "@/hooks/use-second-tick";
import { getTradingHoursState } from "../../convex/lib/tradingHours";

/**
 * Live NYSE trading-hours state for UI affordances. The underlying state
 * object is memoised per-minute (`isOpen`, `nextOpenAt`, `nextCloseAt` only
 * change at minute boundaries), but `countdownLabel` ticks every second.
 */
export function useMarketHours(): { isOpen: boolean; countdownLabel: string } {
  const nowMs = useSecondTick();
  const minuteBucket = Math.floor(nowMs / 60_000);
  const state = useMemo(
    () => getTradingHoursState(nowMs),
    // Re-derive only on minute boundaries — formatter calls and object
    // identity stay stable for the other 59 ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minuteBucket]
  );

  const target = state.isOpen ? state.nextCloseAt : state.nextOpenAt;
  const remainingMs = target !== undefined ? Math.max(0, target - nowMs) : 0;
  const totalSec = Math.floor(remainingMs / 1000);
  const rh = Math.floor(totalSec / 3600);
  const rm = Math.floor((totalSec % 3600) / 60);
  const rs = totalSec % 60;
  const countdownLabel = `${rh}:${String(rm).padStart(2, "0")}:${String(rs).padStart(2, "0")}`;

  return { isOpen: state.isOpen, countdownLabel };
}
