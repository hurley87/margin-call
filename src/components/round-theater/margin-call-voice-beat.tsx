"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMarginCallVoice } from "@/hooks/use-margin-call-voice";
import { getEvmWalletAddress } from "@/lib/privy/wallet";

type MarginCallVoiceBeatProps = {
  ticketId: bigint | null;
  roundId: bigint;
  /** True when the player's ticket was liquidated (crash before their tier). */
  isLiquidated: boolean;
  /** True when the dramatized climb finished (or reduced-motion static result). */
  isComplete: boolean;
};

/**
 * Owns Privy wallet resolution and the promotional desk-phone mutation.
 * Renders nothing — keeps auth/network side effects out of ReplayStage.
 */
export function MarginCallVoiceBeat({
  ticketId,
  roundId,
  isLiquidated,
  isComplete,
}: MarginCallVoiceBeatProps) {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);

  useMarginCallVoice({
    ticketId: ticketId !== null ? ticketId.toString() : null,
    roundId: roundId.toString(),
    walletAddress,
    isLiquidated,
    isComplete,
  });

  return null;
}
