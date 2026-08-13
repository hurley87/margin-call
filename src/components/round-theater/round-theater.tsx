"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReplayClock } from "@/hooks/use-replay-clock";
import {
  useRoundTheater,
  type TheaterHero,
  type TheaterLive,
  type TheaterReplayHero,
  type TheaterView,
} from "@/hooks/use-round-theater";
import { useTheaterPlayerTicket } from "@/hooks/use-theater-player-ticket";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import { getTierCloseProgress } from "@/lib/round-replay";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatLeverageBps,
  type CrashTicket,
} from "@/lib/margin-call-crash";
import {
  formatNextRoundHandoff,
  formatTimelineCountdownLabel,
} from "@/lib/round-phase-copy";
import type { RoundTimeline } from "@/lib/round-timeline";
import { getTheaterAudio } from "@/lib/theater-audio";
import { formatCountdown, TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import { ticketLanding } from "./landing-frame";
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
  const view = useRoundTheater();
  // The displayed round's ticket for the signed-in player (null when signed
  // out or ticketless) — drives the "YOU" highlights. During the display-round
  // hold this reads the held replay round, so the player's own replay is marked.
  const { ticket: playerTicket } = useTheaterPlayerTicket(ticketRoundId(view));

  // Lock moment: one low thunk when the entry window slams shut.
  const previousKind = useRef(view.live.kind);
  useEffect(() => {
    if (
      !view.reducedMotion &&
      view.live.kind === "delayed" &&
      previousKind.current === "open"
    ) {
      getTheaterAudio().playLockThunk();
    }
    previousKind.current = view.live.kind;
  }, [view.live.kind, view.reducedMotion]);

  const isLive = view.live.kind === "open" || view.live.kind === "finalized";
  const timeline = liveTimeline(view.live);

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
              {isLive ? (
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
          <TheaterSoundToggle suggest={view.hero.type === "replay"} />
        </div>

        <div className="mt-4 space-y-2">
          {timeline ? <RoundTimelineStrip timeline={timeline} /> : null}
          <RoundExplainer />
        </div>

        <div className="mt-4">
          <TheaterBody playerTicket={playerTicket} view={view} />
        </div>
      </div>
    </section>
  );
}

function ticketRoundId(view: TheaterView): bigint | null {
  if (view.hero.type === "replay") return view.hero.roundId;
  switch (view.live.kind) {
    case "open":
    case "delayed":
    case "finalized":
    case "expired":
      return view.live.roundId;
    case "loading":
    case "error":
    case "unavailable":
      return null;
    default: {
      const _exhaustive: never = view.live;
      return _exhaustive;
    }
  }
}

function liveTimeline(live: TheaterLive): RoundTimeline | null {
  switch (live.kind) {
    case "open":
    case "delayed":
    case "finalized":
    case "expired":
      return live.timeline;
    case "loading":
    case "error":
    case "unavailable":
      return null;
    default: {
      const _exhaustive: never = live;
      return _exhaustive;
    }
  }
}

function TheaterBody({
  view,
  playerTicket,
}: {
  view: TheaterView;
  playerTicket: CrashTicket | null;
}) {
  const { live, hero } = view;
  switch (live.kind) {
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
            body={live.error}
            testId="theater-error"
            title="Theater unavailable"
          />
          <button
            className={`mt-4 ${TERMINAL_ACTION_BUTTON_CLASS}`}
            onClick={() => void view.retry()}
            type="button"
          >
            Retry theater read
          </button>
        </div>
      );
    case "open":
      if (hero.type === "replay") {
        return (
          <ReplayStage
            hero={hero}
            live={live}
            playerTicket={playerTicket}
            reducedMotion={view.reducedMotion}
          />
        );
      }
      return (
        <OpenStage
          hero={hero}
          live={live}
          playerTicket={playerTicket}
          reducedMotion={view.reducedMotion}
        />
      );
    case "delayed":
      return <DelayedStage hero={hero} live={live} />;
    case "finalized":
      if (hero.type === "replay") {
        return (
          <ReplayStage
            hero={hero}
            live={live}
            playerTicket={playerTicket}
            reducedMotion={view.reducedMotion}
          />
        );
      }
      return (
        <ReplayCurveEmpty
          testId="theater-finalized-replay"
          title={theaterCopy.loading}
        />
      );
    case "expired":
      return <ExpiredStage hero={hero} live={live} />;
    default: {
      const _exhaustive: never = live;
      return _exhaustive;
    }
  }
}

function OpenStage({
  live,
  hero,
  playerTicket,
  reducedMotion,
}: {
  live: Extract<TheaterLive, { kind: "open" }>;
  hero: TheaterHero;
  playerTicket: CrashTicket | null;
  reducedMotion: boolean;
}) {
  const countdown = live.timeline.countdown;
  const countdownLabel = formatTimelineCountdownLabel(live.timeline);
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
    if (reducedMotion) return;
    if (closingSeconds === null || closingSeconds < 1 || closingSeconds > 5) {
      return;
    }
    getTheaterAudio().playCountdownTick();
  }, [closingSeconds, reducedMotion]);

  return (
    <div className="space-y-4">
      <OpenHero hero={hero} reducedMotion={reducedMotion} />

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
              {formatDeskDollars(playerTicket.margin, TUSD_DECIMALS)} USDC ·{" "}
              {formatLeverageBps(playerTicket.leverageBps)}
            </p>
          ) : null}
          <TicketTape entries={live.tape?.entries ?? []} />
        </div>
      </div>
    </div>
  );
}

function OpenHero({
  hero,
  reducedMotion,
}: {
  hero: TheaterHero;
  reducedMotion: boolean;
}) {
  if (hero.type !== "ambiance") {
    return (
      <ReplayCurveEmpty
        body={theaterCopy.openAmbianceEmpty}
        testId="theater-ambiance-empty"
        title={theaterCopy.openAmbianceLabel}
      />
    );
  }

  if (reducedMotion) {
    return (
      <div className={`terminal-panel p-5 ${REPLAY_HERO_MIN_H}`}>
        <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
          {theaterCopy.openAmbiance(hero.roundId.toString())}
        </p>
        <p className="mc-live-value mt-2 font-[family-name:var(--font-plex-sans)] text-5xl font-bold text-[var(--t-green-hot)] sm:text-6xl">
          {hero.displayCrashPoint}
        </p>
        <p className="mt-2 text-[10px] leading-4 text-[var(--t-muted)]">
          {theaterCopy.openAmbianceNote}
        </p>
      </div>
    );
  }

  return (
    <AmbianceReplay crashPointBps={hero.crashPointBps} roundId={hero.roundId} />
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
  live,
  hero,
}: {
  live: Extract<TheaterLive, { kind: "delayed" }>;
  hero: TheaterHero;
}) {
  const title = hero.type === "pending" ? hero.title : "Awaiting attestation";
  const body = hero.type === "pending" ? hero.body : undefined;
  return (
    // CRT wipe-in as the stage flips from open to locked/awaiting.
    <div className="mc-crt-reveal space-y-4" data-testid="theater-delayed">
      {/* Never invent a multiplier or start a climb while delayed. */}
      <ReplayCurveEmpty body={body} title={title} />
      <TicketTape entries={live.tape?.entries ?? []} />
    </div>
  );
}

function ReplayStage({
  hero,
  live,
  playerTicket,
  reducedMotion,
}: {
  hero: TheaterReplayHero;
  live: TheaterLive;
  playerTicket: CrashTicket | null;
  reducedMotion: boolean;
}) {
  const [restartNonce, setRestartNonce] = useState(0);
  const playerTierBps = playerTicket?.leverageBps ?? null;
  const landing = ticketLanding(playerTicket, hero.crashPointBps);
  const clock = useReplayClock({
    crashPointBps: hero.crashPointBps,
    finalizedAtSeconds: hero.finalizedAtSeconds,
    chainTimestamp: hero.chainTimestamp,
    reducedMotion,
    restartNonce,
  });

  useTierSoundEffects({
    crashPointBps: hero.crashPointBps,
    progress: clock.progress,
    isComplete: clock.isComplete,
    enabled: !reducedMotion,
    restartNonce,
    playerTierBps,
  });

  if (reducedMotion) {
    return (
      <div className="space-y-4" data-testid="theater-finalized-static">
        <RoundResultCard
          crashPointBps={hero.crashPointBps}
          displayCrashPoint={hero.displayCrashPoint}
          finalizeTransactionUrl={hero.finalizeTransactionUrl}
          landing={landing}
          playerTierBps={playerTierBps}
          tiers={hero.tiers}
        />
        <ResultHandoffRow hero={hero} live={live} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="theater-finalized-replay">
      {/* Re-keyed on restart so the Replay button replays the CRT wipe too. */}
      <div className="mc-crt-reveal" key={restartNonce}>
        <ReplayCurve
          crashPointBps={hero.crashPointBps}
          landing={landing}
          playerTierBps={playerTierBps}
          progress={clock.progress}
        />
      </div>
      <ResultHandoffRow hero={hero} live={live} />
      <TierCloseBoard
        crashPointBps={hero.crashPointBps}
        playerTierBps={playerTierBps}
        progress={clock.progress}
        tiers={hero.tiers}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={TERMINAL_ACTION_BUTTON_CLASS}
          onClick={() => setRestartNonce((n) => n + 1)}
          type="button"
        >
          {theaterCopy.replayAgain}
        </button>
        <FinalizeLink url={hero.finalizeTransactionUrl} />
      </div>
    </div>
  );
}

/**
 * Which round this result belongs to, plus the live handoff to the next one.
 * Keeps a held previous-round replay from reading as the live round.
 */
function ResultHandoffRow({
  hero,
  live,
}: {
  hero: TheaterReplayHero;
  live: TheaterLive;
}) {
  const handoff = replayHandoffLabel(hero, live);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {theaterCopy.resultCaption(hero.roundId.toString())}
      </p>
      {handoff ? (
        <p
          aria-live="polite"
          className="text-xs font-bold tabular-nums text-[var(--t-green-hot)]"
          data-testid="theater-next-round"
        >
          {handoff}
        </p>
      ) : null}
    </div>
  );
}

function replayHandoffLabel(
  hero: TheaterReplayHero,
  live: TheaterLive
): string | null {
  switch (live.kind) {
    case "open":
      return hero.roundId !== live.roundId
        ? formatNextRoundHandoff({
            roundId: live.roundId,
            countdown: live.timeline.countdown,
          })
        : null;
    case "finalized":
      return formatNextRoundHandoff({
        roundId: live.roundId + 1n,
        countdown: live.timeline.countdown,
      });
    case "delayed":
    case "expired":
    case "loading":
    case "error":
    case "unavailable":
      return null;
    default: {
      const _exhaustive: never = live;
      return _exhaustive;
    }
  }
}

function ExpiredStage({
  live,
  hero,
}: {
  live: Extract<TheaterLive, { kind: "expired" }>;
  hero: TheaterHero;
}) {
  const title = hero.type === "pending" ? hero.title : theaterCopy.expired;
  const body = hero.type === "pending" ? hero.body : theaterCopy.expiredDetail;
  return (
    <div className="space-y-4" data-testid="theater-expired">
      <ReplayCurveEmpty body={body} title={title} />
      <TicketTape entries={live.tape?.entries ?? []} />
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
