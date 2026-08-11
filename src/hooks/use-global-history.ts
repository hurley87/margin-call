"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMarginCallCrashConfig,
  readRecentRoundHistory,
  readRoundHistoryDetail,
  type RoundHistoryDetail,
  type RoundHistoryItem,
} from "@/lib/margin-call-crash";

const POLL_INTERVAL_MS = 10_000;
const loadError =
  "Round history could not be refreshed from Base Sepolia. Retry the read.";
const configurationError =
  "Crash history reads are not configured for this Base Sepolia deployment.";

export type GlobalHistoryView = { retry: () => Promise<void> } & (
  | { status: "loading" }
  | { status: "error" | "unavailable"; error: string }
  | {
      status: "ready";
      rounds: RoundHistoryItem[];
      selectedRoundId: bigint | null;
      detail: RoundHistoryDetail | null;
      detailStatus: "idle" | "loading" | "ready" | "error";
      selectRound: (roundId: bigint) => void;
      clearSelection: () => void;
    }
);

export function useGlobalHistory(): GlobalHistoryView {
  const config = useMemo(() => getMarginCallCrashConfig(), []);
  const [rounds, setRounds] = useState<RoundHistoryItem[] | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [selectedRoundId, setSelectedRoundId] = useState<bigint | null>(null);
  const [detail, setDetail] = useState<RoundHistoryDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const inFlight = useRef(false);
  const detailInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!config || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await readRecentRoundHistory(config);
      setRounds(next);
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [config]);

  const loadDetail = useCallback(
    async (roundId: bigint) => {
      if (!config || detailInFlight.current) return;
      detailInFlight.current = true;
      setDetailStatus("loading");
      try {
        const next = await readRoundHistoryDetail(config, roundId);
        setDetail(next);
        setDetailStatus(next ? "ready" : "error");
      } catch {
        setDetail(null);
        setDetailStatus("error");
      } finally {
        detailInFlight.current = false;
      }
    },
    [config]
  );

  useEffect(() => {
    if (!config) {
      setStatus("unavailable");
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [config, refresh]);

  const selectRound = useCallback(
    (roundId: bigint) => {
      setSelectedRoundId(roundId);
      void loadDetail(roundId);
    },
    [loadDetail]
  );

  const clearSelection = useCallback(() => {
    setSelectedRoundId(null);
    setDetail(null);
    setDetailStatus("idle");
  }, []);

  if (status === "ready" && rounds) {
    return {
      status: "ready",
      rounds,
      selectedRoundId,
      detail,
      detailStatus,
      selectRound,
      clearSelection,
      retry: refresh,
    };
  }
  if (status === "error") return { status, error: loadError, retry: refresh };
  if (status === "unavailable") {
    return { status, error: configurationError, retry: refresh };
  }
  return { status: "loading", retry: refresh };
}
