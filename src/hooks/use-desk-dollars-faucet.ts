"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  deskDollarsFaucetAbi,
  getDeskDollarsConfig,
  readDeskDollarsState,
} from "@/lib/desk-dollars";
import {
  confirmSponsoredCall,
  submitSponsoredCall,
} from "@/lib/sponsored-call";
import {
  notifyWalletBalancesChanged,
  subscribeToWalletBalanceChanges,
} from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

type FaucetState = {
  balance: bigint | null;
  decimals: number | null;
  nextClaimAt: bigint | null;
  status:
    "loading" | "ready" | "pending" | "confirmed" | "error" | "unavailable";
  error: string | null;
};

export type DeskDollarsFaucetChrome = {
  /** Eligible / cooldown copy for an empty wallet. */
  showOffer: boolean;
  /** Claim / pending / retry control. */
  showClaimButton: boolean;
};

/**
 * Faucet visibility policy: hide claim chrome when funded, never flash claim
 * while balance is unknown, and keep pending/retry visible during an in-flight claim.
 */
export function getDeskDollarsFaucetChrome(input: {
  balance: bigint | null;
  status: FaucetState["status"];
  canRetry: boolean;
}): DeskDollarsFaucetChrome {
  const claimInFlight = input.status === "pending" || input.canRetry;
  const offerEmptyFaucet = input.status === "ready" && input.balance === 0n;
  return {
    showOffer: offerEmptyFaucet,
    showClaimButton: claimInFlight || offerEmptyFaucet,
  };
}

const initialState: FaucetState = {
  balance: null,
  decimals: null,
  nextClaimAt: null,
  status: "loading",
  error: null,
};
const claimFailed =
  "We couldn't complete your Desk Dollars claim. Please try again.";
const claimUnconfirmed =
  "Your claim was submitted, but we couldn't confirm it yet. Retry to check its status.";
const refreshFailed =
  "Your claim was confirmed, but we couldn't refresh your Desk Dollars balance. Please try again.";
const loadFailed =
  "We couldn't load your Desk Dollars balance and faucet eligibility. Please try again.";

export function useDeskDollarsFaucet(walletAddress: Address | null) {
  const transaction = usePrivySponsoredTransaction();
  const config = useMemo(() => getDeskDollarsConfig(), []);
  const [state, setState] = useState<FaucetState>(initialState);
  const [, setCooldownTick] = useState(0);
  const inFlight = useRef(false);
  const retryKind = useRef<
    "claim" | "refresh" | "refresh-after-confirmation" | null
  >(null);
  // A claim whose transaction was submitted but whose receipt is unresolved.
  // Retry must re-check this hash — resubmitting could hit the cooldown.
  const pendingClaim = useRef<Hex | null>(null);

  const refresh = useCallback(
    async (preserveConfirmation = false): Promise<boolean> => {
      if (!config || !walletAddress) return false;
      if (!preserveConfirmation) {
        setState((current) => ({ ...current, status: "loading", error: null }));
      }
      try {
        const next = await readDeskDollarsState(config, walletAddress);
        retryKind.current = null;
        setState({ ...next, status: "ready", error: null });
        return true;
      } catch {
        retryKind.current = preserveConfirmation
          ? "refresh-after-confirmation"
          : "refresh";
        setState((current) => ({
          ...current,
          status: "error",
          error: preserveConfirmation ? refreshFailed : loadFailed,
        }));
        return false;
      }
    },
    [config, walletAddress]
  );

  useEffect(() => {
    if (!config) {
      setState({
        ...initialState,
        status: "unavailable",
        error:
          "Desk Dollars is not configured for this Base Sepolia deployment.",
      });
      return;
    }
    if (!walletAddress) return;
    void refresh();
  }, [config, refresh, walletAddress]);

  // Background re-read when a sibling panel changes wallet balances. Values
  // merge silently; the visible status and error copy stay authoritative.
  useEffect(
    () =>
      subscribeToWalletBalanceChanges(() => {
        if (!config || !walletAddress || inFlight.current) return;
        void readDeskDollarsState(config, walletAddress)
          .then((next) => setState((current) => ({ ...current, ...next })))
          .catch(() => undefined);
      }),
    [config, walletAddress]
  );

  // Re-render each second while a cooldown is pending so the countdown copy
  // updates and the claim button re-enables at the boundary without a reload.
  useEffect(() => {
    const target = state.nextClaimAt;
    if (target === null || target <= BigInt(Math.floor(Date.now() / 1000)))
      return;
    const tick = setInterval(() => {
      setCooldownTick((count) => count + 1);
      if (target <= BigInt(Math.floor(Date.now() / 1000))) clearInterval(tick);
    }, 1_000);
    return () => clearInterval(tick);
  }, [state.nextClaimAt]);

  const claim = useCallback(async (): Promise<boolean> => {
    if (!config || !walletAddress || inFlight.current) return false;
    inFlight.current = true;
    retryKind.current = "claim";
    setState((current) => ({ ...current, status: "pending", error: null }));
    try {
      const result = pendingClaim.current
        ? await confirmSponsoredCall(pendingClaim.current)
        : await submitSponsoredCall(
            transaction,
            {
              to: config.faucetAddress,
              data: encodeFunctionData({
                abi: deskDollarsFaucetAbi,
                functionName: "claim",
              }) as Hex,
            },
            (hash) => {
              pendingClaim.current = hash;
            }
          );
      if (result.outcome !== "confirmation-unknown")
        pendingClaim.current = null;
      if (result.outcome === "confirmed") {
        setState((current) => ({
          ...current,
          status: "confirmed",
          error: null,
        }));
        notifyWalletBalancesChanged();
        return await refresh(true);
      }
      setState((current) => ({
        ...current,
        status: "error",
        error:
          result.outcome === "submission-failed"
            ? (result.message ?? claimFailed)
            : result.outcome === "confirmation-unknown"
              ? claimUnconfirmed
              : claimFailed,
      }));
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [config, transaction, walletAddress, refresh]);

  const retry = useCallback(async () => {
    if (retryKind.current === "refresh") return refresh();
    if (retryKind.current === "refresh-after-confirmation")
      return refresh(true);
    return claim();
  }, [claim, refresh]);

  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    ...state,
    eligible: state.nextClaimAt !== null && state.nextClaimAt <= now,
    cooldownSeconds:
      state.nextClaimAt !== null && state.nextClaimAt > now
        ? state.nextClaimAt - now
        : 0n,
    canClaim:
      !!config &&
      !!walletAddress &&
      state.status === "ready" &&
      state.nextClaimAt !== null &&
      state.nextClaimAt <= now &&
      !inFlight.current,
    canRetry: state.status === "error" && retryKind.current !== null,
    claim,
    retry,
  };
}

export type DeskDollarsFaucetSession = ReturnType<typeof useDeskDollarsFaucet>;
