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
import { presentLanding, type TicketLanding } from "./landing-frame";
import { theaterCopy } from "./theater-copy";

const VIEW_W = 100;
const VIEW_H = 56;

export type ReplayCurveProps = {
  crashPointBps: bigint;
  progress: number;
  /** Open-phase previous-round ambiance (same hero size, labeled by round). */
  ambiance?: { roundId: bigint } | null;
  /** Signed-in player's Arcade Leverage tier, highlighted on the chart. */
  playerTierBps?: bigint | null;
  /** Personal vs spectator freeze once the climb completes. */
  landing?: TicketLanding;
  /** Floor outcome: fill the remaining viewport instead of a fixed hero height. */
  fill?: boolean;
};

/**
 * Every chart-slot state (live curve, empty, reduced-motion panel) shares this
 * footprint so the floor layout never jumps between phases.
 */
export const REPLAY_HERO_MIN_H = "min-h-[22rem] lg:min-h-[28rem]";

/**
 * SVG multiplier climb. Axes rescale with the live multiplier; hard stop at
 * the Crash Point. Signed-in players freeze on Won / Margin called; spectators
 * keep the Crash Point number and margin-call phone.
 */
export function ReplayCurve({
  crashPointBps,
  progress,
  ambiance = null,
  playerTierBps = null,
  landing = { kind: "spectator" },
  fill = false,
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

  // Crash-moment: climb finished and this is the result hero (not ambiance).
  // *When* freeze applies lives here; *what* it shows comes from presentLanding.
  const crashMoment = isComplete && !ambiance;
  const freeze = crashMoment ? presentLanding(landing, crashLabel) : null;

  const heroLabel = ambiance
    ? theaterCopy.openAmbiance(ambiance.roundId.toString())
    : (freeze?.heroLabel ?? theaterCopy.verifiedCrashPoint);
  const heroValue = freeze?.heroValue ?? displayMultiplier;
  const heroColor = freeze?.heroColorClass ?? "text-[var(--t-green-hot)]";
  const heroIsMultiplier = freeze?.heroIsMultiplier ?? true;

  return (
    <div
      className={`terminal-panel relative overflow-hidden p-3 sm:p-5 ${
        fill ? "flex h-full min-h-0 w-full flex-col" : REPLAY_HERO_MIN_H
      } ${crashMoment ? "mc-shake" : ""}`}
      data-testid={ambiance ? "replay-curve-ambiance" : "replay-curve"}
    >
      {freeze ? (
        <div
          aria-hidden="true"
          className="mc-moment-edge pointer-events-none absolute inset-0"
          style={
            { "--mc-moment-color": freeze.momentColor } as React.CSSProperties
          }
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
            {heroLabel}
          </p>
          <p
            aria-live="polite"
            className={`mc-live-value mt-1 font-[family-name:var(--font-plex-sans)] text-5xl font-bold sm:text-6xl lg:text-7xl ${
              heroIsMultiplier ? "tabular-nums" : ""
            } ${heroColor}`}
            data-testid={
              freeze
                ? landing.kind === "spectator"
                  ? "replay-curve-crash-point"
                  : "replay-curve-outcome"
                : undefined
            }
          >
            {heroValue}
          </p>
          {freeze?.supportingCrashPoint ? (
            <p
              className="mt-1 text-sm font-bold tabular-nums text-[var(--t-muted)]"
              data-testid="replay-curve-crash-point-supporting"
            >
              {freeze.supportingCrashPoint}
            </p>
          ) : null}
          {freeze?.outcomeDetail ? (
            <p className="mt-1 max-w-[20rem] text-[10px] leading-4 text-[var(--t-muted)]">
              {freeze.outcomeDetail}
            </p>
          ) : null}
        </div>
        {freeze?.showMarginCallStamp ? (
          <div className="flex items-center gap-3">
            <MarginCallPhone ringing />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-red-hot)]">
                {theaterCopy.marginCall}
              </p>
              {freeze.stampDetail ? (
                <p className="mt-1 max-w-[14rem] text-[10px] leading-4 text-[var(--t-muted)]">
                  {freeze.stampDetail}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <svg
        aria-hidden="true"
        className={
          fill
            ? "mt-2 min-h-[8rem] w-full flex-1"
            : "mt-4 h-[14rem] w-full sm:h-[18rem] lg:h-[22rem]"
        }
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
          const isPlayerTier = playerTierBps !== null && tier === playerTierBps;
          return (
            <g key={tier.toString()}>
              <line
                stroke={isPlayerTier ? "var(--t-accent)" : "var(--t-divider)"}
                strokeDasharray={isPlayerTier ? undefined : "1 1.5"}
                strokeWidth={isPlayerTier ? "0.4" : "0.25"}
                x1="0"
                x2={VIEW_W}
                y1={y}
                y2={y}
              />
              <text
                fill={isPlayerTier ? "var(--t-accent)" : "var(--t-muted)"}
                fontSize="2.4"
                fontWeight={isPlayerTier ? "bold" : undefined}
                x="1"
                y={Math.max(3, y - 1)}
              >
                {isPlayerTier
                  ? `${formatLeverageBps(tier)} · YOU`
                  : formatLeverageBps(tier)}
              </text>
              {closeAt <= progress ? (
                <circle
                  cx={closeAt * VIEW_W}
                  cy={y}
                  fill="var(--t-amber-hot)"
                  r={isPlayerTier ? 1.3 : 0.9}
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

      <p className="mt-2 text-[10px] leading-4 text-[var(--t-muted)]">
        {ambiance
          ? theaterCopy.openAmbianceNote
          : freeze && landing.kind !== "spectator"
            ? theaterCopy.outcomeGraphNote
            : `${theaterCopy.replayLabel}. ${theaterCopy.replayDetail}`}
      </p>
    </div>
  );
}

/**
 * Static history sparkline: the full curve at its final frame. Kept separate
 * from ReplayCurve so list rows skip the hero's multiplier/tier work.
 */
export function ReplayCurveThumb({ crashPointBps }: { crashPointBps: bigint }) {
  const { path, head } = useMemo(() => {
    const points = getReplayPathPoints(crashPointBps, 1, {
      width: VIEW_W,
      height: VIEW_H,
    });
    return {
      path: replayPathD(points),
      head: points[points.length - 1] ?? { x: 0, y: VIEW_H },
    };
  }, [crashPointBps]);

  return (
    <div
      aria-hidden="true"
      className="terminal-panel relative h-14 w-28 overflow-hidden p-1"
      data-testid="replay-curve-thumb"
    >
      <svg
        className="h-full w-full"
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

/**
 * Empty chart workspace while the round has no climb to show (delayed /
 * expired / loading). Keeps the floor from collapsing into a text block.
 */
export function ReplayCurveEmpty({
  title,
  body,
  testId,
  busy = false,
}: {
  title: string;
  body?: string;
  testId?: string;
  /** Loading state: adds a shimmer bar under the copy. */
  busy?: boolean;
}) {
  return (
    <div
      className={`terminal-panel relative flex flex-col justify-center overflow-hidden p-5 sm:p-8 ${REPLAY_HERO_MIN_H}`}
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
        {body ? (
          <p className="mt-3 text-xs leading-5 text-[var(--t-muted)]">{body}</p>
        ) : null}
        {busy ? (
          <div aria-hidden="true" className="mc-shimmer mt-4 h-1.5 w-48" />
        ) : null}
      </div>
    </div>
  );
}
