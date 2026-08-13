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
};

/**
 * Fires a one-shot `requestMarginCall` when ticket facts are present and the
 * Desk phone switch is on. Callers mount this only after a personal loss is
 * known (ticket settlement). Server idempotency is the once-per-ticket gate.
 */
export function useMarginCallVoice(options: MarginCallVoiceOptions) {
  const { ticketId, roundId, walletAddress } = options;

  const consent = useQuery(api.marginCall.myMarginCallConsent);
  const requestMarginCall = useMutation(api.marginCall.requestMarginCall);
  const firedForTicket = useRef<string | null>(null);

  useEffect(() => {
    if (!ticketId || !roundId || !walletAddress) return;
    if (consent?.optedIn !== true) return;
    if (firedForTicket.current === ticketId) return;

    firedForTicket.current = ticketId;
    void requestMarginCall({
      ticketId,
      roundId,
      walletAddress,
    }).catch(() => {
      // Promotional overlay — never surface failures in settlement UI.
      if (firedForTicket.current === ticketId) {
        firedForTicket.current = null;
      }
    });
  }, [consent?.optedIn, requestMarginCall, roundId, ticketId, walletAddress]);
}
