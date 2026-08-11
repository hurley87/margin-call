"use client";

import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { requestCrashAttestation } from "@/lib/inco-attestation";
import {
  readCrashRoundForLp,
  type BlockingRoundDetail,
} from "@/lib/bankroll-vault";
import {
  getMarginCallCrashConfig,
  marginCallCrashAbi,
  ROUND_STATUS,
} from "@/lib/margin-call-crash";
import {
  applyStageResult,
  confirmSponsoredCall,
  submitSponsoredCall,
  type StageErrorCopy,
} from "@/lib/sponsored-call";
import { notifyWalletBalancesChanged } from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

type Stage = "finalize" | "expire";

export type LpFreezeActionStatus =
  | "idle"
  | "attesting"
  | `${Stage}-submitting`
  | `${Stage}-pending`
  | "confirmed"
  | "error";

export type LpFreezeRetryAction =
  "finalize" | "expire" | "finalize-receipt-check" | "expire-receipt-check";

const stageCopy: Record<Stage, StageErrorCopy> = {
  finalize: {
    failed: "We couldn't finalize the blocking round. Please try again.",
    unconfirmed:
      "Finalization was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  expire: {
    failed: "We couldn't expire the blocking round. Please try again.",
    unconfirmed:
      "Expiry was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

/**
 * Drives LP Desk one-click finalize/expire against a blocking round using the
 * same sponsored receipt-confirmed stage machine as player settlement.
 */
export function useLpFreezeActions(onResolved?: () => void) {
  const transaction = usePrivySponsoredTransaction();
  const gameConfig = getMarginCallCrashConfig();
  const [status, setStatus] = useState<LpFreezeActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<bigint | null>(null);
  const inFlight = useRef(false);
  const retryKind = useRef<Stage | null>(null);
  const retryRoundId = useRef<bigint | null>(null);
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);

  const runStage = useCallback(
    async (stage: Stage, request: { to: Address; data: Hex }) => {
      retryKind.current = stage;
      setStatus(`${stage}-submitting`);
      setError(null);
      const result = await submitSponsoredCall(transaction, request, (hash) => {
        pendingStage.current = { stage, hash };
        setStatus(`${stage}-pending`);
      });
      applyStageResult(pendingStage, stageCopy[stage], result);
    },
    [transaction]
  );

  const finalizeRound = useCallback(
    async (roundId: bigint): Promise<boolean> => {
      if (!gameConfig || inFlight.current) return false;
      if (pendingStage.current) return false;
      inFlight.current = true;
      retryRoundId.current = roundId;
      setActiveRoundId(roundId);
      try {
        const round = await readCrashRoundForLp(roundId);
        if (!round) throw new Error("Blocking round is no longer available.");
        if (round.status !== ROUND_STATUS.revealRequested) {
          throw new Error(
            "This round is not awaiting finalization. Expire it if it is past expiry."
          );
        }
        setStatus("attesting");
        setError(null);
        const attestation = await requestCrashAttestation(round.crashRandom);
        await runStage("finalize", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "finalizeRound",
            args: [roundId, attestation.plaintext, attestation.signatures],
          }) as Hex,
        });
        setStatus("confirmed");
        notifyWalletBalancesChanged();
        onResolved?.();
        return true;
      } catch (caught) {
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : stageCopy.finalize.failed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [gameConfig, onResolved, runStage]
  );

  const expireRound = useCallback(
    async (roundId: bigint): Promise<boolean> => {
      if (!gameConfig || inFlight.current) return false;
      if (pendingStage.current) return false;
      inFlight.current = true;
      retryRoundId.current = roundId;
      setActiveRoundId(roundId);
      try {
        await runStage("expire", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "expireRound",
            args: [roundId],
          }) as Hex,
        });
        setStatus("confirmed");
        notifyWalletBalancesChanged();
        onResolved?.();
        return true;
      } catch (caught) {
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : stageCopy.expire.failed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [gameConfig, onResolved, runStage]
  );

  const resolveBlockingRound = useCallback(
    (round: BlockingRoundDetail) => {
      if (round.expiryEligible) return expireRound(round.roundId);
      if (round.revealFrozen) return finalizeRound(round.roundId);
      return Promise.resolve(false);
    },
    [expireRound, finalizeRound]
  );

  const retry = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    const pending = pendingStage.current;
    if (pending) {
      inFlight.current = true;
      setActiveRoundId(retryRoundId.current);
      try {
        setStatus(`${pending.stage}-pending`);
        setError(null);
        applyStageResult(
          pendingStage,
          stageCopy[pending.stage],
          await confirmSponsoredCall(pending.hash)
        );
        setStatus("confirmed");
        notifyWalletBalancesChanged();
        onResolved?.();
        return true;
      } catch (caught) {
        setStatus("error");
        setError(
          caught instanceof Error
            ? caught.message
            : stageCopy[pending.stage].failed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    }
    const roundId = retryRoundId.current;
    if (roundId === null || retryKind.current === null) return false;
    return retryKind.current === "expire"
      ? expireRound(roundId)
      : finalizeRound(roundId);
  }, [expireRound, finalizeRound, onResolved]);

  const pendingReceiptStage = pendingStage.current?.stage ?? null;
  const retryAction: LpFreezeRetryAction | null =
    retryKind.current === null
      ? null
      : pendingReceiptStage
        ? `${pendingReceiptStage}-receipt-check`
        : retryKind.current;

  return {
    status,
    error,
    activeRoundId,
    canAct: !!gameConfig && !inFlight.current && pendingStage.current === null,
    canRetry:
      status === "error" && retryKind.current !== null && !inFlight.current,
    retryAction,
    finalizeRound,
    expireRound,
    resolveBlockingRound,
    retry,
  };
}
