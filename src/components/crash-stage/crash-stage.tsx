"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { useReplayClock } from "@/hooks/use-replay-clock";
import {
  useRoundTheater,
  type TheaterLive,
  type TheaterReplayHero,
} from "@/hooks/use-round-theater";
import { useSettleCeremony } from "@/hooks/use-settle-ceremony";
import { useTheaterPlayerTicket } from "@/hooks/use-theater-player-ticket";
import { useTheaterTierSounds } from "@/hooks/use-theater-tier-sounds";
import {
  ticketForRound,
  ticketLanding,
  type TicketLanding,
} from "@/components/round-theater/landing-frame";
import {
  aggregateTierExposure,
  ENTRY_LEVERAGE_TIERS_BPS,
  formatCrashPointBps,
  isCrashPointPublished,
  type CrashRoundPhase,
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
import { StageOutcomeGraph } from "./overlay/stage-outcome-graph";
import { StageOutcomePanel } from "./overlay/stage-outcome-panel";
import { StageVerifyProgress } from "./overlay/stage-verify-progress";
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
  const liveRoundId = theaterLiveRoundId(theater.live);
  const { ticket: playerTicket } = useTheaterPlayerTicket(displayRoundId);
  const { ticket: liveRoundTicket } = useTheaterPlayerTicket(liveRoundId);

  const reducedMotion = theater.reducedMotion;
  const [ceremony, ceremonyDispatch] = useSettleCeremony(playerAddress);
  const onCrashPointKnown = useCallback(
    (crashPointBps: bigint) =>
      ceremonyDispatch({
        type: "crash-point-known",
        crashPointBps,
        reducedMotion,
      }),
    [ceremonyDispatch, reducedMotion]
  );
  const settlement = useCrashTicketSettlement({ onCrashPointKnown });

  // The settlement recovery read is the stalest round source: re-check it when
  // the live round flips so a cross-round ticket doesn't linger for a poll.
  const { refreshIfIdle } = settlement;
  const previousLiveRoundId = useRef(liveRoundId);
  useEffect(() => {
    if (liveRoundId !== null && previousLiveRoundId.current !== liveRoundId) {
      refreshIfIdle();
    }
    previousLiveRoundId.current = liveRoundId;
  }, [liveRoundId, refreshIfIdle]);

  // Freeze the ceremony snapshot at click time so poll churn cannot mutate
  // the displayed graph, tiers, or ticket mid-sequence.
  const liveTape = isTheaterLiveReady(theater.live) ? theater.live.tape : null;
  const settlementTicket = settlement.ticket;
  const beginCeremony = useCallback(() => {
    if (!settlementTicket || settlementTicket.settled) return;
    const tape =
      liveTape && liveTape.roundId === settlementTicket.roundId
        ? liveTape
        : null;
    ceremonyDispatch({
      type: "start",
      snapshot: {
        roundId: settlementTicket.roundId,
        ticket: settlementTicket,
        tape,
        tiers: tape?.tiers ?? aggregateTierExposure([]),
      },
    });
  }, [ceremonyDispatch, liveTape, settlementTicket]);

  // Flows that never touch the attestation (claim/settle on an externally
  // finalized round, receipt resumes) reveal from the recovered round.
  useEffect(() => {
    if (ceremony.phase !== "verifying") return;
    const round = settlement.round;
    if (!round || round.id !== ceremony.snapshot.roundId) return;
    if (!isCrashPointPublished(round)) return;
    onCrashPointKnown(round.crashPointBps);
  }, [ceremony, onCrashPointKnown, settlement.round]);

  const replayHero: TheaterReplayHero | null =
    theater.hero.type === "replay" ? theater.hero : null;

  const unsettledTicket =
    (playerTicket && !playerTicket.settled ? playerTicket : null) ??
    (settlement.ticket && !settlement.ticket.settled
      ? settlement.ticket
      : null);
  const hasUnsettledTicket = unsettledTicket !== null;
  const hasStaleUnsettledTicket =
    unsettledTicket !== null &&
    liveRoundId !== null &&
    unsettledTicket.roundId < liveRoundId;

  const settleReceiptOk =
    settlement.status === "confirmed" ||
    Boolean(playerTicket?.settled) ||
    Boolean(settlement.ticket?.settled);
  const mayClimb = !hasUnsettledTicket || settleReceiptOk;

  const ceremonyClimb =
    ceremony.phase === "climbing" || ceremony.phase === "landed"
      ? ceremony
      : null;
  const shouldRunReplayClock = replayHero !== null && mayClimb;
  // The ceremony clock seeds from zero (null timestamps) so the settling
  // player always sees the full climb; spectators keep the chain seek.
  const clockCrashPoint = ceremonyClimb
    ? ceremonyClimb.reveal.crashPointBps
    : shouldRunReplayClock && replayHero
      ? replayHero.crashPointBps
      : null;

  const clock = useReplayClock({
    crashPointBps: clockCrashPoint,
    finalizedAtSeconds:
      !ceremonyClimb && shouldRunReplayClock && replayHero
        ? replayHero.finalizedAtSeconds
        : null,
    chainTimestamp:
      !ceremonyClimb && shouldRunReplayClock && replayHero
        ? replayHero.chainTimestamp
        : null,
    reducedMotion: reducedMotion || clockCrashPoint === null,
    restartNonce: ceremonyClimb?.startNonce ?? 0,
  });

  const replayProgress =
    ceremony.phase === "landed"
      ? 1
      : clockCrashPoint !== null
        ? clock.progress
        : 0;
  const climbComplete =
    ceremony.phase === "landed" ||
    (clockCrashPoint !== null && clock.isComplete);

  const clockComplete = clock.isComplete;
  useEffect(() => {
    if (ceremony.phase !== "climbing") return;
    // Reduced motion mid-climb would otherwise stall the ceremony forever.
    if (clockComplete || reducedMotion) {
      ceremonyDispatch({ type: "climb-complete" });
    }
  }, [ceremony.phase, ceremonyDispatch, clockComplete, reducedMotion]);

  const mode = deriveCrashStageMode({
    live: theater.live,
    ceremonyPhase: ceremony.phase,
    hasUnsettledTicket,
    hasStaleUnsettledTicket,
    mayClimb,
    hasReplayHero: replayHero !== null,
    isReplayComplete: climbComplete,
  });

  // Ceremony hero: locally built from the frozen snapshot + reveal so the 10s
  // theater poll can never blank or swap the graph mid-ceremony.
  const finalizeTransactionUrl =
    settlement.transactions.find((t) => t.stage === "finalize")?.url ??
    (theater.live.kind === "finalized" &&
    ceremonyClimb !== null &&
    theater.live.roundId === ceremonyClimb.snapshot.roundId
      ? theater.live.finalizeTransactionUrl
      : null);
  const ceremonyHero: TheaterReplayHero | null = ceremonyClimb
    ? {
        type: "replay",
        roundId: ceremonyClimb.snapshot.roundId,
        crashPointBps: ceremonyClimb.reveal.crashPointBps,
        displayCrashPoint: formatCrashPointBps(
          ceremonyClimb.reveal.crashPointBps
        ),
        finalizedAtSeconds: null,
        chainTimestamp: 0n,
        finalizeTransactionUrl,
        tape: ceremonyClimb.snapshot.tape,
        tiers: ceremonyClimb.snapshot.tiers,
      }
    : null;
  const graphHero = ceremonyHero ?? replayHero;

  const activeTicket = unsettledTicket ?? playerTicket ?? settlement.ticket;
  // Personal landing/tier readouts only apply to a ticket from the hero round.
  const heroTicket = ceremonyClimb
    ? ceremonyClimb.snapshot.ticket
    : replayHero
      ? ticketForRound(activeTicket, replayHero.roundId)
      : null;

  useStageAudio({
    mode,
    liveKind: theater.live.kind,
    countdownSeconds: theaterCountdownSeconds(theater.live),
    reducedMotion,
    crashPointBps: clockCrashPoint,
    progress: replayProgress,
    isComplete: climbComplete,
    playerTierBps: heroTicket?.leverageBps ?? null,
    restartNonce: ceremonyClimb?.startNonce ?? 0,
  });

  const entries = ceremonyClimb
    ? (ceremonyClimb.snapshot.tape?.entries ?? [])
    : theaterTapeEntries(theater);
  const chipStates = buildChipStates(
    entries,
    graphHero ? graphHero.crashPointBps : null,
    mode === "replay" || mode === "outcome" ? replayProgress : 0,
    mode === "outcome" || climbComplete
  );

  const graphLanding: TicketLanding | null = ceremonyClimb
    ? ceremonyClimb.reveal.outcome === "won"
      ? { kind: "won" }
      : { kind: "margin-called" }
    : replayHero
      ? ticketLanding(heroTicket, replayHero.crashPointBps)
      : null;

  // The dock's settle actions open the ceremony before running their flow so
  // the stage takes over on the same click.
  const {
    verifyAndSettle: rawVerifyAndSettle,
    claim: rawClaim,
    settleLoss: rawSettleLoss,
    retry: rawRetry,
    retryAction,
  } = settlement;
  const ceremonialVerifyAndSettle = useCallback(() => {
    beginCeremony();
    return rawVerifyAndSettle();
  }, [beginCeremony, rawVerifyAndSettle]);
  const ceremonialClaim = useCallback(() => {
    beginCeremony();
    return rawClaim();
  }, [beginCeremony, rawClaim]);
  const ceremonialSettleLoss = useCallback(() => {
    beginCeremony();
    return rawSettleLoss();
  }, [beginCeremony, rawSettleLoss]);
  const ceremonialRetry = useCallback(() => {
    if (retryAction !== "refresh") beginCeremony();
    return rawRetry();
  }, [beginCeremony, rawRetry, retryAction]);
  const stageSettlement: typeof settlement = {
    ...settlement,
    verifyAndSettle: ceremonialVerifyAndSettle,
    claim: ceremonialClaim,
    settleLoss: ceremonialSettleLoss,
    retry: ceremonialRetry,
  };

  const countdownSeconds = theaterCountdownSeconds(theater.live);
  const urgency = countdownUrgency(mode, countdownSeconds);
  const showLockedLabel =
    mode === "awaiting-settle" ||
    mode === "settling" ||
    theater.live.kind === "delayed" ||
    theater.live.kind === "expired";

  const liveTimeline = theaterLiveTimeline(theater.live);
  const countdownLabel = liveTimeline
    ? formatTimelineCountdownLabel(liveTimeline)
    : null;

  const actionPhase = theaterLivePhase(theater.live);
  const actionRoundId = liveRoundId;
  const showOutcomeGraph =
    (mode === "replay" || mode === "outcome") && graphHero !== null;

  const canvasProps: CrashCanvasProps = {
    mode,
    countdownSeconds:
      mode === "awaiting-settle" || mode === "settling" ? 0 : countdownSeconds,
    urgency,
    locked: showLockedLabel && mode !== "countdown",
    entries,
    playerAddress,
    chipStates,
    outcomeKind: mode === "outcome" ? (graphLanding?.kind ?? null) : null,
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
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-mode={mode}
      data-testid="crash-stage"
    >
      <div className="absolute inset-0">
        {theater.reducedMotion ? (
          showOutcomeGraph ? null : (
            <ReducedMotionFloor
              countdownSeconds={countdownSeconds}
              locked={showLockedLabel && mode !== "countdown"}
              mode={mode}
              urgency={urgency}
            />
          )
        ) : (
          <CrashCanvas {...canvasProps} />
        )}
      </div>

      <div className="pointer-events-none relative z-20 flex min-h-0 flex-1 flex-col pt-[6.75rem]">
        <StageHud
          countdownLabel={countdownLabel}
          countdownSeconds={countdownSeconds}
          isAlert={settlement.status === "error" && ceremony.phase === "idle"}
          playerTicket={activeTicket}
          statusMessage={
            // The stepper and outcome panel own settlement messaging while a
            // ceremony is active.
            ceremony.phase === "idle"
              ? stageStatusMessage(mode, settlement)
              : null
          }
          suggestSound={mode === "replay" || mode === "outcome"}
        />

        <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-2 sm:px-6">
          {mode === "settling" ? (
            <StageVerifyProgress
              onCancel={() => ceremonyDispatch({ type: "reset" })}
              settlement={stageSettlement}
            />
          ) : showOutcomeGraph && graphHero && graphLanding ? (
            <StageOutcomeGraph
              landing={graphLanding}
              playerTierBps={heroTicket?.leverageBps ?? null}
              progress={replayProgress}
              reducedMotion={theater.reducedMotion}
              replayHero={graphHero}
            />
          ) : null}
        </div>

        {ceremony.phase === "landed" && ceremonyClimb ? (
          <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
            <StageOutcomePanel
              finalizeTransactionUrl={finalizeTransactionUrl}
              onContinue={() => ceremonyDispatch({ type: "acknowledge" })}
              onRewatch={() => ceremonyDispatch({ type: "rewatch" })}
              reducedMotion={theater.reducedMotion}
              reveal={ceremonyClimb.reveal}
              settleConfirmed={settleReceiptOk}
              settlement={stageSettlement}
              snapshot={ceremonyClimb.snapshot}
            />
          </div>
        ) : ceremony.phase !== "idle" ? null : actionRoundId !== null &&
          actionPhase !== null ? (
          <StageActions
            countdownSeconds={countdownSeconds ?? 0}
            hasTicket={liveRoundTicket !== null || hasStaleUnsettledTicket}
            mode={mode}
            phase={actionPhase}
            roundId={actionRoundId}
            settlement={stageSettlement}
          />
        ) : null}
      </div>
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
}: {
  mode: CrashStageMode;
  countdownSeconds: number | null;
  urgency: CountdownUrgency;
  locked: boolean;
}) {
  const urgencyClass =
    urgency === "threat"
      ? "text-[var(--t-threat)]"
      : urgency === "warn"
        ? "text-[var(--t-urgency)]"
        : urgency === "locked"
          ? "text-[var(--t-accent)]"
          : "text-[var(--t-green-hot)]";

  if (mode === "replay" || mode === "outcome") {
    return null;
  }

  return (
    <div className="flex h-full items-center justify-center px-4 pb-40 pt-28">
      <p
        className={`font-[family-name:var(--font-plex-sans)] text-7xl font-black tabular-nums sm:text-9xl ${urgencyClass}`}
        data-testid="reduced-motion-countdown"
      >
        {locked && (mode === "awaiting-settle" || mode === "settling")
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
  if (mode === "awaiting-settle" || mode === "settling" || mode === "expired") {
    return "locked";
  }
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
    return "Round locked. Verify and settle to see whether your Ticket won or took the margin call.";
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
  restartNonce: number;
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
    restartNonce: options.restartNonce,
  });
}
