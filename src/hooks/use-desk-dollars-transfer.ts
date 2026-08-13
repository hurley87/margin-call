"use client";

import { useCallback, useRef, useState } from "react";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  deskDollarsAbi,
  getDeskDollarsTokenAddress,
  parseTUsdInput,
} from "@/lib/desk-dollars";
import {
  confirmSponsoredCall,
  submitSponsoredCall,
} from "@/lib/sponsored-call";
import { notifyWalletBalancesChanged } from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

export type DeskDollarsTransferStatus =
  "idle" | "submitting" | "pending" | "confirmed" | "error" | "unavailable";

export type DeskDollarsTransferInput = {
  recipient: string;
  amount: string;
  balance: bigint | null;
};

export type DeskDollarsTransferValidation =
  { ok: true; to: Address; amount: bigint } | { ok: false; error: string };

const transferFailed =
  "We couldn't complete your Desk Dollars transfer. Please try again.";
const transferUnconfirmed =
  "Your transfer was submitted, but we couldn't confirm it yet. Retry to check its status.";
const tokenUnavailable =
  "Desk Dollars is not configured for this Base Sepolia deployment.";

/**
 * Validates a tUSD transfer form before any sponsored call is submitted.
 * Rejects the zero address, the sender's own wallet, zero amounts, and
 * amounts above the known balance.
 */
export function validateDeskDollarsTransfer(
  input: DeskDollarsTransferInput & { from: Address }
): DeskDollarsTransferValidation {
  const trimmed = input.recipient.trim();
  if (!trimmed || !isAddress(trimmed)) {
    return { ok: false, error: "Enter a valid 0x wallet address." };
  }

  const to = getAddress(trimmed);
  if (to === zeroAddress) {
    return { ok: false, error: "Cannot transfer to the zero address." };
  }
  if (to.toLowerCase() === input.from.toLowerCase()) {
    return { ok: false, error: "Cannot transfer to your own wallet." };
  }

  const amount = parseTUsdInput(input.amount.trim());
  if (amount === null) {
    return {
      ok: false,
      error: "Enter a tUSD amount with up to 6 decimal places.",
    };
  }
  if (amount <= 0n) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (input.balance === null) {
    return { ok: false, error: "Your Desk Dollars balance is still loading." };
  }
  if (amount > input.balance) {
    return { ok: false, error: "Amount exceeds your Desk Dollars balance." };
  }

  return { ok: true, to, amount };
}

/**
 * Sponsored ERC-20 transfer of Desk Dollars from the signed-in embedded wallet.
 * Pending-hash recovery mirrors the faucet: confirmation-unknown retries re-check
 * the same receipt and never resubmit.
 */
export function useDeskDollarsTransfer(walletAddress: Address | null) {
  const transaction = usePrivySponsoredTransaction();
  const tokenAddress = getDeskDollarsTokenAddress();
  const [status, setStatus] = useState<DeskDollarsTransferStatus>(
    tokenAddress ? "idle" : "unavailable"
  );
  const [error, setError] = useState<string | null>(
    tokenAddress ? null : tokenUnavailable
  );
  const [lastHash, setLastHash] = useState<Hex | null>(null);
  const inFlight = useRef(false);
  const pendingTransfer = useRef<Hex | null>(null);
  const lastRequest = useRef<{ to: Address; amount: bigint } | null>(null);
  const retryKind = useRef<"transfer" | "receipt-check" | null>(null);

  const submitTransfer = useCallback(
    async (to: Address, amount: bigint): Promise<boolean> => {
      if (!tokenAddress || !walletAddress || inFlight.current) return false;

      inFlight.current = true;
      lastRequest.current = { to, amount };
      retryKind.current = "transfer";
      setStatus("submitting");
      setError(null);

      try {
        const result = pendingTransfer.current
          ? await confirmSponsoredCall(pendingTransfer.current)
          : await submitSponsoredCall(
              transaction,
              {
                to: tokenAddress,
                data: encodeFunctionData({
                  abi: deskDollarsAbi,
                  functionName: "transfer",
                  args: [to, amount],
                }) as Hex,
              },
              (hash) => {
                pendingTransfer.current = hash;
                setLastHash(hash);
                setStatus("pending");
              }
            );

        if (result.outcome !== "confirmation-unknown") {
          pendingTransfer.current = null;
        }
        if (result.outcome === "confirmed") {
          retryKind.current = null;
          setStatus("confirmed");
          setError(null);
          setLastHash(result.hash);
          notifyWalletBalancesChanged();
          return true;
        }
        if (result.outcome === "confirmation-unknown") {
          retryKind.current = "receipt-check";
          setStatus("error");
          setError(transferUnconfirmed);
          setLastHash(result.hash);
          return false;
        }
        retryKind.current = "transfer";
        setStatus("error");
        setError(
          result.outcome === "submission-failed"
            ? (result.message ?? transferFailed)
            : transferFailed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [tokenAddress, transaction, walletAddress]
  );

  const transfer = useCallback(
    async (input: DeskDollarsTransferInput): Promise<boolean> => {
      if (!walletAddress) return false;
      if (!tokenAddress) {
        setStatus("unavailable");
        setError(tokenUnavailable);
        return false;
      }

      const validated = validateDeskDollarsTransfer({
        ...input,
        from: walletAddress,
      });
      if (!validated.ok) {
        setStatus("error");
        setError(validated.error);
        retryKind.current = null;
        return false;
      }

      return submitTransfer(validated.to, validated.amount);
    },
    [submitTransfer, tokenAddress, walletAddress]
  );

  const retry = useCallback(async (): Promise<boolean> => {
    if (retryKind.current === "receipt-check" && pendingTransfer.current) {
      if (inFlight.current) return false;
      inFlight.current = true;
      setStatus("pending");
      setError(null);
      try {
        const result = await confirmSponsoredCall(pendingTransfer.current);
        if (result.outcome === "confirmed") {
          pendingTransfer.current = null;
          retryKind.current = null;
          setStatus("confirmed");
          setError(null);
          setLastHash(result.hash);
          notifyWalletBalancesChanged();
          return true;
        }
        if (result.outcome === "confirmation-unknown") {
          retryKind.current = "receipt-check";
          setStatus("error");
          setError(transferUnconfirmed);
          return false;
        }
        pendingTransfer.current = null;
        retryKind.current = "transfer";
        setStatus("error");
        setError(transferFailed);
        return false;
      } finally {
        inFlight.current = false;
      }
    }

    const request = lastRequest.current;
    if (!request) return false;
    return submitTransfer(request.to, request.amount);
  }, [submitTransfer]);

  return {
    status,
    error,
    lastHash,
    canTransfer:
      !!tokenAddress &&
      !!walletAddress &&
      (status === "idle" || status === "confirmed" || status === "error") &&
      !inFlight.current &&
      retryKind.current !== "receipt-check",
    canRetry: status === "error" && retryKind.current !== null,
    transfer,
    retry,
  };
}
