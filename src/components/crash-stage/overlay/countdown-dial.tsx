"use client";

import type { CountdownUrgency } from "@/components/crash-stage/scenes/countdown-scene";
import { formatCountdown } from "@/lib/utils";

const SIZE = 88;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const URGENCY_COLOR: Record<CountdownUrgency, string> = {
  calm: "var(--t-green-hot)",
  warn: "var(--t-urgency)",
  threat: "var(--t-threat)",
  locked: "var(--t-accent)",
};

export type CountdownDialProps = {
  /** Micro-label above the clock, e.g. "Entry closes in". */
  label: string | null;
  seconds: number | null;
  /** 0..1 fill of the active timeline segment; null = indeterminate ring. */
  progress: number | null;
  urgency: CountdownUrgency;
  locked?: boolean;
};

/**
 * Compact SVG countdown ring for the Floor HUD. Progress comes from the
 * RoundTimeline segment already computed by the theater — this component
 * never recomputes epoch math.
 */
export function CountdownDial({
  label,
  seconds,
  progress,
  urgency,
  locked = false,
}: CountdownDialProps) {
  const color = URGENCY_COLOR[urgency];
  const clamped = progress === null ? null : Math.min(1, Math.max(0, progress));
  const dashOffset =
    clamped === null ? CIRCUMFERENCE * 0.15 : CIRCUMFERENCE * (1 - clamped);
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
      className="pointer-events-none flex flex-col items-start"
      data-testid="countdown-dial"
      style={{ ["--mc-dial-color" as string]: color }}
    >
      {label ? (
        <p className="mb-0.5 max-w-[12rem] truncate text-left text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)]">
          {label}
        </p>
      ) : null}
      <div
        className={`relative ${isWarnOrThreat ? "mc-dial-halo" : ""}`}
        style={{ width: SIZE, height: SIZE }}
      >
        <svg
          aria-hidden="true"
          className="-rotate-90"
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            r={RADIUS}
            stroke="rgba(214,166,96,0.14)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            r={RADIUS}
            stroke={color}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={STROKE}
            style={{
              transition:
                "stroke-dashoffset var(--mc-dur-base) var(--mc-ease-out)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-[family-name:var(--font-plex-sans)] text-lg font-black tabular-nums tracking-tight ${
              isThreat ? "mc-dial-throb" : ""
            }`}
            key={seconds ?? "null"}
            style={{ color }}
          >
            <span className="mc-tick-pop">{display}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
