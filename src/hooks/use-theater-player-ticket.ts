"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMemo } from "react";
import { usePolledCrashRead } from "@/hooks/use-polled-crash-read";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import {
  readPlayerTicket,
  type CrashTicket,
  type MarginCallCrashConfig,
} from "@/lib/margin-call-crash";

/**
 * Read-only view of the signed-in player's ticket for one round, so the
 * theater can highlight their tier. Never submits transactions — settlement
 * lives on the ticket surfaces.
 */
export function useTheaterPlayerTicket(roundId: bigint | null): {
  ticket: CrashTicket | null;
} {
  const { authenticated, user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const player = authenticated && walletAddress ? walletAddress : null;

  const read = useMemo(() => {
    if (roundId === null || player === null) return null;
    return (config: MarginCallCrashConfig) =>
      readPlayerTicket(config.address, roundId, player);
  }, [player, roundId]);

  const poll = usePolledCrashRead(read);
  return { ticket: poll.data };
}
