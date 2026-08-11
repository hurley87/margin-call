"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo } from "react";
import {
  readPlayerTicketHistory,
  type MarginCallCrashConfig,
  type PlayerTicketHistoryItem,
} from "@/lib/margin-call-crash";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { subscribeToWalletBalanceChanges } from "@/lib/wallet-balance-sync";
import {
  historyConfigurationError,
  usePolledCrashRead,
} from "./use-polled-crash-read";

const loadError =
  "Personal history could not be refreshed from Base Sepolia. Retry the read.";

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
  const read = useMemo(
    () =>
      walletAddress
        ? (config: MarginCallCrashConfig) =>
            readPlayerTicketHistory(config, walletAddress)
        : null,
    [walletAddress]
  );
  const { data: tickets, status, refresh } = usePolledCrashRead(read);

  useEffect(
    () => subscribeToWalletBalanceChanges(() => void refresh()),
    [refresh]
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
      error: historyConfigurationError,
      walletAddress,
      retry: refresh,
    };
  }
  return { status: "loading", walletAddress, retry: refresh };
}
