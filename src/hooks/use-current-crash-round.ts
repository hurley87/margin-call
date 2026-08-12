"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import {
  deriveRoundPhase,
  formatCrashPointBps,
  getMarginCallCrashConfig,
  getRoundCountdownSeconds,
  isCrashPointPublished,
  isRoundInitialized,
  readCurrentCrashRound,
  type CrashRoundPhase,
} from "@/lib/margin-call-crash";
import {
  getRoundTimeline,
  ROUND_INTERVAL_SECONDS,
  type RoundTimeline,
} from "@/lib/round-timeline";

type RoundSnapshot = Awaited<ReturnType<typeof readCurrentCrashRound>> & {
  receivedAt: number;
};

export type CurrentCrashRoundStatus =
  "loading" | "ready" | "error" | "unavailable";

export type CurrentCrashRoundView = { retry: () => Promise<void> } & (
  | { status: "loading" }
  | { status: "error" | "unavailable"; error: string }
  | {
      status: "ready";
      roundId: bigint;
      phase: CrashRoundPhase;
      countdownSeconds: number;
      crashRandom: Hex | null;
      /** Raw verified Crash Point in basis points; null until finalized. */
      crashPointBps: bigint | null;
      displayCrashPoint: string | null;
      /** Unix seconds of RoundFinalized; null until finalized. */
      finalizedAtSeconds: bigint | null;
      /** Client-corrected chain time used for phase and countdown. */
      chainTimestamp: bigint;
      /** Deterministic lifecycle strip model derived from the epoch grid. */
      timeline: RoundTimeline;
      openingTransactionUrl: string | null;
      revealTransactionUrl: string | null;
      finalizeTransactionUrl: string | null;
      expireTransactionUrl: string | null;
      gameContractUrl: string;
      incoContractUrl: string;
      blockNumber: bigint;
    }
);

const POLL_INTERVAL_MS = 10_000;
const loadError =
  "The current round could not be refreshed from Base Sepolia. Retry the read.";
const configurationError =
  "Crash round reads are not configured for this Base Sepolia deployment.";

export function useCurrentCrashRound(): CurrentCrashRoundView {
  const config = useMemo(() => getMarginCallCrashConfig(), []);
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  const [status, setStatus] = useState<CurrentCrashRoundStatus>("loading");
  const [clock, setClock] = useState(Date.now);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!config || inFlight.current) return;
    inFlight.current = true;

    try {
      const next = await readCurrentCrashRound(config);
      setSnapshot({ ...next, receivedAt: Date.now() });
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [config]);

  useEffect(() => {
    if (!config) {
      setStatus("unavailable");
      return;
    }

    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [config, refresh]);

  const hasSnapshot = snapshot !== null;
  useEffect(() => {
    if (!hasSnapshot) return;
    const tick = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(tick);
  }, [hasSnapshot]);

  // Refresh just after the next deterministic grid boundary (entry lock, next
  // epoch) so those phase flips don't wait out the 10-second poll.
  useEffect(() => {
    if (!snapshot) return;
    const chainTimestamp = correctedChainTimestamp(snapshot, Date.now());
    const boundaries = [
      snapshot.round.lockAt,
      snapshot.round.openAt + ROUND_INTERVAL_SECONDS,
    ].filter((boundary) => boundary > chainTimestamp);
    if (boundaries.length === 0) return;
    const next = boundaries.reduce((a, b) => (a < b ? a : b));
    const delayMs = (Number(next - chainTimestamp) + 1) * 1_000;
    const timer = window.setTimeout(() => void refresh(), delayMs);
    return () => window.clearTimeout(timer);
  }, [snapshot, refresh]);

  if (status === "ready" && snapshot) {
    const chainTimestamp = correctedChainTimestamp(snapshot, clock);
    const published = isCrashPointPublished(snapshot.round);
    return {
      status: "ready",
      roundId: snapshot.currentRoundId,
      phase: deriveRoundPhase(snapshot.round, chainTimestamp),
      countdownSeconds: getRoundCountdownSeconds(
        snapshot.round,
        chainTimestamp
      ),
      crashRandom: isRoundInitialized(snapshot.round)
        ? snapshot.round.crashRandom
        : null,
      crashPointBps: published ? snapshot.round.crashPointBps : null,
      displayCrashPoint: published
        ? formatCrashPointBps(snapshot.round.crashPointBps)
        : null,
      finalizedAtSeconds: published ? snapshot.finalizedAtSeconds : null,
      chainTimestamp,
      timeline: getRoundTimeline(snapshot.round, chainTimestamp),
      openingTransactionUrl: snapshot.openingTransactionUrl,
      revealTransactionUrl: snapshot.revealTransactionUrl,
      finalizeTransactionUrl: snapshot.finalizeTransactionUrl,
      expireTransactionUrl: snapshot.expireTransactionUrl,
      gameContractUrl: snapshot.gameContractUrl,
      incoContractUrl: snapshot.incoContractUrl,
      blockNumber: snapshot.blockNumber,
      retry: refresh,
    };
  }
  if (status === "error") return { status, error: loadError, retry: refresh };
  if (status === "unavailable") {
    return { status, error: configurationError, retry: refresh };
  }
  return { status: "loading", retry: refresh };
}

function correctedChainTimestamp(
  snapshot: RoundSnapshot,
  clock: number
): bigint {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((clock - snapshot.receivedAt) / 1_000)
  );
  return snapshot.chainTimestamp + BigInt(elapsedSeconds);
}
