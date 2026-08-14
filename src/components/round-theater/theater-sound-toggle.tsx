"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getTheaterAudio,
  readTheaterSoundEnabled,
  subscribeTheaterSound,
} from "@/lib/theater-audio";
import { STAGE_HUD_CHIP_CLASS } from "@/lib/utils";
import { theaterCopy } from "./theater-copy";

const HINT_SEEN_KEY = "margin-call-sound-hint";

/**
 * Default-off sound toggle. Persists preference; creates AudioContext only on
 * the enabling click (required user gesture). When `suggest` is set (a replay
 * is on screen) and sound is off, it flashes once with a dismissable hint —
 * once per browser, ever.
 */
export function TheaterSoundToggle({
  suggest = false,
  className = STAGE_HUD_CHIP_CLASS,
}: {
  suggest?: boolean;
  className?: string;
}) {
  const enabled = useSyncExternalStore(
    subscribeTheaterSound,
    readTheaterSoundEnabled,
    () => false
  );
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!suggest || enabled) return;
    if (window.localStorage.getItem(HINT_SEEN_KEY) === "1") return;
    window.localStorage.setItem(HINT_SEEN_KEY, "1");
    const timer = window.setTimeout(() => setShowHint(true), 0);
    return () => window.clearTimeout(timer);
  }, [suggest, enabled]);

  const toggle = () => {
    setShowHint(false);
    getTheaterAudio().setEnabled(!enabled);
  };

  return (
    <div className="flex items-center gap-2">
      {showHint ? (
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--t-accent)]">
          {theaterCopy.soundAvailable}
          <button
            aria-label="Dismiss audio hint"
            className="text-[var(--t-muted)] hover:text-[var(--t-text)]"
            onClick={() => setShowHint(false)}
            type="button"
          >
            ✕
          </button>
        </span>
      ) : null}
      <button
        aria-pressed={enabled}
        className={`${className} ${showHint ? "mc-onboard-flash" : ""}`}
        onClick={toggle}
        title={theaterCopy.soundHint}
        type="button"
      >
        {enabled ? theaterCopy.soundOn : theaterCopy.soundOff}
      </button>
    </div>
  );
}
