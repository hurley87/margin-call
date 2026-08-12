"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReplayClock } from "@/hooks/use-replay-clock";
import {
  useRoundTheater,
  type TheaterNextRound,
  type TheaterStage,
} from "@/hooks/use-round-theater";
import { useTheaterPlayerTicket } from "@/hooks/use-theater-player-ticket";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import { getTierCloseProgress } from "@/lib/round-replay";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatLeverageBps,
  type CrashTicket,
} from "@/lib/margin-call-crash";
import { roundPhaseCopy } from "@/lib/round-phase-copy";
import { getTheaterAudio } from "@/lib/theater-audio";
import { formatCountdown, TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import { theaterCopy } from "./theater-copy";
import { FinalizeLink } from "./finalize-link";
import {
  REPLAY_HERO_MIN_H,
  ReplayCurve,
  ReplayCurveEmpty,
} from "./replay-curve";
import { RoundExplainer } from "./round-explainer";
import { RoundResultCard } from "./round-result-card";
import { RoundTimelineStrip } from "./round-timeline-strip";
import { TheaterSoundToggle } from "./theater-sound-toggle";
import { TicketTape } from "./ticket-tape";
import { TierCloseBoard } from "./tier-close-board";

/**
 * Presentational round theater. Never offers entry or settlement — those live
 * on CurrentRound and the settlement/refund surfaces.
 */
export function RoundTheater() {
  const stage = useRoundTheater();
  // The displayed round's ticket for the signed-in player (null when signed
  // out or ticketless) — drives the "YOU" highlights. During the display-round
  // hold this reads the held round, so the player's own replay is marked.
  const { ticket: playerTicket } = useTheaterPlayerTicket(
    "roundId" in stage ? stage.roundId : null
  );

  // Lock moment: one low thunk when the entry window slams shut.
  const previousKind = useRef(stage.kind);
  useEffect(() => {
    if (
      !stage.reducedMotion &&
      stage.kind === "delayed" &&
      previousKind.current === "open"
    ) {
      getTheaterAudio().playLockThunk();
    }
    previousKind.current = stage.kind;
  }, [stage.kind, stage.reducedMotion]);

  const live = stage.kind === "open" || stage.kind === "finalized";

  return (
    <section
      aria-labelledby="round-theater-heading"
      className="border-y border-[var(--t-border)] bg-[var(--t-panel)] text-left"
      data-testid="round-theater"
    >
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
              Base Sepolia · Trading floor
              {live ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--t-green-hot)]">
                  <span
                    aria-hidden="true"
                    className="live-pulse h-1.5 w-1.5 bg-[var(--t-green-hot)]"
                  />
                  Live
                </span>
              ) : null}
            </p>
            <h2
              id="round-theater-heading"
              className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-3xl"
            >
              {theaterCopy.heading}
            </h2>
          </div>
          <TheaterSoundToggle suggest={stage.kind === "finalized"} />
        </div>

        <div className="mt-4 space-y-2">
          {"timeline" in stage ? (
            <RoundTimelineStrip timeline={stage.timeline} />
          ) : null}
          <RoundExplainer />
        </div>

        <div className="mt-4">
          <TheaterBody playerTicket={playerTicket} stage={stage} />
        </div>
      </div>
    </section>
  );
}

function TheaterBody({
  stage,
  playerTicket,
}: {
  stage: TheaterStage;
  playerTicket: CrashTicket | null;
}) {
  switch (stage.kind) {
    case "loading":
      return (
        <ReplayCurveEmpty
          busy
          testId="theater-loading"
          title={theaterCopy.loading}
        />
      );
    case "error":
    case "unavailable":
      return (
        <div>
          <ReplayCurveEmpty
            body={stage.error}
            testId="theater-error"
            title="Theater unavailable"
          />
          <button
            className={`mt-4 ${TERMINAL_ACTION_BUTTON_CLASS}`}
            onClick={() => void stage.retry()}
            type="button"
          >
            Retry theater read
          </button>
        </div>
      );
    case "open":
      return <OpenStage playerTicket={playerTicket} stage={stage} />;
    case "delayed":
      return <DelayedStage stage={stage} />;
    case "finalized":
      return <FinalizedStage playerTicket={playerTicket} stage={stage} />;
    case "expired":
      return <ExpiredStage stage={stage} />;
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

function OpenStage({
  stage,
  playerTicket,
}: {
  stage: Extract<TheaterStage, { kind: "open" }>;
  playerTicket: CrashTicket | null;
}) {
  const ambiance = stage.ambiance;

  const countdown = stage.timeline.countdown;
  const countdownLabel =
    countdown.kind === "entry-closes"
      ? theaterCopy.openCountdown
      : "Next round opens in";
  const countdownAriaLabel =
    countdown.kind === "entry-closes"
      ? `${countdown.seconds} seconds until entry locks`
      : `${countdown.seconds} seconds until the next round opens`;

  // Final-seconds urgency: color shift plus a per-second tick flash & tone.
  const closingSeconds =
    countdown.kind === "entry-closes" ? countdown.seconds : null;
  const urgencyColor =
    closingSeconds !== null && closingSeconds <= 5
      ? "text-[var(--t-threat)]"
      : closingSeconds !== null && closingSeconds <= 10
        ? "text-[var(--t-urgency)]"
        : "text-[var(--t-green-hot)]";
  const ticking = closingSeconds !== null && closingSeconds <= 10;

  useEffect(() => {
    if (stage.reducedMotion) return;
    if (closingSeconds === null || closingSeconds < 1 || closingSeconds > 5) {
      return;
    }
    getTheaterAudio().playCountdownTick();
  }, [closingSeconds, stage.reducedMotion]);

  return (
    <div className="space-y-4">
      {ambiance && !stage.reducedMotion ? (
        <AmbianceReplay
          crashPointBps={ambiance.round.crashPointBps}
          roundId={ambiance.round.id}
        />
      ) : ambiance && stage.reducedMotion ? (
        <div className={`terminal-panel p-5 ${REPLAY_HERO_MIN_H}`}>
          <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
            {theaterCopy.openAmbiance(ambiance.round.id.toString())}
          </p>
          <p className="mc-live-value mt-2 font-[family-name:var(--font-plex-sans)] text-5xl font-bold text-[var(--t-green-hot)] sm:text-6xl">
            {ambiance.displayCrashPoint}
          </p>
          <p className="mt-2 text-[10px] leading-4 text-[var(--t-muted)]">
            {theaterCopy.openAmbianceNote}
          </p>
        </div>
      ) : (
        <ReplayCurveEmpty
          body={theaterCopy.openAmbianceEmpty}
          testId="theater-ambiance-empty"
          title={theaterCopy.openAmbianceLabel}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[var(--t-divider)] pt-4">
        <div>
          <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
            {countdownLabel}
            <span aria-hidden="true" className="cursor-blink ml-1">
              ▮
            </span>
          </p>
          <p
            aria-label={countdownAriaLabel}
            className={`mc-live-value mt-1 text-4xl font-bold tabular-nums sm:text-5xl ${urgencyColor} ${
              ticking ? "mc-num-flash" : ""
            }`}
            data-dir={ticking ? "down" : undefined}
            data-testid="theater-countdown"
            key={ticking ? countdown.seconds : "steady"}
          >
            {formatCountdown(countdown.seconds)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          {playerTicket ? (
            <p
              className="mb-2 inline-flex items-center gap-2 border border-[var(--t-accent)]/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent)]"
              data-testid="theater-player-ticket"
            >
              <span
                aria-hidden="true"
                className="live-pulse h-1.5 w-1.5 bg-[var(--t-accent)]"
              />
              Your Ticket ·{" "}
              {formatDeskDollars(playerTicket.margin, TUSD_DECIMALS)} tUSD ·{" "}
              {formatLeverageBps(playerTicket.leverageBps)}
            </p>
          ) : null}
          <TicketTape entries={stage.tape?.entries ?? []} />
        </div>
      </div>
    </div>
  );
}

/**
 * Leaf that owns the looping ambiance clock, so its ~60fps state updates
 * re-render only the curve — not the countdown and ticket tape beside it.
 */
function AmbianceReplay({
  crashPointBps,
  roundId,
}: {
  crashPointBps: bigint;
  roundId: bigint;
}) {
  const clock = useReplayClock({
    crashPointBps,
    finalizedAtSeconds: null,
    chainTimestamp: null,
    loop: true,
  });

  return (
    <ReplayCurve
      ambiance={{ roundId }}
      crashPointBps={crashPointBps}
      progress={clock.progress}
    />
  );
}

function DelayedStage({
  stage,
}: {
  stage: Extract<TheaterStage, { kind: "delayed" }>;
}) {
  const copy = roundPhaseCopy[stage.phaseLabel];
  return (
    // CRT wipe-in as the stage flips from open to locked/awaiting.
    <div className="mc-crt-reveal space-y-4" data-testid="theater-delayed">
      {/* Never invent a multiplier or start a climb while delayed. */}
      <ReplayCurveEmpty body={copy.body} title={copy.title} />
      <TicketTape entries={stage.tape?.entries ?? []} />
    </div>
  );
}

function FinalizedStage({
  stage,
  playerTicket,
}: {
  stage: Extract<TheaterStage, { kind: "finalized" }>;
  playerTicket: CrashTicket | null;
}) {
  const [restartNonce, setRestartNonce] = useState(0);
  const playerTierBps = playerTicket?.leverageBps ?? null;
  const clock = useReplayClock({
    crashPointBps: stage.crashPointBps,
    finalizedAtSeconds: stage.finalizedAtSeconds,
    chainTimestamp: stage.chainTimestamp,
    reducedMotion: stage.reducedMotion,
    restartNonce,
  });

  useTierSoundEffects({
    crashPointBps: stage.crashPointBps,
    progress: clock.progress,
    isComplete: clock.isComplete,
    enabled: !stage.reducedMotion,
    restartNonce,
    playerTierBps,
  });

  if (stage.reducedMotion) {
    return (
      <div className="space-y-4" data-testid="theater-finalized-static">
        <RoundResultCard
          crashPointBps={stage.crashPointBps}
          displayCrashPoint={stage.displayCrashPoint}
          finalizeTransactionUrl={stage.finalizeTransactionUrl}
          tiers={stage.tiers}
        />
        <ResultHandoffRow next={stage.next} roundId={stage.roundId} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="theater-finalized-replay">
      {/* Re-keyed on restart so the Replay button replays the CRT wipe too. */}
      <div className="mc-crt-reveal" key={restartNonce}>
        <ReplayCurve
          crashPointBps={stage.crashPointBps}
          playerTierBps={playerTierBps}
          progress={clock.progress}
        />
      </div>
      <ResultHandoffRow next={stage.next} roundId={stage.roundId} />
      <TierCloseBoard
        crashPointBps={stage.crashPointBps}
        playerTierBps={playerTierBps}
        progress={clock.progress}
        tiers={stage.tiers}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={TERMINAL_ACTION_BUTTON_CLASS}
          onClick={() => setRestartNonce((n) => n + 1)}
          type="button"
        >
          {theaterCopy.replayAgain}
        </button>
        <FinalizeLink url={stage.finalizeTransactionUrl} />
      </div>
    </div>
  );
}

/**
 * Which round this result belongs to, plus the live handoff to the next one.
 * Keeps a held previous-round replay from reading as the live round.
 */
function ResultHandoffRow({
  roundId,
  next,
}: {
  roundId: bigint;
  next: TheaterNextRound | null;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {theaterCopy.resultCaption(roundId.toString())}
      </p>
      {next ? (
        <p
          aria-live="polite"
          className="text-xs font-bold tabular-nums text-[var(--t-green-hot)]"
          data-testid="theater-next-round"
        >
          {nextRoundLabel(next)}
        </p>
      ) : null}
    </div>
  );
}

function nextRoundLabel(next: TheaterNextRound): string {
  const roundId = next.roundId.toString();
  if (next.countdown.kind === "entry-closes") {
    return theaterCopy.nextRoundEntryOpen(
      roundId,
      formatCountdown(next.countdown.seconds)
    );
  }
  return next.countdown.seconds > 0
    ? theaterCopy.nextRoundOpens(
        roundId,
        formatCountdown(next.countdown.seconds)
      )
    : theaterCopy.nextRoundOpening(roundId);
}

function ExpiredStage({
  stage,
}: {
  stage: Extract<TheaterStage, { kind: "expired" }>;
}) {
  return (
    <div className="space-y-4" data-testid="theater-expired">
      <ReplayCurveEmpty
        body={theaterCopy.expiredDetail}
        title={theaterCopy.expired}
      />
      <TicketTape entries={stage.tape?.entries ?? []} />
    </div>
  );
}

function useTierSoundEffects(options: {
  crashPointBps: bigint;
  progress: number;
  isComplete: boolean;
  enabled: boolean;
  restartNonce: number;
  playerTierBps: bigint | null;
}) {
  // The per-frame work is two number comparisons against precomputed,
  // ascending close thresholds; the log math runs once per Crash Point.
  const closeThresholds = useMemo(
    () =>
      ENTRY_LEVERAGE_TIERS_BPS.flatMap((tier) => {
        const closeAt = getTierCloseProgress(tier, options.crashPointBps);
        if (closeAt === null) return [];
        return [
          {
            closeAt,
            isPlayerTier:
              options.playerTierBps !== null && tier === options.playerTierBps,
          },
        ];
      }).sort((a, b) => a.closeAt - b.closeAt),
    [options.crashPointBps, options.playerTierBps]
  );
  const firedCountRef = useRef(0);
  const crashedRef = useRef(false);

  useEffect(() => {
    firedCountRef.current = 0;
    crashedRef.current = false;
  }, [options.restartNonce, options.crashPointBps]);

  useEffect(() => {
    if (!options.enabled) return;
    while (
      firedCountRef.current < closeThresholds.length &&
      closeThresholds[firedCountRef.current].closeAt <= options.progress
    ) {
      const threshold = closeThresholds[firedCountRef.current];
      firedCountRef.current += 1;
      // The player's own close rings the register instead of the desk chime.
      if (threshold.isPlayerTier) getTheaterAudio().playWinRegister();
      else getTheaterAudio().playTierClose();
    }
    if (options.isComplete && !crashedRef.current) {
      crashedRef.current = true;
      const audio = getTheaterAudio();
      audio.playCrashBell();
      audio.playPhoneRing();
    }
  }, [closeThresholds, options.enabled, options.isComplete, options.progress]);
}
