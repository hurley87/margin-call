"use client";

import { useId, useMemo } from "react";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatCrashPointBps,
  formatLeverageBps,
} from "@/lib/margin-call-crash";
import {
  getReplayPathPoints,
  getTierCloseProgress,
  multiplierToY,
  replayAreaPathD,
  replayPathD,
} from "@/lib/round-replay";
import type { LandingPresentation } from "./landing-frame";

const VIEW_W = 100;
const VIEW_H = 56;
/** Extra room so strokes, the head badge, and a missed-YOU rail never clip. */
const PAD_X = 2;
const PAD_Y = 4;
const LABEL_MIN_GAP_PCT = 10;
/** Top rail for a player tier that never closed (above the Crash Point). */
const MISSED_YOU_Y = 1.5;

export type ReplayPlotProps = {
  crashPointBps: bigint;
  progress: number;
  playerTierBps?: bigint | null;
  /** Null while the climb is still running. */
  freeze: LandingPresentation | null;
  isComplete: boolean;
  /** Floor outcome: fill the remaining viewport instead of a fixed height. */
  fill?: boolean;
};

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
 * Dramatized climb plot: SVG geometry + DOM labels/markers. Hero chrome lives
 * in ReplayCurve; this module owns only the chart surface.
 */
export function ReplayPlot({
  crashPointBps,
  progress,
  playerTierBps = null,
  freeze,
  isComplete,
  fill = false,
}: ReplayPlotProps) {
  const reactId = useId();
  const strokeId = `replay-stroke-${reactId}`;
  const areaId = `replay-area-${reactId}`;
  const glowId = `replay-glow-${reactId}`;

  const points = getReplayPathPoints(crashPointBps, progress, {
    width: VIEW_W,
    height: VIEW_H,
  });
  const path = replayPathD(points);
  const areaPath = replayAreaPathD(points, VIEW_H);
  const head = points[points.length - 1] ?? { x: 0, y: VIEW_H };
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

  const climbAccent = "var(--t-green-hot)";
  const plotAccent = freeze?.plotAccent ?? climbAccent;
  const headColor = isComplete ? plotAccent : climbAccent;

  const headLeft = plotPct(head.x, VIEW_W, PAD_X);
  const headTop = plotPct(head.y, VIEW_H, PAD_Y);
  const baselineTop = plotPct(VIEW_H, VIEW_H, PAD_Y);
  const crashY = multiplierToY(crashPointBps, crashPointBps, VIEW_H);

  return (
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
            <stop offset="100%" stopColor={plotAccent} />
          </linearGradient>
          <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={plotAccent} stopOpacity="0.42" />
            <stop offset="55%" stopColor={plotAccent} stopOpacity="0.12" />
            <stop offset="100%" stopColor={plotAccent} stopOpacity="0" />
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

      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
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
              className="absolute left-1/2 top-0 whitespace-nowrap rounded-sm bg-[var(--t-bg)]/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{
                color: plotAccent,
                transform: "translate(-50%, calc(-100% - 8px))",
              }}
            >
              {crashLabel}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
