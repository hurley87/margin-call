"use client";

import { Volume2, VolumeX } from "lucide-react";

import { MusicPlayer } from "@/components/music-player";
import { useSfx } from "@/hooks/use-sfx";

const SLIDER_CLASS =
  "h-1 w-12 cursor-pointer appearance-none bg-[var(--t-border)] accent-[var(--t-accent)] [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--t-accent)]";

/**
 * Co-located audio controls: background music (play/volume) plus the global
 * SFX mute and volume. All preferences persist to localStorage and stay in
 * sync across every consumer via the shared useSfx store.
 */
export function SoundControls() {
  const sfx = useSfx();

  return (
    <div className="flex items-center gap-3">
      <MusicPlayer />
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--t-muted)]">
        <button
          type="button"
          onClick={sfx.toggleEnabled}
          title={sfx.enabled ? "Mute sound effects" : "Enable sound effects"}
          aria-label={
            sfx.enabled ? "Mute sound effects" : "Enable sound effects"
          }
          aria-pressed={sfx.enabled}
          className="grid h-9 w-9 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)]"
        >
          {sfx.enabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sfx.volume}
          onChange={(event) => sfx.setVolume(parseFloat(event.target.value))}
          aria-label="Sound effects volume"
          className={SLIDER_CLASS}
        />
      </div>
    </div>
  );
}
