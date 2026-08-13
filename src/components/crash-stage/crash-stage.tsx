"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCrashRoundEntry } from "@/hooks/use-crash-round-entry";
import { useCrashTicketRefund } from "@/hooks/use-crash-ticket-refund";
import { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { useReplayClock } from "@/hooks/use-replay-clock";
import {
  useRoundTheater,
  type TheaterHero,
  type TheaterLive,
  type TheaterReplayHero,
  type TheaterView,
} from "@/hooks/use-round-theater";
import { useTheaterPlayerTicket } from "@/hooks/use-theater-player-ticket";
import {
  presentLanding,
  ticketLanding,
} from "@/components/round-theater/landing-frame";
import { RoundResultCard } from "@/components/round-theater/round-result-card";
import {
  canOfferEntry,
  ENTRY_LEVERAGE_TIERS_BPS,
  type CrashTicket,
  type TicketTapeEntry,
} from "@/lib/margin-call-crash";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { formatTimelineCountdownLabel } from "@/lib/round-phase-copy";
import {
  getClosedTiersAtProgress,
  getTierCloseProgress,
  isReplayComplete,
} from "@/lib/round-replay";
import { getTheaterAudio } from "@/lib/theater-audio";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import type { CrashCanvasProps } from "./crash-canvas";
import type { TicketChipState } from "./scenes/ticket-field";
import type { CountdownUrgency } from "./scenes/countdown-scene";
import { StageCta } from "./overlay/stage-cta";
import { StageHud } from "./overlay/stage-hud";
import {
  deriveCrashStageMode,
  deriveStageCtaKind,
  type CrashStageMode,
} from "./use-crash-stage-mode";

const CrashCanvas = dynamic(
  () => import("./crash-canvas").then((m) => m.CrashCanvas),
  { ssr: false, loading: () => <CanvasFallback /> }
);

const settlementStatusCopy: Partial<Record<string, string>> = {
  loading: "Loading your ticket settlement state…",
  "reveal-submitting": "Submitting reveal request…",
  "reveal-pending": "Reveal pending until its Base Sepolia receipt succeeds…",
  attesting: "Fetching the covalidator attestation for your round…",
  "finalize-submitting": "Submitting finalization…",
  "finalize-pending":
    "Finalization pending until its Base Sepolia receipt succeeds…",
  "claim-submitting": "Submitting your claim…",
  "claim-pending": "Claim pending until its Base Sepolia receipt succeeds…",
  "settle-submitting": "Submitting loss settlement…",
  "settle-pending":
    "Loss settlement pending until its Base Sepolia receipt succeeds…",
  confirmed: "Settlement confirmed on Base Sepolia.",
};

/**
 * Immersive Floor orchestrator: composes theater, entry, and settlement into
 * a full-bleed Three.js pit with huge DOM CTAs.
 */
export function CrashStage() {
  const theater = useRoundTheater();
  const { user, authenticated } = usePrivy();
  const playerAddress =
    authenticated && user ? getEvmWalletAddress(user) : null;

  const displayRoundId = resolveDisplayRoundId(theater.live, theater.hero);
  const { ticket: playerTicket } = useTheaterPlayerTicket(displayRoundId);

  const entryRoundId = liveRoundId(theater.live) ?? 0n;
  const entry = useCrashRoundEntry({ roundId: entryRoundId });
  const settlement = useCrashTicketSettlement();
  const refund = useCrashTicketRefund();

  const [settledThisSession, setSettledThisSession] = useState(false);
  const previousSettlementStatus = useRef(settlement.status);
  const previousLiveId = useRef<string | null>(null);
  const liveIdKey = liveRoundId(theater.live)?.toString() ?? null;

  useEffect(() => {
    if (
      settlement.status === "confirmed" &&
      previousSettlementStatus.current !== "confirmed"
    ) {
      setSettledThisSession(true);
    }
    previousSettlementStatus.current = settlement.status;
  }, [settlement.status]);

  useEffect(() => {
    if (
      previousLiveId.current !== null &&
      previousLiveId.current !== liveIdKey
    ) {
      setSettledThisSession(false);
    }
    previousLiveId.current = liveIdKey;
  }, [liveIdKey]);

  const replayHero: TheaterReplayHero | null =
    theater.hero.type === "replay" ? theater.hero : null;

  const unsettledTicket =
    (playerTicket && !playerTicket.settled ? playerTicket : null) ??
    (settlement.ticket && !settlement.ticket.settled
      ? settlement.ticket
      : null);
  const hasUnsettledTicket = unsettledTicket !== null;

  const shouldRunReplayClock =
    replayHero !== null && (settledThisSession || !hasUnsettledTicket);

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
    settledThisSession,
    hasReplayHero: replayHero !== null,
    isReplayComplete: climbComplete,
    outcome: settlement.outcome,
  });

  useStageAudio({
    mode,
    liveKind: theater.live.kind,
    countdownSeconds: openCountdownSeconds(theater.live),
    reducedMotion: theater.reducedMotion,
    crashPointBps:
      shouldRunReplayClock && replayHero ? replayHero.crashPointBps : null,
    progress: replayProgress,
    isComplete: climbComplete,
    playerTierBps:
      unsettledTicket?.leverageBps ?? playerTicket?.leverageBps ?? null,
  });

  const entries = liveTapeEntries(theater);
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

  const activeTicket =
    unsettledTicket ?? playerTicket ?? entry.ticket ?? settlement.ticket;

  const landing = useMemo(() => {
    if (!replayHero || mode !== "outcome") return null;
    return presentLanding(
      ticketLanding(activeTicket, replayHero.crashPointBps),
      replayHero.displayCrashPoint
    );
  }, [activeTicket, mode, replayHero]);

  const isOpen = theater.live.kind === "open";
  const countdownSeconds = openCountdownSeconds(theater.live);
  const offerEntry =
    isOpen &&
    canOfferEntry("open", countdownSeconds ?? 0) &&
    !entry.ticket &&
    !playerTicket;

  const ctaKind = deriveStageCtaKind({
    mode,
    isOpen: offerEntry,
    hasTicket: Boolean(entry.ticket ?? playerTicket),
    canEnter: entry.canEnter && offerEntry,
    canVerify: settlement.canVerify,
    canClaim: settlement.canClaim,
    canSettle: settlement.canSettle,
    canRefund: refund.canRefund,
    canExpire: refund.canExpire,
    canRetry: settlement.canRetry || entry.canRetry || refund.canRetry,
  });

  const urgency = countdownUrgency(mode, countdownSeconds);
  const showLockedLabel =
    mode === "awaiting-settle" ||
    theater.live.kind === "delayed" ||
    theater.live.kind === "expired";

  const statusMessage = stageStatusMessage({
    mode,
    theater,
    settlement,
    entry,
    refund,
    offerEntry,
  });

  const countdownLabel =
    theater.live.kind === "open" ||
    theater.live.kind === "delayed" ||
    theater.live.kind === "finalized" ||
    theater.live.kind === "expired"
      ? formatTimelineCountdownLabel(theater.live.timeline)
      : null;

  const txBusy =
    settlement.status.includes("submitting") ||
    settlement.status.includes("pending") ||
    settlement.status === "attesting" ||
    entry.status.includes("submitting") ||
    entry.status.includes("pending") ||
    refund.status.includes("submitting") ||
    refund.status.includes("pending");

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
        isAlert={
          settlement.status === "error" ||
          entry.status === "error" ||
          refund.status === "error"
        }
        playerTicket={activeTicket}
        showFaucet={offerEntry && Boolean(entry.walletAddress)}
        statusMessage={statusMessage}
        suggestSound={mode === "replay" || mode === "outcome"}
      />

      <StageCta
        canEnter={entry.canEnter && offerEntry}
        disabled={txBusy}
        expectedPayout={entry.expectedPayout}
        kind={ctaKind}
        needsApproval={entry.needsApproval}
        onClaim={() => void settlement.claim()}
        onEnter={() => void entry.enter()}
        onExpire={() => void refund.expireRound()}
        onRefund={() => void refund.refund()}
        onRetry={() => {
          if (settlement.canRetry) void settlement.retry();
          else if (entry.canRetry) void entry.retry();
          else if (refund.canRetry) void refund.retry();
        }}
        onSelectLeverage={entry.selectLeverage}
        onSelectMargin={entry.selectMargin}
        onSettle={() => void settlement.settleLoss()}
        onVerify={() => void settlement.verifyAndSettle()}
        retryLabel="Retry"
        selectedLeverageBps={entry.selectedLeverageBps}
        selectedMargin={entry.selectedMargin}
        walletRequired={!entry.walletAddress && ctaKind === "enter"}
      />
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

function liveRoundId(live: TheaterLive): bigint | null {
  switch (live.kind) {
    case "open":
    case "delayed":
    case "finalized":
    case "expired":
      return live.roundId;
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

function resolveDisplayRoundId(
  live: TheaterLive,
  hero: TheaterHero
): bigint | null {
  if (hero.type === "replay") return hero.roundId;
  return liveRoundId(live);
}

function openCountdownSeconds(live: TheaterLive): number | null {
  switch (live.kind) {
    case "open":
    case "delayed":
    case "finalized":
    case "expired":
      return live.timeline.countdown.seconds;
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

function liveTapeEntries(theater: TheaterView): readonly TicketTapeEntry[] {
  const live = theater.live;
  if (
    live.kind === "open" ||
    live.kind === "delayed" ||
    live.kind === "finalized" ||
    live.kind === "expired"
  ) {
    return live.tape?.entries ?? [];
  }
  if (theater.hero.type === "replay") {
    return theater.hero.tape?.entries ?? [];
  }
  return [];
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

function stageStatusMessage(options: {
  mode: CrashStageMode;
  theater: TheaterView;
  settlement: ReturnType<typeof useCrashTicketSettlement>;
  entry: ReturnType<typeof useCrashRoundEntry>;
  refund: ReturnType<typeof useCrashTicketRefund>;
  offerEntry: boolean;
}): string | null {
  const { settlement, entry, refund, theater, mode, offerEntry } = options;
  if (settlement.status === "error") return settlement.error;
  if (entry.status === "error") return entry.error;
  if (refund.status === "error") return refund.error;

  const settleCopy = settlementStatusCopy[settlement.status];
  if (settleCopy && settlement.ticket) return settleCopy;

  if (
    entry.status === "approval-submitting" ||
    entry.status === "approval-pending"
  ) {
    return "Bounded approval pending…";
  }
  if (entry.status === "entry-submitting" || entry.status === "entry-pending") {
    return "Entry pending until its Base Sepolia receipt succeeds…";
  }
  if (mode === "awaiting-settle") {
    return "Round locked. Verify and settle to reveal the Crash Point and see the Replay.";
  }
  if (offerEntry && !entry.walletAddress) {
    return "Sign in with phone to enter this round with a sponsored transaction.";
  }
  if (theater.live.kind === "loading") return "Loading round…";
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
  const firedCountRef = useRef(0);
  const crashedRef = useRef(false);

  const closeThresholds = useMemo(() => {
    if (options.crashPointBps === null) return [];
    return ENTRY_LEVERAGE_TIERS_BPS.flatMap((tier) => {
      const closeAt = getTierCloseProgress(tier, options.crashPointBps!);
      if (closeAt === null) return [];
      return [
        {
          closeAt,
          isPlayerTier:
            options.playerTierBps !== null && tier === options.playerTierBps,
        },
      ];
    }).sort((a, b) => a.closeAt - b.closeAt);
  }, [options.crashPointBps, options.playerTierBps]);

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

  useEffect(() => {
    firedCountRef.current = 0;
    crashedRef.current = false;
  }, [options.crashPointBps]);

  useEffect(() => {
    if (options.reducedMotion || options.crashPointBps === null) return;
    if (options.mode !== "replay" && options.mode !== "outcome") return;

    while (
      firedCountRef.current < closeThresholds.length &&
      closeThresholds[firedCountRef.current]!.closeAt <= options.progress
    ) {
      const threshold = closeThresholds[firedCountRef.current]!;
      firedCountRef.current += 1;
      if (threshold.isPlayerTier) getTheaterAudio().playWinRegister();
      else getTheaterAudio().playTierClose();
    }
    if (options.isComplete && !crashedRef.current) {
      crashedRef.current = true;
      const audio = getTheaterAudio();
      audio.playCrashBell();
      audio.playPhoneRing();
    }
  }, [
    closeThresholds,
    options.crashPointBps,
    options.isComplete,
    options.mode,
    options.progress,
    options.reducedMotion,
  ]);
}
