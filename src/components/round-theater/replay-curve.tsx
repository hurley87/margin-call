"use client";

import { useMemo } from "react";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatCrashPointBps,
  formatLeverageBps,
} from "@/lib/margin-call-crash";
import {
  getReplayMultiplierBps,
  getReplayPath,
  getTierCloseProgress,
} from "@/lib/round-replay";
import { MarginCallPhone } from "./margin-call-phone";
import { theaterCopy } from "./theater-copy";

const VIEW_W = 100;
const VIEW_H = 56;

export type ReplayCurveProps = {
  crashPointBps: bigint;
  progress: number;
  /** Dimmed looping ambiance mode (Open phase). */
  ambiance?: boolean;
};

/**
 * SVG multiplier climb. Axes rescale with the live multiplier; hard stop at
 * the Crash Point with a margin-call phone stamp.
 */
export function ReplayCurve({
  crashPointBps,
  progress,
  ambiance = false,
}: ReplayCurveProps) {
  const path = useMemo(
    () =>
      getReplayPath(crashPointBps, progress, { width: VIEW_W, height: VIEW_H }),
    [crashPointBps, progress]
  );
  const multiplierBps = getReplayMultiplierBps(progress, crashPointBps);
  const displayMultiplier = formatCrashPointBps(multiplierBps);
  const isComplete = progress >= 1;
  const crashLabel = formatCrashPointBps(crashPointBps);

  const head = useMemo(() => {
    // Approximate head from the final path command.
    const match = /([\d.]+)\s+([\d.]+)$/.exec(path);
    if (!match) return { x: 0, y: VIEW_H };
    return { x: Number(match[1]), y: Number(match[2]) };
  }, [path]);

  const tierLines = ENTRY_LEVERAGE_TIERS_BPS.filter((tier) => {
    const closeAt = getTierCloseProgress(tier, crashPointBps);
    return closeAt !== null;
  });

  return (
    <div
      className={`terminal-panel relative overflow-hidden p-3 sm:p-4 ${ambiance ? "opacity-70" : ""}`}
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
            className={`mc-live-value mt-1 font-[family-name:var(--font-plex-sans)] text-4xl font-bold tabular-nums sm:text-5xl ${
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
        className="mt-4 h-40 w-full sm:h-52"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        <defs>
          <linearGradient id="replay-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--t-green)" />
            <stop offset="100%" stopColor="var(--t-green-hot)" />
          </linearGradient>
        </defs>
        {tierLines.map((tier) => {
          const closeAt = getTierCloseProgress(tier, crashPointBps) ?? 0;
          const y =
            VIEW_H -
            ((Number(tier) / 10_000 - 1) /
              ((Number(crashPointBps < 10_000n ? 10_000n : crashPointBps) /
                10_000) *
                1.08 -
                1)) *
              VIEW_H;
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
