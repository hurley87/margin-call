"use client";

import { useCallback, useRef, useState } from "react";
import {
  readRecentRoundHistory,
  readRoundHistoryDetail,
  type RoundHistoryDetail,
  type RoundHistoryItem,
} from "@/lib/margin-call-crash";
import {
  historyConfigurationError,
  usePolledCrashRead,
} from "./use-polled-crash-read";

const loadError =
  "Round history could not be refreshed from Base Sepolia. Retry the read.";

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
  const {
    config,
    data: rounds,
    status,
    refresh,
  } = usePolledCrashRead(readRecentRoundHistory);
  const [selectedRoundId, setSelectedRoundId] = useState<bigint | null>(null);
  const [detail, setDetail] = useState<RoundHistoryDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const detailInFlight = useRef(false);

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
    return { status, error: historyConfigurationError, retry: refresh };
  }
  return { status: "loading", retry: refresh };
}
