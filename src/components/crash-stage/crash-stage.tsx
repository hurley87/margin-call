"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { useReplayClock } from "@/hooks/use-replay-clock";
import {
  useRoundTheater,
  type TheaterLive,
  type TheaterReplayHero,
} from "@/hooks/use-round-theater";
import { useTheaterPlayerTicket } from "@/hooks/use-theater-player-ticket";
import { useTheaterTierSounds } from "@/hooks/use-theater-tier-sounds";
import {
  presentLanding,
  ticketLanding,
} from "@/components/round-theater/landing-frame";
import { RoundResultCard } from "@/components/round-theater/round-result-card";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  type CrashRoundPhase,
  type CrashTicket,
  type TicketTapeEntry,
} from "@/lib/margin-call-crash";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { formatTimelineCountdownLabel } from "@/lib/round-phase-copy";
import { getClosedTiersAtProgress, isReplayComplete } from "@/lib/round-replay";
import { settlementStatusCopy } from "@/lib/settlement-status-copy";
import {
  isTheaterLiveReady,
  theaterCountdownSeconds,
  theaterDisplayRoundId,
  theaterLiveRoundId,
  theaterLiveTimeline,
  theaterTapeEntries,
} from "@/lib/theater-live";
import { getTheaterAudio } from "@/lib/theater-audio";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import type { CrashCanvasProps } from "./crash-canvas";
import type { CountdownUrgency } from "./scenes/countdown-scene";
import type { TicketChipState } from "./scenes/ticket-field";
import { StageActions } from "./overlay/stage-actions";
import { StageHud } from "./overlay/stage-hud";
import {
  deriveCrashStageMode,
  type CrashStageMode,
} from "./use-crash-stage-mode";

const CrashCanvas = dynamic(
  () => import("./crash-canvas").then((m) => m.CrashCanvas),
  { ssr: false, loading: () => <CanvasFallback /> }
);

/**
 * Immersive Floor: Three.js pit plus existing entry/settlement/refund surfaces.
 */
export function CrashStage() {
  const theater = useRoundTheater();
  const { user, authenticated } = usePrivy();
  const playerAddress =
    authenticated && user ? getEvmWalletAddress(user) : null;

  const displayRoundId = theaterDisplayRoundId(theater.live, theater.hero);
  const { ticket: playerTicket } = useTheaterPlayerTicket(displayRoundId);
  const settlement = useCrashTicketSettlement();

  const replayHero: TheaterReplayHero | null =
    theater.hero.type === "replay" ? theater.hero : null;

  const unsettledTicket =
    (playerTicket && !playerTicket.settled ? playerTicket : null) ??
    (settlement.ticket && !settlement.ticket.settled
      ? settlement.ticket
      : null);
  const hasUnsettledTicket = unsettledTicket !== null;

  const settleReceiptOk =
    settlement.status === "confirmed" ||
    Boolean(playerTicket?.settled) ||
    Boolean(settlement.ticket?.settled);
  const mayClimb = !hasUnsettledTicket || settleReceiptOk;

  const shouldRunReplayClock = replayHero !== null && mayClimb;

  const clock = useReplayClock({
    crashPointBps:
      shouldRunReplayClock && replayHero ? replayHero.crashPointBps : null,
    finalizedAtSeconds:
      shouldRunReplayClock && replayHero ? replayHero.finalizedAtSeconds : null,
    chainTimestamp:
      shouldRunReplayClock && replayHero ? replayHero.chainTimestamp : null,
    reducedMotion: theater.reducedMotion || !shouldRunReplayClock,
  });

  const replayProgress = shouldRunReplayClock ? clock.progress : 0;
  const climbComplete = shouldRunReplayClock && clock.isComplete;

  const mode = deriveCrashStageMode({
    live: theater.live,
    hasUnsettledTicket,
    mayClimb,
    hasReplayHero: replayHero !== null,
    isReplayComplete: climbComplete,
  });

  useStageAudio({
    mode,
    liveKind: theater.live.kind,
    countdownSeconds: theaterCountdownSeconds(theater.live),
    reducedMotion: theater.reducedMotion,
    crashPointBps:
      shouldRunReplayClock && replayHero ? replayHero.crashPointBps : null,
    progress: replayProgress,
    isComplete: climbComplete,
    playerTierBps:
      unsettledTicket?.leverageBps ?? playerTicket?.leverageBps ?? null,
  });

  const entries = theaterTapeEntries(theater);
  const chipStates = useMemo(
    () =>
      buildChipStates(
        entries,
        replayHero?.crashPointBps ?? null,
        mode === "replay" || mode === "outcome" ? replayProgress : 0,
        mode === "outcome" || climbComplete
      ),
    [entries, replayHero?.crashPointBps, replayProgress, mode, climbComplete]
  );

  const activeTicket = unsettledTicket ?? playerTicket ?? settlement.ticket;

  const landingKind = useMemo(() => {
    if (!replayHero || mode !== "outcome") return null;
    return ticketLanding(activeTicket, replayHero.crashPointBps).kind;
  }, [activeTicket, mode, replayHero]);

  const landing = useMemo(() => {
    if (!replayHero || mode !== "outcome" || landingKind === null) return null;
    return presentLanding({ kind: landingKind }, replayHero.displayCrashPoint);
  }, [landingKind, mode, replayHero]);

  const countdownSeconds = theaterCountdownSeconds(theater.live);
  const urgency = countdownUrgency(mode, countdownSeconds);
  const showLockedLabel =
    mode === "awaiting-settle" ||
    theater.live.kind === "delayed" ||
    theater.live.kind === "expired";

  const liveTimeline = theaterLiveTimeline(theater.live);
  const countdownLabel = liveTimeline
    ? formatTimelineCountdownLabel(liveTimeline)
    : null;

  const actionPhase = theaterLivePhase(theater.live);
  const actionRoundId = theaterLiveRoundId(theater.live);

  const canvasProps: CrashCanvasProps = {
    mode,
    countdownSeconds:
      showLockedLabel && mode === "awaiting-settle" ? 0 : countdownSeconds,
    urgency,
    locked: showLockedLabel && mode !== "countdown",
    entries,
    playerAddress,
    crashPointBps: replayHero?.crashPointBps ?? null,
    replayProgress,
    playerTierBps: activeTicket?.leverageBps ?? null,
    chipStates,
    landing: mode === "outcome" ? landing : null,
    landingKind: mode === "outcome" ? landingKind : null,
  };

  if (theater.live.kind === "error" || theater.live.kind === "unavailable") {
    return (
      <div
        className="flex h-full min-h-[70svh] items-center justify-center px-4"
        data-testid="crash-stage"
      >
        <div className="max-w-md text-center">
          <p className="text-sm text-[var(--t-red)]" role="alert">
            {theater.live.error}
          </p>
          <button
            className={`mt-4 ${TERMINAL_ACTION_BUTTON_CLASS}`}
            onClick={() => void theater.retry()}
            type="button"
          >
            Retry theater read
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Crash floor"
      className="relative h-full min-h-[100svh] w-full overflow-hidden"
      data-mode={mode}
      data-testid="crash-stage"
    >
      {theater.reducedMotion ? (
        <ReducedMotionFloor
          countdownSeconds={countdownSeconds}
          locked={showLockedLabel && mode !== "countdown"}
          mode={mode}
          playerTicket={activeTicket}
          replayHero={replayHero}
          urgency={urgency}
        />
      ) : (
        <CrashCanvas {...canvasProps} />
      )}

      <StageHud
        countdownLabel={countdownLabel}
        countdownSeconds={countdownSeconds}
        isAlert={settlement.status === "error"}
        playerTicket={activeTicket}
        statusMessage={stageStatusMessage(mode, settlement)}
        suggestSound={mode === "replay" || mode === "outcome"}
      />

      {actionRoundId !== null && actionPhase !== null ? (
        <StageActions
          countdownSeconds={countdownSeconds ?? 0}
          phase={actionPhase}
          roundId={actionRoundId}
        />
      ) : null}
    </section>
  );
}

function CanvasFallback() {
  return (
    <div
      aria-busy="true"
      className="absolute inset-0 bg-[var(--t-bg)]"
      data-testid="crash-canvas-loading"
    >
      <div className="flex h-full items-center justify-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Loading floor…
        </p>
      </div>
    </div>
  );
}

function ReducedMotionFloor({
  mode,
  countdownSeconds,
  urgency,
  locked,
  replayHero,
  playerTicket,
}: {
  mode: CrashStageMode;
  countdownSeconds: number | null;
  urgency: CountdownUrgency;
  locked: boolean;
  replayHero: TheaterReplayHero | null;
  playerTicket: CrashTicket | null;
}) {
  const urgencyClass =
    urgency === "threat"
      ? "text-[var(--t-threat)]"
      : urgency === "warn"
        ? "text-[var(--t-urgency)]"
        : urgency === "locked"
          ? "text-[var(--t-accent)]"
          : "text-[var(--t-green-hot)]";

  if ((mode === "replay" || mode === "outcome") && replayHero) {
    return (
      <div className="flex h-full items-center justify-center px-4 pb-40 pt-28">
        <div className="w-full max-w-xl">
          <RoundResultCard
            crashPointBps={replayHero.crashPointBps}
            displayCrashPoint={replayHero.displayCrashPoint}
            finalizeTransactionUrl={replayHero.finalizeTransactionUrl}
            landing={ticketLanding(playerTicket, replayHero.crashPointBps)}
            playerTierBps={playerTicket?.leverageBps ?? null}
            tiers={replayHero.tiers}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4 pb-40 pt-28">
      <p
        className={`font-[family-name:var(--font-plex-sans)] text-7xl font-black tabular-nums sm:text-9xl ${urgencyClass}`}
        data-testid="reduced-motion-countdown"
      >
        {locked && mode === "awaiting-settle"
          ? "LOCKED"
          : countdownSeconds === null
            ? "—"
            : String(Math.max(0, countdownSeconds)).padStart(2, "0")}
      </p>
    </div>
  );
}

function theaterLivePhase(live: TheaterLive): CrashRoundPhase | null {
  if (!isTheaterLiveReady(live)) return null;
  switch (live.kind) {
    case "open":
      return "open";
    case "delayed":
      return live.phaseLabel;
    case "finalized":
      return "finalized";
    case "expired":
      return "expired";
    default: {
      const _exhaustive: never = live;
      return _exhaustive;
    }
  }
}

function countdownUrgency(
  mode: CrashStageMode,
  seconds: number | null
): CountdownUrgency {
  if (mode === "awaiting-settle" || mode === "expired") return "locked";
  if (seconds === null) return "calm";
  if (seconds <= 5) return "threat";
  if (seconds <= 10) return "warn";
  return "calm";
}

function buildChipStates(
  entries: readonly TicketTapeEntry[],
  crashPointBps: bigint | null,
  progress: number,
  shatterOpen: boolean
): Map<string, TicketChipState> {
  const map = new Map<string, TicketChipState>();
  if (crashPointBps === null || progress <= 0) return map;
  const closedTiers = new Set(
    getClosedTiersAtProgress(
      progress,
      crashPointBps,
      ENTRY_LEVERAGE_TIERS_BPS
    ).map((t) => t.toString())
  );
  for (const entry of entries) {
    const id = entry.ticketId.toString();
    if (closedTiers.has(entry.leverageBps.toString())) {
      map.set(id, "closed");
    } else if (shatterOpen && isReplayComplete(progress)) {
      map.set(id, "shattered");
    } else {
      map.set(id, "live");
    }
  }
  return map;
}

function stageStatusMessage(
  mode: CrashStageMode,
  settlement: ReturnType<typeof useCrashTicketSettlement>
): string | null {
  if (settlement.status === "error") return settlement.error;
  const settleCopy = settlementStatusCopy[settlement.status];
  if (settleCopy && settlement.ticket) return settleCopy;
  if (mode === "awaiting-settle") {
    return "Round locked. Verify and settle to reveal the Crash Point and see the Replay.";
  }
  return null;
}

function useStageAudio(options: {
  mode: CrashStageMode;
  liveKind: string;
  countdownSeconds: number | null;
  reducedMotion: boolean;
  crashPointBps: bigint | null;
  progress: number;
  isComplete: boolean;
  playerTierBps: bigint | null;
}) {
  const previousKind = useRef(options.liveKind);

  useEffect(() => {
    if (
      !options.reducedMotion &&
      options.liveKind === "delayed" &&
      previousKind.current === "open"
    ) {
      getTheaterAudio().playLockThunk();
    }
    previousKind.current = options.liveKind;
  }, [options.liveKind, options.reducedMotion]);

  useEffect(() => {
    if (options.reducedMotion) return;
    const s = options.countdownSeconds;
    if (s === null || s < 1 || s > 5) return;
    if (options.mode !== "countdown") return;
    getTheaterAudio().playCountdownTick();
  }, [options.countdownSeconds, options.mode, options.reducedMotion]);

  useTheaterTierSounds({
    crashPointBps: options.crashPointBps,
    progress: options.progress,
    isComplete: options.isComplete,
    enabled:
      !options.reducedMotion &&
      (options.mode === "replay" || options.mode === "outcome"),
    playerTierBps: options.playerTierBps,
  });
}
