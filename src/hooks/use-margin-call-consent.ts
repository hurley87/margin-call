"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Desk phone switch state for the signed-in player.
 * Defaults to off when unauthenticated or no consent row exists.
 */
export function useMarginCallConsent(walletAddress: `0x${string}` | null) {
  const consent = useQuery(api.marginCall.myMarginCallConsent);
  const setConsent = useMutation(api.marginCall.setMarginCallConsent);

  const optedIn = consent?.optedIn === true;
  const isReady = consent !== undefined;

  const setOptedIn = useCallback(
    async (next: boolean) => {
      if (!walletAddress) return;
      await setConsent({ optedIn: next, walletAddress });
    },
    [setConsent, walletAddress]
  );

  return { optedIn, isReady, setOptedIn };
}
