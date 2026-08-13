"use client";

import { useEffect, useReducer, useRef, type Dispatch } from "react";
import {
  advanceCeremony,
  IDLE_CEREMONY,
  type CeremonyEvent,
  type SettleCeremony,
} from "@/lib/settle-ceremony";

/**
 * Owns one settle-ceremony instance for the Floor. All transition logic lives
 * in `advanceCeremony`; this hook only adds the wallet-change reset so a
 * ceremony can never present another account's result.
 */
export function useSettleCeremony(
  walletAddress: string | null
): [SettleCeremony, Dispatch<CeremonyEvent>] {
  const [ceremony, dispatch] = useReducer(advanceCeremony, IDLE_CEREMONY);

  const previousWallet = useRef(walletAddress);
  useEffect(() => {
    if (previousWallet.current !== walletAddress) {
      previousWallet.current = walletAddress;
      dispatch({ type: "reset" });
    }
  }, [walletAddress]);

  return [ceremony, dispatch];
}
