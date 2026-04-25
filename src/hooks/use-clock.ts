"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  const id = setInterval(onStoreChange, 1000);
  return () => clearInterval(id);
}

function getSnapshot() {
  return Date.now();
}

function getServerSnapshot(): number | null {
  return null;
}

/** Returns current time in ms, or null until first client tick. */
export function useClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
