"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMarginCallCrashConfig,
  readPlayerTicketHistory,
  type PlayerTicketHistoryItem,
} from "@/lib/margin-call-crash";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { subscribeToWalletBalanceChanges } from "@/lib/wallet-balance-sync";

const POLL_INTERVAL_MS = 10_000;
const loadError =
  "Personal history could not be refreshed from Base Sepolia. Retry the read.";
const configurationError =
  "Crash history reads are not configured for this Base Sepolia deployment.";

export type PersonalHistoryView = { retry: () => Promise<void> } & (
  | { status: "loading"; walletAddress: string | null }
  | {
      status: "error" | "unavailable";
      error: string;
      walletAddress: string | null;
    }
  | {
      status: "ready";
      walletAddress: string;
      tickets: PlayerTicketHistoryItem[];
    }
);

export function usePersonalHistory(): PersonalHistoryView {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const config = useMemo(() => getMarginCallCrashConfig(), []);
  const [tickets, setTickets] = useState<PlayerTicketHistoryItem[] | null>(
    null
  );
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!config || !walletAddress || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await readPlayerTicketHistory(config, walletAddress);
      setTickets(next);
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [config, walletAddress]);

  useEffect(() => {
    if (!config) {
      setStatus("unavailable");
      return;
    }
    if (!walletAddress) {
      setTickets(null);
      setStatus("loading");
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [config, refresh, walletAddress]);

  useEffect(
    () =>
      subscribeToWalletBalanceChanges(() => {
        if (!config || !walletAddress || inFlight.current) return;
        void refresh();
      }),
    [config, refresh, walletAddress]
  );

  if (!walletAddress) {
    return { status: "loading", walletAddress: null, retry: refresh };
  }
  if (status === "ready" && tickets) {
    return { status: "ready", walletAddress, tickets, retry: refresh };
  }
  if (status === "error") {
    return { status, error: loadError, walletAddress, retry: refresh };
  }
  if (status === "unavailable") {
    return {
      status,
      error: configurationError,
      walletAddress,
      retry: refresh,
    };
  }
  return { status: "loading", walletAddress, retry: refresh };
}
