"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getTheaterAudio, readTheaterSoundEnabled } from "@/lib/theater-audio";
import { theaterCopy } from "./theater-copy";

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return readTheaterSoundEnabled();
}

function getServerSnapshot() {
  return false;
}

function notifySoundListeners() {
  for (const listener of listeners) listener();
}

/**
 * Default-off sound toggle. Persists preference; creates AudioContext only on
 * the enabling click (required user gesture).
 */
export function TheaterSoundToggle() {
  const enabled = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const toggle = useCallback(() => {
    const next = !readTheaterSoundEnabled();
    getTheaterAudio().setEnabled(next);
    notifySoundListeners();
  }, []);

  return (
    <button
      aria-pressed={enabled}
      className="border border-[var(--t-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
      onClick={toggle}
      title={theaterCopy.soundHint}
      type="button"
    >
      {enabled ? theaterCopy.soundOn : theaterCopy.soundOff}
    </button>
  );
}
