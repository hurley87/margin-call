"use client";

import {
  formatTimelineCountdown,
  roundPhaseCopy,
} from "@/lib/round-phase-copy";
import type {
  RoundTimeline,
  RoundTimelineSegment,
  RoundTimelineSegmentId,
} from "@/lib/round-timeline";
import { formatCountdown } from "@/lib/utils";

const segmentLabels: Record<RoundTimelineSegmentId, string> = {
  entry: "Entry",
  locked: "Locked",
  reveal: "Reveal",
  result: "Result",
  next: "Next",
};

// Entry is 45 of the round's 60 seconds; give it the visual weight to match.
const segmentGrow: Record<RoundTimelineSegmentId, string> = {
  entry: "grow-[3]",
  locked: "grow",
  reveal: "grow",
  result: "grow",
  next: "grow-[2]",
};

/**
 * Deterministic lifecycle strip: where the round is on the 60-second grid and
 * the one countdown that matters right now. Facts live in the text; the bars
 * are decorative.
 */
export function RoundTimelineStrip({ timeline }: { timeline: RoundTimeline }) {
  const copy = roundPhaseCopy[timeline.phase];

  return (
    <div
      className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2.5 sm:px-4"
      data-testid="round-timeline"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)]">
          Round {timeline.roundId.toString()} ·{" "}
          <span className="text-[var(--t-text)]">{copy.badge}</span>
        </p>
        <p
          aria-live="polite"
          className="text-xs font-bold tabular-nums text-[var(--t-green-hot)]"
          data-testid="round-timeline-countdown"
        >
          {formatTimelineCountdown(timeline)}
        </p>
      </div>

      <ol aria-hidden="true" className="mt-2 flex gap-1">
        {timeline.segments.map((segment) => (
          <li className={`min-w-0 ${segmentGrow[segment.id]}`} key={segment.id}>
            <p
              className={`truncate text-[9px] font-bold uppercase tracking-[0.14em] ${
                segment.state === "active"
                  ? "text-[var(--t-text)]"
                  : segment.state === "skipped"
                    ? "text-[var(--t-muted)] line-through"
                    : "text-[var(--t-muted)]"
              }`}
            >
              {segmentLabels[segment.id]}
            </p>
            <SegmentTrack segment={segment} />
          </li>
        ))}
      </ol>

      {timeline.expiresInSeconds !== null ? (
        <p className="mt-1.5 text-[10px] leading-4 text-[var(--t-muted)]">
          If unattested, this round expires in{" "}
          {formatCountdown(timeline.expiresInSeconds)} and margin becomes
          refundable.
        </p>
      ) : null}
    </div>
  );
}

function SegmentTrack({ segment }: { segment: RoundTimelineSegment }) {
  const fill =
    segment.state === "done"
      ? 1
      : segment.state === "active"
        ? segment.progress
        : 0;

  return (
    <div className="mt-1 h-1 w-full overflow-hidden bg-[var(--t-divider)]">
      {segment.state === "active" && fill === null ? (
        // Event-driven wait (reveal/attestation): full amber shimmer, no fake
        // progress. Static under reduced motion via the global media block.
        <div className="mc-shimmer h-full w-full bg-[var(--t-amber)]/60" />
      ) : (
        <div
          className={`h-full ${
            segment.state === "done"
              ? "bg-[var(--t-green)]/70"
              : segment.state === "active"
                ? "bg-[var(--t-green-hot)]"
                : "bg-transparent"
          }`}
          style={{ width: `${Math.round((fill ?? 0) * 100)}%` }}
        />
      )}
    </div>
  );
}
