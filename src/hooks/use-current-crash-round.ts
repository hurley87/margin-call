"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import {
  deriveRoundPhase,
  getMarginCallCrashConfig,
  getRoundCountdownSeconds,
  readCurrentCrashRound,
  type CrashRound,
  type CrashRoundPhase,
} from "@/lib/margin-call-crash";

type RoundSnapshot = Awaited<ReturnType<typeof readCurrentCrashRound>> & {
  receivedAt: number;
};

export type CurrentCrashRoundStatus =
  "loading" | "ready" | "error" | "unavailable";

export type CurrentCrashRoundView = {
  status: CurrentCrashRoundStatus;
  error: string | null;
  roundId: bigint | null;
  phase: CrashRoundPhase | null;
  countdownSeconds: number;
  crashRandom: Hex | null;
  openingTransactionUrl: string | null;
  blockNumber: bigint | null;
  retry: () => Promise<void>;
};

const POLL_INTERVAL_MS = 10_000;
const loadError =
  "The current round could not be refreshed from Base Sepolia. Retry the read.";
const configurationError =
  "Crash round reads are not configured for this Base Sepolia deployment.";

export function useCurrentCrashRound(): CurrentCrashRoundView {
  const config = useMemo(() => getMarginCallCrashConfig(), []);
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  const [status, setStatus] = useState<CurrentCrashRoundStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!config || inFlight.current) return;
    inFlight.current = true;

    try {
      const next = await readCurrentCrashRound(config);
      setSnapshot({ ...next, receivedAt: Date.now() });
      setStatus("ready");
      setError(null);
    } catch {
      setStatus("error");
      setError(loadError);
    } finally {
      inFlight.current = false;
    }
  }, [config]);

  useEffect(() => {
    if (!config) {
      setStatus("unavailable");
      setError(configurationError);
      return;
    }

    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [config, refresh]);

  useEffect(() => {
    if (!snapshot) return;
    const tick = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(tick);
  }, [snapshot]);

  const round = snapshot?.round ?? null;
  const chainTimestamp = snapshot
    ? correctedChainTimestamp(snapshot, clock)
    : null;
  const phase =
    round && chainTimestamp !== null
      ? deriveRoundPhase(round, chainTimestamp)
      : null;

  return {
    status,
    error,
    roundId: snapshot?.currentRoundId ?? null,
    phase,
    countdownSeconds:
      round && chainTimestamp !== null
        ? getRoundCountdownSeconds(round, chainTimestamp)
        : 0,
    crashRandom: initializedHandle(round),
    openingTransactionUrl: snapshot?.openingTransactionUrl ?? null,
    blockNumber: snapshot?.blockNumber ?? null,
    retry: refresh,
  };
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

function initializedHandle(round: CrashRound | null): Hex | null {
  return round && round.status !== 0 ? round.crashRandom : null;
}
