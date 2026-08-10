"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  deskDollarsFaucetAbi,
  deskDollarsPublicClient,
  getDeskDollarsConfig,
  readDeskDollarsState,
} from "@/lib/desk-dollars";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

type FaucetState = {
  balance: bigint | null;
  decimals: number | null;
  nextClaimAt: bigint | null;
  status:
    "loading" | "ready" | "pending" | "confirmed" | "error" | "unavailable";
  error: string | null;
};

const initialState: FaucetState = {
  balance: null,
  decimals: null,
  nextClaimAt: null,
  status: "loading",
  error: null,
};
const claimFailed =
  "We couldn't complete your Desk Dollars claim. Please try again.";
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
    const request = {
      to: config.faucetAddress,
      data: encodeFunctionData({
        abi: deskDollarsFaucetAbi,
        functionName: "claim",
      }) as Hex,
      chainId: 84532,
    };
    try {
      if (!(await transaction.submit(request))) {
        setState((current) => ({
          ...current,
          status: "error",
          error: transaction.getSubmissionError() ?? claimFailed,
        }));
        return false;
      }
      const hash = transaction.getSubmittedHash();
      if (!hash) throw new Error("missing submitted hash");
      const receipt = await deskDollarsPublicClient.waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== "success") throw new Error("receipt reverted");
      setState((current) => ({ ...current, status: "confirmed", error: null }));
      return await refresh(true);
    } catch {
      setState((current) => ({
        ...current,
        status: "error",
        error: claimFailed,
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
