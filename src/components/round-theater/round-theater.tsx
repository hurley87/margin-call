"use client";

import { useEffect, useRef, useState } from "react";
import { useReplayClock } from "@/hooks/use-replay-clock";
import { useRoundTheater, type TheaterStage } from "@/hooks/use-round-theater";
import { getClosedTiersAtProgress } from "@/lib/round-replay";
import { ENTRY_LEVERAGE_TIERS_BPS } from "@/lib/margin-call-crash";
import { getTheaterAudio } from "@/lib/theater-audio";
import { delayedPhaseCopy, theaterCopy } from "./theater-copy";
import { ReplayCurve } from "./replay-curve";
import { RoundResultCard } from "./round-result-card";
import { TheaterSoundToggle } from "./theater-sound-toggle";
import { TicketTape } from "./ticket-tape";
import { TierCloseBoard } from "./tier-close-board";

/**
 * Presentational round theater. Never offers entry or settlement — those live
 * on CurrentRound and the settlement/refund surfaces.
 */
export function RoundTheater() {
  const stage = useRoundTheater();

  return (
    <section
      aria-labelledby="round-theater-heading"
      className="mt-10 border-y border-[var(--t-border)] bg-[var(--t-panel)] text-left"
      data-testid="round-theater"
    >
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
              Base Sepolia · Trading floor
            </p>
            <h2
              id="round-theater-heading"
              className="mt-2 font-[family-name:var(--font-plex-sans)] text-3xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-4xl"
            >
              {theaterCopy.heading}
            </h2>
          </div>
          <TheaterSoundToggle />
        </div>

        <div className="mt-6">
          <TheaterBody stage={stage} />
        </div>
      </div>
    </section>
  );
}

function TheaterBody({ stage }: { stage: TheaterStage }) {
  switch (stage.kind) {
    case "loading":
      return (
        <p
          aria-busy="true"
          className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]"
        >
          {theaterCopy.loading}
        </p>
      );
    case "error":
    case "unavailable":
      return (
        <div>
          <p className="text-sm text-[var(--t-red)]" role="alert">
            {stage.error}
          </p>
          <button
            className="mt-4 border border-[var(--t-accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]"
            onClick={() => void stage.retry()}
            type="button"
          >
            Retry theater read
          </button>
        </div>
      );
    case "open":
      return <OpenStage stage={stage} />;
    case "delayed":
      return <DelayedStage stage={stage} />;
    case "finalized":
      return <FinalizedStage stage={stage} />;
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
}: {
  stage: Extract<TheaterStage, { kind: "open" }>;
}) {
  const ambiance = stage.ambiance;
  const clock = useReplayClock({
    crashPointBps: ambiance?.round.crashPointBps ?? null,
    finalizedAtSeconds: null,
    chainTimestamp: null,
    reducedMotion: stage.reducedMotion,
    loop: true,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
          {theaterCopy.openCountdown}
        </p>
        <p
          aria-label={`${stage.countdownSeconds} seconds until entry locks`}
          className="mc-live-value mt-2 text-5xl font-bold tabular-nums text-[var(--t-green-hot)]"
          data-testid="theater-countdown"
        >
          {formatCountdown(stage.countdownSeconds)}
        </p>
        <TicketTape entries={stage.tape?.entries ?? []} />
      </div>
      <div>
        {ambiance && !stage.reducedMotion ? (
          <ReplayCurve
            ambiance
            crashPointBps={ambiance.round.crashPointBps}
            progress={clock.progress}
          />
        ) : ambiance && stage.reducedMotion ? (
          <div className="terminal-panel p-4">
            <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              {theaterCopy.openAmbiance}
            </p>
            <p className="mc-live-value mt-2 text-3xl font-bold text-[var(--t-green-hot)]">
              {ambiance.displayCrashPoint}
            </p>
          </div>
        ) : (
          <div className="terminal-panel p-4 text-xs text-[var(--t-muted)]">
            {theaterCopy.openAmbianceEmpty}
          </div>
        )}
      </div>
    </div>
  );
}

function DelayedStage({
  stage,
}: {
  stage: Extract<TheaterStage, { kind: "delayed" }>;
}) {
  const copy = delayedPhaseCopy(stage.phaseLabel);
  return (
    <div data-testid="theater-delayed">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        Round status
      </p>
      <p className="mt-2 text-lg font-bold text-[var(--t-amber-hot)]">
        {copy.title}
      </p>
      <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--t-muted)]">
        {copy.body}
      </p>
      {/* Never invent a multiplier or start a climb while delayed. */}
      <TicketTape entries={stage.tape?.entries ?? []} />
    </div>
  );
}

function FinalizedStage({
  stage,
}: {
  stage: Extract<TheaterStage, { kind: "finalized" }>;
}) {
  const [restartNonce, setRestartNonce] = useState(0);
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
  });

  if (stage.reducedMotion) {
    return (
      <div data-testid="theater-finalized-static">
        <RoundResultCard
          crashPointBps={stage.crashPointBps}
          displayCrashPoint={stage.displayCrashPoint}
          finalizeTransactionUrl={stage.finalizeTransactionUrl}
          tiers={stage.tiers}
        />
      </div>
    );
  }

  return (
    <div data-testid="theater-finalized-replay">
      <ReplayCurve
        crashPointBps={stage.crashPointBps}
        progress={clock.progress}
      />
      <TierCloseBoard
        crashPointBps={stage.crashPointBps}
        progress={clock.progress}
        tiers={stage.tiers}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="border border-[var(--t-accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]"
          onClick={() => setRestartNonce((n) => n + 1)}
          type="button"
        >
          {theaterCopy.replayAgain}
        </button>
        {stage.finalizeTransactionUrl ? (
          <a
            className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]"
            href={stage.finalizeTransactionUrl}
            rel="noreferrer"
            target="_blank"
          >
            {theaterCopy.viewFinalization}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ExpiredStage({
  stage,
}: {
  stage: Extract<TheaterStage, { kind: "expired" }>;
}) {
  return (
    <div data-testid="theater-expired">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        Round status
      </p>
      <p className="mt-2 text-lg font-bold text-[var(--t-muted)]">
        {theaterCopy.expired}
      </p>
      <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--t-muted)]">
        {theaterCopy.expiredDetail}
      </p>
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
}) {
  const closedRef = useRef<Set<string>>(new Set());
  const crashedRef = useRef(false);

  useEffect(() => {
    closedRef.current = new Set();
    crashedRef.current = false;
  }, [options.restartNonce, options.crashPointBps]);

  useEffect(() => {
    if (!options.enabled) return;
    const audio = getTheaterAudio();
    const closed = getClosedTiersAtProgress(
      options.progress,
      options.crashPointBps,
      ENTRY_LEVERAGE_TIERS_BPS
    );
    for (const tier of closed) {
      const key = tier.toString();
      if (closedRef.current.has(key)) continue;
      closedRef.current.add(key);
      audio.playTierClose();
    }
    if (options.isComplete && !crashedRef.current) {
      crashedRef.current = true;
      audio.playCrashBell();
      audio.playPhoneRing();
    }
  }, [
    options.crashPointBps,
    options.enabled,
    options.isComplete,
    options.progress,
  ]);
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
