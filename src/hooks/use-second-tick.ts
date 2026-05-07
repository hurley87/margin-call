"use client";

import { useEffect, useState } from "react";

/**
 * Client-only clock tick for display (e.g. countdown labels). Does not trigger backend work.
 */
export function useSecondTick(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return nowMs;
}
