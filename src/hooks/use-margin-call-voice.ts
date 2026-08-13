"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

type MarginCallVoiceOptions = {
  /** Ticket id as decimal string. */
  ticketId: string | null;
  /** Round id as decimal string. */
  roundId: string | null;
  walletAddress: `0x${string}` | null;
  /** True when the player's ticket was liquidated (crash before their tier). */
  isLiquidated: boolean;
  /** True when the dramatized climb finished (or reduced-motion static result). */
  isComplete: boolean;
};

/**
 * Fires a one-shot `requestMarginCall` when the replay hard-stop liquidates
 * the signed-in player and their Desk phone switch is on.
 */
export function useMarginCallVoice(options: MarginCallVoiceOptions) {
  const { ticketId, roundId, walletAddress, isLiquidated, isComplete } =
    options;

  const consent = useQuery(api.marginCall.myMarginCallConsent);
  const requestMarginCall = useMutation(api.marginCall.requestMarginCall);
  const firedForTicket = useRef<string | null>(null);

  useEffect(() => {
    if (!isComplete || !isLiquidated) return;
    if (!ticketId || !roundId || !walletAddress) return;
    if (consent?.optedIn !== true) return;
    if (firedForTicket.current === ticketId) return;

    firedForTicket.current = ticketId;
    void requestMarginCall({
      ticketId,
      roundId,
      walletAddress,
    }).catch(() => {
      // Promotional overlay — never surface failures in the theater UI.
      if (firedForTicket.current === ticketId) {
        firedForTicket.current = null;
      }
    });
  }, [
    consent?.optedIn,
    isComplete,
    isLiquidated,
    requestMarginCall,
    roundId,
    ticketId,
    walletAddress,
  ]);
}
