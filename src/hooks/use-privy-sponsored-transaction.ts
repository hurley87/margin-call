"use client";

import {
  type UnsignedTransactionRequest,
  usePrivy,
  useSendTransaction,
  useWallets,
} from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import { getEvmWalletAddress } from "@/lib/privy/wallet";

export type SponsoredTransactionStatus =
  "idle" | "submitting" | "submitted" | "error";

type SponsoredTransactionState = {
  status: SponsoredTransactionStatus;
  hash: `0x${string}` | null;
  error: string | null;
};

const initialState: SponsoredTransactionState = {
  status: "idle",
  hash: null,
  error: null,
};

const walletUnavailableError = "Your wallet is not ready. Please try again.";
const transactionFailedError =
  "We couldn't submit that transaction. Please try again.";

/**
 * Sends a transaction only from the authenticated user's Privy embedded wallet.
 * A returned hash means Privy accepted the submission; this hook does not poll
 * for a receipt or claim transaction finality.
 */
export function usePrivySponsoredTransaction() {
  const { ready: privyReady, authenticated, user } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const [state, setState] = useState<SponsoredTransactionState>(initialState);
  const inFlight = useRef(false);
  const failedRequest = useRef<UnsignedTransactionRequest | null>(null);
  const walletAddress = getEvmWalletAddress(user);
  const ready = privyReady && authenticated && walletsReady && !!walletAddress;

  const submit = useCallback(
    async (request: UnsignedTransactionRequest): Promise<boolean> => {
      if (inFlight.current) return false;

      if (!ready || !walletAddress) {
        failedRequest.current = request;
        setState({
          status: "error",
          hash: null,
          error: walletUnavailableError,
        });
        return false;
      }

      inFlight.current = true;
      setState({ status: "submitting", hash: null, error: null });

      try {
        const { hash } = await sendTransaction(request, {
          sponsor: true,
          address: walletAddress,
        });
        failedRequest.current = null;
        setState({ status: "submitted", hash, error: null });
        return true;
      } catch {
        failedRequest.current = request;
        setState({
          status: "error",
          hash: null,
          error: transactionFailedError,
        });
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [ready, sendTransaction, walletAddress]
  );

  const retry = useCallback(async (): Promise<boolean> => {
    const request = failedRequest.current;
    return request ? submit(request) : false;
  }, [submit]);

  return {
    ...state,
    ready,
    canSubmit: ready && !inFlight.current,
    canRetry:
      state.status === "error" &&
      failedRequest.current !== null &&
      ready &&
      !inFlight.current,
    submit,
    retry,
  };
}
