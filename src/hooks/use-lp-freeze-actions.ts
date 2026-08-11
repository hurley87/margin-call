"use client";

import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, type Hex } from "viem";
import { requestCrashAttestation } from "@/lib/inco-attestation";
import type { BlockingRoundDetail } from "@/lib/bankroll-vault";
import {
  getMarginCallCrashConfig,
  marginCallCrashAbi,
  readCrashRoundForLp,
  ROUND_STATUS,
} from "@/lib/margin-call-crash";
import {
  resumeSponsoredStage,
  runSponsoredStage,
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
 * same sponsored receipt-confirmed stage machine as player settlement. On
 * success it notifies wallet-balance subscribers, which re-read vault state.
 */
export function useLpFreezeActions() {
  const transaction = usePrivySponsoredTransaction();
  const gameConfig = getMarginCallCrashConfig();
  const [status, setStatus] = useState<LpFreezeActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<bigint | null>(null);
  const inFlight = useRef(false);
  const retryKind = useRef<Stage | null>(null);
  const retryRoundId = useRef<bigint | null>(null);
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);

  const runAction = useCallback(
    async (
      stage: Stage,
      roundId: bigint,
      prepareCallData: () => Promise<Hex>
    ): Promise<boolean> => {
      if (!gameConfig || inFlight.current || pendingStage.current) return false;
      inFlight.current = true;
      retryRoundId.current = roundId;
      setActiveRoundId(roundId);
      setError(null);
      try {
        const data = await prepareCallData();
        retryKind.current = stage;
        await runSponsoredStage<Stage>({
          transaction,
          pendingStage,
          stage,
          copy: stageCopy[stage],
          request: { to: gameConfig.address, data },
          onStatus: setStatus,
        });
        setStatus("confirmed");
        notifyWalletBalancesChanged();
        return true;
      } catch (caught) {
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : stageCopy[stage].failed
        );
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [gameConfig, transaction]
  );

  const finalizeRound = useCallback(
    (roundId: bigint) =>
      runAction("finalize", roundId, async () => {
        const round = await readCrashRoundForLp(roundId);
        if (!round) throw new Error("Blocking round is no longer available.");
        if (round.status !== ROUND_STATUS.revealRequested) {
          throw new Error(
            "This round is not awaiting finalization. Expire it if it is past expiry."
          );
        }
        setStatus("attesting");
        const attestation = await requestCrashAttestation(round.crashRandom);
        return encodeFunctionData({
          abi: marginCallCrashAbi,
          functionName: "finalizeRound",
          args: [roundId, attestation.plaintext, attestation.signatures],
        }) as Hex;
      }),
    [runAction]
  );

  const expireRound = useCallback(
    (roundId: bigint) =>
      runAction(
        "expire",
        roundId,
        async () =>
          encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "expireRound",
            args: [roundId],
          }) as Hex
      ),
    [runAction]
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
      setError(null);
      try {
        await resumeSponsoredStage({
          pendingStage,
          copyByStage: stageCopy,
          onStatus: setStatus,
        });
        setStatus("confirmed");
        notifyWalletBalancesChanged();
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
  }, [expireRound, finalizeRound]);

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
