"use client";

import { useId, useMemo } from "react";
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
  replayAreaPathD,
  replayPathD,
} from "@/lib/round-replay";
import { MarginCallPhone } from "./margin-call-phone";
import { presentLanding, type TicketLanding } from "./landing-frame";
import { theaterCopy } from "./theater-copy";

const VIEW_W = 100;
const VIEW_H = 56;
/** Extra room so strokes, the head badge, and a missed-YOU rail never clip. */
const PAD_X = 2;
const PAD_Y = 4;
const LABEL_MIN_GAP_PCT = 10;
/** Top rail for a player tier that never closed (above the Crash Point). */
const MISSED_YOU_Y = 1.5;

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

type TierAnnotation = {
  tier: bigint;
  closeAt: number;
  y: number;
  isPlayerTier: boolean;
  showLabel: boolean;
};

/**
 * Map a viewBox coordinate into a percentage of the padded plot area so the
 * DOM overlay stays locked to the stretched SVG geometry.
 */
function plotPct(value: number, size: number, pad: number): number {
  return ((value + pad) / (size + pad * 2)) * 100;
}

function pickVisibleTier(
  tiers: readonly { tier: bigint; closeAt: number; y: number }[],
  playerTierBps: bigint | null
): TierAnnotation[] {
  const heightPct = (y: number) => plotPct(y, VIEW_H, PAD_Y);
  const sorted = [...tiers].sort((a, b) => a.y - b.y);
  const placed: number[] = [];
  const visible = new Set<string>();

  const tryPlace = (tier: (typeof tiers)[number]) => {
    const pct = heightPct(tier.y);
    if (
      placed.some((existing) => Math.abs(existing - pct) < LABEL_MIN_GAP_PCT)
    ) {
      return;
    }
    placed.push(pct);
    visible.add(tier.tier.toString());
  };

  const player = sorted.find(
    (t) => playerTierBps !== null && t.tier === playerTierBps
  );
  if (player) tryPlace(player);
  for (const tier of sorted) {
    if (player && tier.tier === player.tier) continue;
    tryPlace(tier);
  }

  return tiers.map((tier) => ({
    ...tier,
    isPlayerTier: playerTierBps !== null && tier.tier === playerTierBps,
    showLabel: visible.has(tier.tier.toString()),
  }));
}

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
  const reactId = useId();
  const strokeId = `replay-stroke-${reactId}`;
  const areaId = `replay-area-${reactId}`;
  const glowId = `replay-glow-${reactId}`;

  // `progress` moves every animation frame, so memoizing on it buys nothing.
  const points = getReplayPathPoints(crashPointBps, progress, {
    width: VIEW_W,
    height: VIEW_H,
  });
  const path = replayPathD(points);
  const areaPath = replayAreaPathD(points, VIEW_H);
  const head = points[points.length - 1] ?? { x: 0, y: VIEW_H };
  const multiplierBps = getReplayMultiplierBps(progress, crashPointBps);
  const displayMultiplier = formatCrashPointBps(multiplierBps);
  const isComplete = isReplayComplete(progress);
  const crashLabel = formatCrashPointBps(crashPointBps);

  const tierLines = useMemo(
    () =>
      pickVisibleTier(
        ENTRY_LEVERAGE_TIERS_BPS.flatMap((tier) => {
          const closeAt = getTierCloseProgress(tier, crashPointBps);
          if (closeAt === null) return [];
          return [
            { tier, closeAt, y: multiplierToY(tier, crashPointBps, VIEW_H) },
          ];
        }),
        playerTierBps
      ),
    [crashPointBps, playerTierBps]
  );

  const missedYou =
    playerTierBps !== null &&
    getTierCloseProgress(playerTierBps, crashPointBps) === null
      ? {
          tier: playerTierBps,
          y: MISSED_YOU_Y,
          label: `${formatLeverageBps(playerTierBps)} · YOU`,
        }
      : null;

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
  const isWinFreeze = freeze !== null && landing.kind === "won";
  const isLossFreeze = freeze !== null && landing.kind === "margin-called";
  const headColor =
    isComplete &&
    (landing.kind === "margin-called" || landing.kind === "spectator")
      ? "var(--t-red-hot)"
      : "var(--t-green-hot)";

  const headLeft = plotPct(head.x, VIEW_W, PAD_X);
  const headTop = plotPct(head.y, VIEW_H, PAD_Y);
  const baselineTop = plotPct(VIEW_H, VIEW_H, PAD_Y);
  const crashY = multiplierToY(crashPointBps, crashPointBps, VIEW_H);

  return (
    <div
      className={`terminal-panel relative overflow-hidden p-3 sm:p-5 ${
        fill ? "flex h-full min-h-0 w-full flex-col" : REPLAY_HERO_MIN_H
      } ${crashMoment ? "mc-shake" : ""} ${
        isWinFreeze
          ? "shadow-[inset_0_0_56px_rgba(146,245,184,0.16)]"
          : isLossFreeze
            ? "shadow-[inset_0_0_56px_rgba(255,107,92,0.14)]"
            : ""
      }`}
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
            className={`mc-live-value mt-1 font-[family-name:var(--font-plex-sans)] font-bold ${
              fill ? "text-5xl sm:text-6xl" : "text-5xl sm:text-6xl lg:text-7xl"
            } ${heroIsMultiplier ? "tabular-nums" : ""} ${heroColor}`}
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

      <div
        className={
          fill
            ? "relative mt-3 min-h-[13rem] w-full flex-1"
            : "relative mt-4 h-[14rem] w-full sm:h-[18rem] lg:h-[22rem]"
        }
      >
        <svg
          aria-hidden="true"
          className="h-full w-full"
          preserveAspectRatio="none"
          viewBox={`${-PAD_X} ${-PAD_Y} ${VIEW_W + PAD_X * 2} ${VIEW_H + PAD_Y * 2}`}
        >
          <defs>
            <linearGradient id={strokeId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--t-green)" />
              <stop
                offset="100%"
                stopColor={
                  isComplete && !isWinFreeze
                    ? "var(--t-red-hot)"
                    : "var(--t-green-hot)"
                }
              />
            </linearGradient>
            <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor={
                  isComplete && !isWinFreeze
                    ? "var(--t-red-hot)"
                    : "var(--t-green-hot)"
                }
                stopOpacity="0.42"
              />
              <stop
                offset="55%"
                stopColor={
                  isComplete && !isWinFreeze
                    ? "var(--t-red-hot)"
                    : "var(--t-green-hot)"
                }
                stopOpacity="0.12"
              />
              <stop
                offset="100%"
                stopColor={
                  isComplete && !isWinFreeze
                    ? "var(--t-red-hot)"
                    : "var(--t-green-hot)"
                }
                stopOpacity="0"
              />
            </linearGradient>
            <filter
              filterUnits="userSpaceOnUse"
              height={VIEW_H + PAD_Y * 4}
              id={glowId}
              width={VIEW_W + PAD_X * 4}
              x={-PAD_X * 2}
              y={-PAD_Y * 2}
            >
              <feGaussianBlur stdDeviation="1.1" />
            </filter>
          </defs>

          {/* Soft plot grid */}
          {[0.2, 0.4, 0.6, 0.8].map((t) => (
            <line
              key={`bg-${t}`}
              stroke="var(--t-divider)"
              strokeWidth="0.75"
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2={VIEW_W}
              y1={VIEW_H * t}
              y2={VIEW_H * t}
            />
          ))}
          <line
            stroke="var(--t-divider)"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={VIEW_W}
            y1={VIEW_H}
            y2={VIEW_H}
          />

          {missedYou ? (
            <line
              stroke="var(--t-red-hot)"
              strokeDasharray="2 2"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2={VIEW_W}
              y1={missedYou.y}
              y2={missedYou.y}
            />
          ) : null}

          {tierLines.map(({ tier, y, isPlayerTier }) => (
            <g key={`grid-${tier.toString()}`}>
              {isPlayerTier ? (
                <line
                  opacity="0.22"
                  stroke="var(--t-accent)"
                  strokeWidth="8"
                  vectorEffect="non-scaling-stroke"
                  x1="0"
                  x2={VIEW_W}
                  y1={y}
                  y2={y}
                />
              ) : null}
              <line
                stroke={isPlayerTier ? "var(--t-accent)" : "var(--t-divider)"}
                strokeDasharray={isPlayerTier ? undefined : "2 2.5"}
                strokeWidth={isPlayerTier ? "2" : "1"}
                vectorEffect="non-scaling-stroke"
                x1="0"
                x2={VIEW_W}
                y1={y}
                y2={y}
              />
            </g>
          ))}

          {areaPath ? (
            <path d={areaPath} fill={`url(#${areaId})`} stroke="none" />
          ) : null}

          {/* Soft under-glow stroke, then crisp stroke on top */}
          <path
            d={path}
            fill="none"
            filter={`url(#${glowId})`}
            opacity="0.85"
            stroke={`url(#${strokeId})`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="7"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={`url(#${strokeId})`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.25"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hard stop at the Crash Point once the climb finishes */}
          {isComplete ? (
            <line
              stroke={headColor}
              strokeDasharray="1.5 2"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              x1={head.x}
              x2={head.x}
              y1={crashY}
              y2={VIEW_H}
            />
          ) : null}
        </svg>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <span
            className="absolute left-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--t-muted)]"
            style={{ top: `${baselineTop}%`, transform: "translateY(-120%)" }}
          >
            1.00x
          </span>

          {missedYou ? (
            <span
              className="absolute left-1 -translate-y-1/2 rounded-sm bg-[var(--t-bg)]/80 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--t-red-hot)] sm:text-[11px]"
              data-testid="replay-curve-missed-you"
              style={{ top: `${plotPct(missedYou.y, VIEW_H, PAD_Y)}%` }}
            >
              {missedYou.label}
            </span>
          ) : null}

          {tierLines.map(({ tier, closeAt, y, isPlayerTier, showLabel }) => {
            const top = plotPct(y, VIEW_H, PAD_Y);
            const markerLeft = plotPct(closeAt * VIEW_W, VIEW_W, PAD_X);
            return (
              <div key={`anno-${tier.toString()}`}>
                {showLabel ? (
                  <span
                    className={`absolute left-1 -translate-y-1/2 rounded-sm px-1.5 py-0.5 text-[10px] leading-none sm:text-[11px] ${
                      isPlayerTier
                        ? "bg-[var(--t-bg)]/80 font-bold text-[var(--t-accent)]"
                        : "text-[var(--t-muted)]"
                    }`}
                    style={{ top: `${top}%` }}
                  >
                    {isPlayerTier
                      ? `${formatLeverageBps(tier)} · YOU`
                      : formatLeverageBps(tier)}
                  </span>
                ) : null}
                {closeAt <= progress ? (
                  <span
                    className="absolute block -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--t-amber-hot)] ring-2 ring-[var(--t-bg)]"
                    style={{
                      left: `${markerLeft}%`,
                      top: `${top}%`,
                      width: isPlayerTier ? 11 : 8,
                      height: isPlayerTier ? 11 : 8,
                      boxShadow: isPlayerTier
                        ? "0 0 10px rgba(214, 166, 96, 0.85)"
                        : "0 0 6px rgba(214, 166, 96, 0.45)",
                    }}
                  />
                ) : null}
              </div>
            );
          })}

          <span
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${
              isComplete ? "mc-head-pulse" : ""
            }`}
            style={{
              left: `${headLeft}%`,
              top: `${headTop}%`,
            }}
          >
            <span
              className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 18,
                height: 18,
                backgroundColor: headColor,
                opacity: 0.28,
              }}
            />
            <span
              className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--t-bg)]"
              style={{
                width: 11,
                height: 11,
                backgroundColor: headColor,
                boxShadow: `0 0 calc(14px * var(--mc-glow)) ${headColor}`,
              }}
            />
            {isComplete ? (
              <span
                className={`absolute left-1/2 top-0 whitespace-nowrap rounded-sm bg-[var(--t-bg)]/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                  isWinFreeze || landing.kind === "won"
                    ? "text-[var(--t-green-hot)]"
                    : "text-[var(--t-red-hot)]"
                }`}
                style={{ transform: "translate(-50%, calc(-100% - 8px))" }}
              >
                {crashLabel}
              </span>
            ) : null}
          </span>
        </div>
      </div>

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
          vectorEffect="non-scaling-stroke"
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
