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
  resumeSponsoredStage,
  runSponsoredStage,
  type StageErrorCopy,
} from "@/lib/sponsored-call";
import { notifyWalletBalancesChanged } from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

type Stage = "transfer";

export type DeskDollarsTransferStatus =
  "idle" | "submitting" | "pending" | "confirmed" | "error" | "unavailable";

export type DeskDollarsTransferInput = {
  recipient: string;
  amount: string;
  balance: bigint | null;
};

export type DeskDollarsTransferValidation =
  { ok: true; to: Address; amount: bigint } | { ok: false; error: string };

const tokenUnavailable =
  "Desk Dollars is not configured for this Base Sepolia deployment.";

const stageCopy: Record<Stage, StageErrorCopy> = {
  transfer: {
    failed:
      "We couldn't complete your Desk Dollars transfer. Please try again.",
    unconfirmed:
      "Your transfer was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

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
 * Uses the canonical sponsored-stage helpers so pending-hash resume never
 * resubmits and outcome copy stays centralized in applyStageResult.
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
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);
  const lastRequest = useRef<{ to: Address; amount: bigint } | null>(null);
  const retryKind = useRef<Stage | null>(null);

  const onStageStatus = useCallback(
    (next: `${Stage}-submitting` | `${Stage}-pending`) => {
      if (next === "transfer-pending" && pendingStage.current) {
        setLastHash(pendingStage.current.hash);
      }
      setStatus(next === "transfer-submitting" ? "submitting" : "pending");
      setError(null);
    },
    []
  );

  const submitTransfer = useCallback(
    async (to: Address, amount: bigint): Promise<boolean> => {
      if (
        !tokenAddress ||
        !walletAddress ||
        inFlight.current ||
        pendingStage.current
      ) {
        return false;
      }

      inFlight.current = true;
      lastRequest.current = { to, amount };
      retryKind.current = "transfer";

      try {
        await runSponsoredStage({
          transaction,
          pendingStage,
          stage: "transfer",
          copy: stageCopy.transfer,
          request: {
            to: tokenAddress,
            data: encodeFunctionData({
              abi: deskDollarsAbi,
              functionName: "transfer",
              args: [to, amount],
            }) as Hex,
          },
          onStatus: onStageStatus,
        });
        retryKind.current = null;
        setStatus("confirmed");
        setError(null);
        notifyWalletBalancesChanged();
        return true;
      } catch (caught) {
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : stageCopy.transfer.failed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [onStageStatus, tokenAddress, transaction, walletAddress]
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
    if (pendingStage.current) {
      if (inFlight.current) return false;
      inFlight.current = true;
      try {
        await resumeSponsoredStage({
          pendingStage,
          copyByStage: stageCopy,
          onStatus: onStageStatus,
        });
        retryKind.current = null;
        setStatus("confirmed");
        setError(null);
        notifyWalletBalancesChanged();
        return true;
      } catch (caught) {
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : stageCopy.transfer.failed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    }

    const request = lastRequest.current;
    if (!request) return false;
    return submitTransfer(request.to, request.amount);
  }, [onStageStatus, submitTransfer]);

  return {
    status,
    error,
    lastHash,
    canTransfer:
      !!tokenAddress &&
      !!walletAddress &&
      (status === "idle" || status === "confirmed" || status === "error") &&
      !inFlight.current &&
      pendingStage.current === null,
    canRetry: status === "error" && retryKind.current !== null,
    transfer,
    retry,
  };
}
