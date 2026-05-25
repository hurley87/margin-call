"use client";

import { useMusic } from "@/hooks/use-music";

export function MusicPlayer() {
  const { playing, volume, togglePlay, setVolume } = useMusic();

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-[var(--t-muted)]">
      <span>♫</span>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause music" : "Play music"}
        className="inline-flex min-h-10 min-w-10 items-center justify-center border border-[var(--t-divider)] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
      >
        [{playing ? "■" : "▶"}]
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        aria-label="Music volume"
        className="h-1 w-12 cursor-pointer appearance-none bg-[var(--t-border)] accent-[var(--t-accent)] [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--t-accent)]"
      />
    </div>
  );
}
