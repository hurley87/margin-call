"use client";

import type { CountdownUrgency } from "@/components/crash-stage/scenes/countdown-scene";
import { formatCountdown } from "@/lib/utils";

const URGENCY_COLOR: Record<CountdownUrgency, string> = {
  calm: "var(--t-green-hot)",
  warn: "var(--t-urgency)",
  threat: "var(--t-threat)",
  locked: "var(--t-accent)",
};

export type CountdownBannerProps = {
  /** Micro-label beside the clock, e.g. "Entry closes in". */
  label: string | null;
  seconds: number | null;
  /** 0..1 fill of the active timeline segment; null = no fill. */
  progress: number | null;
  urgency: CountdownUrgency;
  locked?: boolean;
};

/**
 * Full-bleed countdown strip under the Floor header. Progress comes from the
 * RoundTimeline segment already computed by the theater — this component
 * never recomputes epoch math. Fill sweeps left to right behind centered copy.
 */
export function CountdownBanner({
  label,
  seconds,
  progress,
  urgency,
  locked = false,
}: CountdownBannerProps) {
  const color = URGENCY_COLOR[urgency];
  const clamped = progress === null ? null : Math.min(1, Math.max(0, progress));
  const display =
    locked && seconds === null
      ? "LOCKED"
      : seconds === null
        ? "—"
        : formatCountdown(seconds);
  const isThreat = urgency === "threat";
  const isWarnOrThreat = urgency === "warn" || isThreat;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none relative shrink-0 overflow-hidden border-b border-[var(--t-border)]/60 bg-[var(--t-panel-strong)]/70 backdrop-blur-sm"
      data-testid="countdown-banner"
      style={{ ["--mc-dial-color" as string]: color }}
    >
      {clamped !== null ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 origin-left"
            style={{
              transform: `scaleX(${clamped})`,
              background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${color} 18%, transparent))`,
              transition: "transform var(--mc-dur-base) var(--mc-ease-out)",
            }}
          />
          <div
            aria-hidden="true"
            className={`absolute top-0 bottom-0 w-px ${
              isWarnOrThreat ? "mc-dial-halo" : ""
            }`}
            style={{
              left: `${clamped * 100}%`,
              background: color,
              transition: "left var(--mc-dur-base) var(--mc-ease-out)",
              boxShadow: `0 0 8px ${color}`,
            }}
          />
        </>
      ) : null}

      <div className="relative z-10 flex items-center justify-center gap-3 px-3 py-2 sm:gap-4 sm:px-6 sm:py-2.5">
        {label ? (
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)] sm:text-[10px]">
            {label}
          </p>
        ) : null}
        <span
          className={`font-[family-name:var(--font-plex-sans)] text-lg font-black tabular-nums tracking-tight sm:text-xl ${
            isThreat ? "mc-dial-throb" : ""
          }`}
          key={seconds ?? "null"}
          style={{ color }}
        >
          <span className="mc-tick-pop">{display}</span>
        </span>
      </div>
    </div>
  );
}
