"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import {
  deriveRoundPhase,
  getMarginCallCrashConfig,
  getRoundCountdownSeconds,
  isRoundInitialized,
  readCurrentCrashRound,
  type CrashRoundPhase,
} from "@/lib/margin-call-crash";

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
      openingTransactionUrl: string | null;
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

  if (status === "ready" && snapshot) {
    const chainTimestamp = correctedChainTimestamp(snapshot, clock);
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
      openingTransactionUrl: snapshot.openingTransactionUrl,
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
