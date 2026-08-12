"use client";

import { useSyncExternalStore } from "react";
import {
  getTheaterAudio,
  readTheaterSoundEnabled,
  subscribeTheaterSound,
} from "@/lib/theater-audio";
import { theaterCopy } from "./theater-copy";

/**
 * Default-off sound toggle. Persists preference; creates AudioContext only on
 * the enabling click (required user gesture).
 */
export function TheaterSoundToggle() {
  const enabled = useSyncExternalStore(
    subscribeTheaterSound,
    readTheaterSoundEnabled,
    () => false
  );

  const toggle = () => {
    getTheaterAudio().setEnabled(!enabled);
  };

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
