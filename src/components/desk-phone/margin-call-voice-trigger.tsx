"use client";

import { useMarginCallVoice } from "@/hooks/use-margin-call-voice";

type MarginCallVoiceTriggerProps = {
  ticketId: bigint;
  roundId: bigint;
  /** Embedded wallet already proven by AuthGate / settlement. */
  walletAddress: `0x${string}`;
};

/**
 * Promotional desk-phone mutation for a known personal liquidation.
 * Mount only from ticket settlement. Renders nothing.
 */
export function MarginCallVoiceTrigger({
  ticketId,
  roundId,
  walletAddress,
}: MarginCallVoiceTriggerProps) {
  useMarginCallVoice({
    ticketId: ticketId.toString(),
    roundId: roundId.toString(),
    walletAddress,
  });

  return null;
}
