"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMarginCallVoice } from "@/hooks/use-margin-call-voice";
import { getEvmWalletAddress } from "@/lib/privy/wallet";

type MarginCallVoiceTriggerProps = {
  ticketId: bigint;
  roundId: bigint;
};

/**
 * Owns Privy wallet resolution and the promotional desk-phone mutation.
 * Mount only when a personal liquidation is already known (ticket settlement).
 * Renders nothing.
 */
export function MarginCallVoiceTrigger({
  ticketId,
  roundId,
}: MarginCallVoiceTriggerProps) {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);

  useMarginCallVoice({
    ticketId: ticketId.toString(),
    roundId: roundId.toString(),
    walletAddress,
  });

  return null;
}
