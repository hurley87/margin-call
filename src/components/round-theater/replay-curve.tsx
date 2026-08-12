"use client";

import { useMemo } from "react";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatCrashPointBps,
  formatLeverageBps,
} from "@/lib/margin-call-crash";
import {
  getReplayMultiplierBps,
  getReplayPathPoints,
  getTierCloseProgress,
  isReplayComplete,
  multiplierToY,
  replayPathD,
} from "@/lib/round-replay";
import { MarginCallPhone } from "./margin-call-phone";
import { theaterCopy } from "./theater-copy";

const VIEW_W = 100;
const VIEW_H = 56;

export type ReplayCurveSize = "hero" | "thumb";

export type ReplayCurveProps = {
  crashPointBps: bigint;
  progress: number;
  /** Open-phase previous-round ambiance (same hero size, different label). */
  ambiance?: boolean;
  size?: ReplayCurveSize;
};

const sizeClass: Record<ReplayCurveSize, string> = {
  hero: "min-h-[22rem] lg:min-h-[28rem]",
  thumb: "h-14 w-28",
};

const svgClass: Record<ReplayCurveSize, string> = {
  hero: "mt-4 h-[14rem] w-full sm:h-[18rem] lg:h-[22rem]",
  thumb: "h-full w-full",
};

/**
 * SVG multiplier climb. Axes rescale with the live multiplier; hard stop at
 * the Crash Point with a margin-call phone stamp.
 */
export function ReplayCurve({
  crashPointBps,
  progress,
  ambiance = false,
  size = "hero",
}: ReplayCurveProps) {
  // `progress` moves every animation frame, so memoizing on it buys nothing.
  const points = getReplayPathPoints(crashPointBps, progress, {
    width: VIEW_W,
    height: VIEW_H,
  });
  const path = replayPathD(points);
  const head = points[points.length - 1] ?? { x: 0, y: VIEW_H };
  const multiplierBps = getReplayMultiplierBps(progress, crashPointBps);
  const displayMultiplier = formatCrashPointBps(multiplierBps);
  const isComplete = isReplayComplete(progress);
  const crashLabel = formatCrashPointBps(crashPointBps);
  const isThumb = size === "thumb";

  const tierLines = useMemo(
    () =>
      ENTRY_LEVERAGE_TIERS_BPS.flatMap((tier) => {
        const closeAt = getTierCloseProgress(tier, crashPointBps);
        if (closeAt === null) return [];
        return [
          { tier, closeAt, y: multiplierToY(tier, crashPointBps, VIEW_H) },
        ];
      }),
    [crashPointBps]
  );

  if (isThumb) {
    return (
      <div
        aria-hidden="true"
        className={`terminal-panel relative overflow-hidden p-1 ${sizeClass.thumb}`}
        data-testid="replay-curve-thumb"
      >
        <svg
          className={svgClass.thumb}
          preserveAspectRatio="none"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          <path
            d={path}
            fill="none"
            stroke="var(--t-green-hot)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
          <circle cx={head.x} cy={head.y} fill="var(--t-red-hot)" r="1.6" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`terminal-panel relative overflow-hidden p-3 sm:p-5 ${sizeClass.hero}`}
      data-testid={ambiance ? "replay-curve-ambiance" : "replay-curve"}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
            {ambiance
              ? theaterCopy.openAmbiance
              : theaterCopy.verifiedCrashPoint}
          </p>
          <p
            aria-live="polite"
            className={`mc-live-value mt-1 font-[family-name:var(--font-plex-sans)] text-5xl font-bold tabular-nums sm:text-6xl lg:text-7xl ${
              isComplete
                ? "text-[var(--t-red-hot)]"
                : "text-[var(--t-green-hot)]"
            }`}
          >
            {isComplete ? crashLabel : displayMultiplier}
          </p>
        </div>
        {isComplete && !ambiance ? (
          <div className="flex items-center gap-3">
            <MarginCallPhone ringing />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-red-hot)]">
                {theaterCopy.marginCall}
              </p>
              <p className="mt-1 max-w-[14rem] text-[10px] leading-4 text-[var(--t-muted)]">
                {theaterCopy.marginCallDetail}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <svg
        aria-hidden="true"
        className={svgClass.hero}
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        <defs>
          <linearGradient id="replay-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--t-green)" />
            <stop offset="100%" stopColor="var(--t-green-hot)" />
          </linearGradient>
        </defs>
        {tierLines.map(({ tier, closeAt, y }) => {
          return (
            <g key={tier.toString()}>
              <line
                stroke="var(--t-divider)"
                strokeDasharray="1 1.5"
                strokeWidth="0.25"
                x1="0"
                x2={VIEW_W}
                y1={y}
                y2={y}
              />
              <text
                fill="var(--t-muted)"
                fontSize="2.4"
                x="1"
                y={Math.max(3, y - 1)}
              >
                {formatLeverageBps(tier)}
              </text>
              {closeAt <= progress ? (
                <circle
                  cx={closeAt * VIEW_W}
                  cy={y}
                  fill="var(--t-amber-hot)"
                  r="0.9"
                />
              ) : null}
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke="url(#replay-stroke)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.1"
        />
        <circle
          className={isComplete ? "mc-margin-call-flash" : ""}
          cx={head.x}
          cy={head.y}
          fill={isComplete ? "var(--t-red-hot)" : "var(--t-green-hot)"}
          r="1.4"
        />
      </svg>

      {!ambiance ? (
        <p className="mt-2 text-[10px] leading-4 text-[var(--t-muted)]">
          {theaterCopy.replayLabel}. {theaterCopy.replayDetail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Empty chart workspace while the round has no climb to show (delayed /
 * expired / loading). Keeps the floor from collapsing into a text block.
 */
export function ReplayCurveEmpty({
  title,
  body,
  testId,
}: {
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <div
      className="terminal-panel relative flex min-h-[22rem] flex-col justify-center overflow-hidden p-5 sm:p-8 lg:min-h-[28rem]"
      data-testid={testId}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        {[0.2, 0.4, 0.6, 0.8].map((t) => (
          <line
            key={t}
            stroke="var(--t-divider)"
            strokeDasharray="1 2"
            strokeWidth="0.25"
            x1="0"
            x2={VIEW_W}
            y1={VIEW_H * t}
            y2={VIEW_H * t}
          />
        ))}
      </svg>
      <div className="relative max-w-xl">
        <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
          Round status
        </p>
        <p className="mt-3 font-[family-name:var(--font-plex-sans)] text-2xl font-bold text-[var(--t-amber-hot)] sm:text-3xl">
          {title}
        </p>
        <p className="mt-3 text-xs leading-5 text-[var(--t-muted)]">{body}</p>
      </div>
    </div>
  );
}
