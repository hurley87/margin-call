/**
 * Module store for Floor entry picks (Margin + Arcade Leverage). Survives dock
 * unmounts, round flips, and reloads via localStorage.
 */

import { useSyncExternalStore } from "react";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  ENTRY_MARGINS_TUSD,
} from "@/lib/margin-call-crash";

export const ENTRY_PREFS_STORAGE_KEY = "mc-entry-prefs";

export type EntryPreferences = {
  margin: bigint;
  leverageBps: bigint;
};

type Listener = () => void;

const listeners = new Set<Listener>();

const DEFAULT_PREFS: EntryPreferences = {
  margin: ENTRY_MARGINS_TUSD[0],
  leverageBps: ENTRY_LEVERAGE_TIERS_BPS[0],
};

let cached: EntryPreferences = { ...DEFAULT_PREFS };
let hydrated = false;

function notify() {
  for (const listener of [...listeners]) listener();
}

function isAllowedMargin(value: bigint): boolean {
  return (ENTRY_MARGINS_TUSD as readonly bigint[]).includes(value);
}

function isAllowedLeverage(value: bigint): boolean {
  return (ENTRY_LEVERAGE_TIERS_BPS as readonly bigint[]).includes(value);
}

/** Validate raw prefs; unknown values fall back to defaults. */
export function normalizeEntryPreferences(input: {
  margin?: bigint | string | null;
  leverageBps?: bigint | string | null;
}): EntryPreferences {
  let margin = DEFAULT_PREFS.margin;
  let leverageBps = DEFAULT_PREFS.leverageBps;

  if (input.margin !== undefined && input.margin !== null) {
    try {
      const parsed =
        typeof input.margin === "bigint" ? input.margin : BigInt(input.margin);
      if (isAllowedMargin(parsed)) margin = parsed;
    } catch {
      // keep default
    }
  }

  if (input.leverageBps !== undefined && input.leverageBps !== null) {
    try {
      const parsed =
        typeof input.leverageBps === "bigint"
          ? input.leverageBps
          : BigInt(input.leverageBps);
      if (isAllowedLeverage(parsed)) leverageBps = parsed;
    } catch {
      // keep default
    }
  }

  return { margin, leverageBps };
}

function readFromStorage(): EntryPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(ENTRY_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as {
      margin?: string;
      leverageBps?: string;
    };
    return normalizeEntryPreferences(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function writeToStorage(prefs: EntryPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ENTRY_PREFS_STORAGE_KEY,
      JSON.stringify({
        margin: prefs.margin.toString(),
        leverageBps: prefs.leverageBps.toString(),
      })
    );
  } catch {
    // Quota / private mode — keep in-memory prefs.
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  cached = readFromStorage();
}

function getSnapshot(): EntryPreferences {
  ensureHydrated();
  return cached;
}

function getServerSnapshot(): EntryPreferences {
  return DEFAULT_PREFS;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEntryPreferences(): EntryPreferences {
  return getSnapshot();
}

export function setEntryMargin(margin: bigint) {
  ensureHydrated();
  const next = normalizeEntryPreferences({
    margin,
    leverageBps: cached.leverageBps,
  });
  if (
    next.margin === cached.margin &&
    next.leverageBps === cached.leverageBps
  ) {
    return;
  }
  cached = next;
  writeToStorage(cached);
  notify();
}

export function setEntryLeverage(leverageBps: bigint) {
  ensureHydrated();
  const next = normalizeEntryPreferences({
    margin: cached.margin,
    leverageBps,
  });
  if (
    next.margin === cached.margin &&
    next.leverageBps === cached.leverageBps
  ) {
    return;
  }
  cached = next;
  writeToStorage(cached);
  notify();
}

/** Test helper — resets in-memory cache and optional storage. */
export function resetEntryPreferencesForTests() {
  cached = { ...DEFAULT_PREFS };
  hydrated = false;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(ENTRY_PREFS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notify();
}

export function useEntryPreferences(): EntryPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
