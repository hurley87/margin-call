"use client";

import { useCallback } from "react";
import { expireRequest, refundRequest } from "@/lib/margin-call-crash";
import { type StageErrorCopy } from "@/lib/sponsored-call";
import {
  useCrashTicketStages,
  type CrashTicketStageStatus,
} from "./use-crash-ticket-stages";

type Stage = "expire" | "refund";

export type CrashRefundStatus = CrashTicketStageStatus<Stage>;

export type CrashRefundRetryAction =
  | "refresh"
  | "expire"
  | "refund"
  | "expire-receipt-check"
  | "refund-receipt-check";

const unavailable =
  "Crash expiry refunds are not configured for this Base Sepolia deployment.";
const loadFailed =
  "We couldn't load your ticket refund state. Please try again.";
const stageCopy: Record<Stage, StageErrorCopy> = {
  expire: {
    failed: "We couldn't mark the round expired. Please try again.",
    unconfirmed:
      "Expiry was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  refund: {
    failed: "We couldn't refund your margin. Please try again.",
    unconfirmed:
      "Your refund was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

/**
 * Recovers a returning player's recent ticket and drives expire/refund through
 * receipt-confirmed sponsored transactions. No attestation is involved.
 */
export function useCrashTicketRefund() {
  const {
    walletAddress,
    gameConfig,
    state,
    inFlightRef,
    retryKindRef,
    pendingStageRef,
    retryKind,
    pendingReceiptStage,
    refresh,
    runStage,
    resumePending,
    runFlow,
    ticket,
    round,
    phase,
    outcome,
    canAct,
    canRetry,
  } = useCrashTicketStages({ stages: stageCopy, unavailable, loadFailed });

  const submitStage = useCallback(
    async (stage: Stage): Promise<boolean> => {
      if (!gameConfig || !walletAddress || inFlightRef.current) return false;
      if (pendingStageRef.current) return false;

      const request =
        stage === "expire"
          ? state.round && expireRequest(gameConfig.address, state.round.id)
          : state.ticket && refundRequest(gameConfig.address, state.ticket.id);
      if (!request) return false;
      return runFlow(stageCopy[stage].failed, () => runStage(stage, request));
    },
    [
      gameConfig,
      inFlightRef,
      pendingStageRef,
      runFlow,
      runStage,
      state.round,
      state.ticket,
      walletAddress,
    ]
  );

  const resumeReceipt = useCallback((): Promise<boolean> => {
    const pending = pendingStageRef.current;
    if (!pending || inFlightRef.current) return Promise.resolve(false);
    return runFlow(stageCopy[pending.stage].failed, async () => {
      await resumePending();
    });
  }, [inFlightRef, pendingStageRef, resumePending, runFlow]);

  const retry = useCallback(() => {
    if (retryKindRef.current === "refresh") return refresh();
    if (pendingStageRef.current) return resumeReceipt();
    if (retryKindRef.current) return submitStage(retryKindRef.current);
    return refresh();
  }, [pendingStageRef, refresh, resumeReceipt, retryKindRef, submitStage]);

  const retryAction: CrashRefundRetryAction | null =
    retryKind === null
      ? null
      : retryKind === "refresh"
        ? "refresh"
        : pendingReceiptStage
          ? `${pendingReceiptStage}-receipt-check`
          : retryKind;

  return {
    status: state.status,
    error: state.error,
    walletAddress,
    ticket,
    round,
    outcome,
    phase,
    payout: ticket?.margin ?? null,
    canExpire:
      phase === "expired-eligible" && !!ticket && !ticket.settled && canAct,
    canRefund: outcome === "refundable" && canAct,
    canRetry,
    retryAction,
    expireRound: () => submitStage("expire"),
    refund: () => submitStage("refund"),
    retry,
    refresh,
  };
}
