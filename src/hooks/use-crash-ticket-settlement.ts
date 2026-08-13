"use client";

import { useCallback, useMemo } from "react";
import type { Hex } from "viem";
import { getBaseSepoliaTransactionUrl } from "@/lib/base-sepolia-explorer";
import { runVerifyAndSettleFlow } from "@/lib/crash-settlement-flow";
import {
  claimRequest,
  computeTicketPayout,
  formatCrashPointBps,
  isCrashPointPublished,
  settleLossRequest,
} from "@/lib/margin-call-crash";
import { type StageErrorCopy } from "@/lib/sponsored-call";
import { isSponsoredActionBusy } from "@/lib/sponsored-action-busy";
import {
  useCrashTicketStages,
  type CrashTicketStageStatus,
} from "./use-crash-ticket-stages";

type Stage = "reveal" | "finalize" | "claim" | "settle";

const STAGE_ORDER: readonly Stage[] = ["reveal", "finalize", "claim", "settle"];

export type CrashSettlementStatus = CrashTicketStageStatus<Stage, "attesting">;

/** Submitted settlement transaction with its BaseScan link. */
export type SettlementTransaction = {
  stage: Stage;
  hash: Hex;
  url: string;
  confirmed: boolean;
};

export type CrashSettlementRetryAction =
  | "refresh"
  | "verify"
  | "claim"
  | "settle"
  | "reveal-receipt-check"
  | "finalize-receipt-check"
  | "claim-receipt-check"
  | "settle-receipt-check";

const unavailable =
  "Crash settlement is not configured for this Base Sepolia deployment.";
const loadFailed =
  "We couldn't load your ticket settlement state. Please try again.";
const stageCopy: Record<Stage, StageErrorCopy> = {
  reveal: {
    failed: "We couldn't request reveal for your round. Please try again.",
    unconfirmed:
      "Reveal was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  finalize: {
    failed: "We couldn't finalize your round. Please try again.",
    unconfirmed:
      "Finalization was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  claim: {
    failed: "We couldn't claim your payout. Please try again.",
    unconfirmed:
      "Your claim was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  settle: {
    failed: "We couldn't settle the loss. Please try again.",
    unconfirmed:
      "Loss settlement was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

/**
 * Recovers a returning player's recent ticket and drives verify/claim/settle
 * through receipt-confirmed sponsored transactions.
 *
 * `onCrashPointKnown` (optional) fires as soon as the Crash Point is
 * determined client-side during `verifyAndSettle` — before the finalize and
 * claim/settle receipts — so presentation can start revealing the outcome
 * while the remaining transactions confirm.
 */
export function useCrashTicketSettlement(options?: {
  onCrashPointKnown?: (crashPointBps: bigint) => void;
}) {
  const onCrashPointKnown = options?.onCrashPointKnown;
  const {
    walletAddress,
    gameConfig,
    state,
    setState,
    inFlightRef,
    retryKindRef,
    pendingStageRef,
    retryKind,
    pendingReceiptStage,
    stageHashes,
    refresh,
    refreshIfIdle,
    runStage,
    resumePending,
    runFlow,
    ticket,
    round,
    phase,
    outcome,
    canAct,
    canRetry,
  } = useCrashTicketStages<Stage, "verify", "attesting">({
    stages: stageCopy,
    unavailable,
    loadFailed,
  });

  const transactions = useMemo<SettlementTransaction[]>(
    () =>
      STAGE_ORDER.flatMap((stage) => {
        const recorded = stageHashes[stage];
        if (!recorded) return [];
        return [
          {
            stage,
            hash: recorded.hash,
            url: getBaseSepoliaTransactionUrl(recorded.hash),
            confirmed: recorded.confirmed,
          },
        ];
      }),
    [stageHashes]
  );

  const settleTicket = useCallback(
    async (mode: "claim" | "settle" | "resume" = "claim"): Promise<boolean> => {
      if (
        !gameConfig ||
        !walletAddress ||
        !state.ticket ||
        inFlightRef.current
      ) {
        return false;
      }
      if (pendingStageRef.current && mode !== "resume") return false;

      const ticketId = state.ticket.id;
      return runFlow(stageCopy.claim.failed, async () => {
        if (mode === "resume") {
          await resumePending();
        } else if (mode === "claim") {
          await runStage("claim", claimRequest(gameConfig.address, ticketId));
        } else {
          await runStage(
            "settle",
            settleLossRequest(gameConfig.address, ticketId)
          );
        }
      });
    },
    [
      gameConfig,
      inFlightRef,
      pendingStageRef,
      resumePending,
      runFlow,
      runStage,
      state.ticket,
      walletAddress,
    ]
  );

  const verifyAndSettle = useCallback(async (): Promise<boolean> => {
    if (!gameConfig || !walletAddress || !state.ticket || !state.round) {
      return false;
    }
    if (inFlightRef.current) return false;
    if (pendingStageRef.current) return settleTicket("resume");

    const ticket = state.ticket;
    const startingRound = state.round;
    retryKindRef.current = "verify";
    return runFlow(stageCopy.finalize.failed, () =>
      runVerifyAndSettleFlow({
        contractAddress: gameConfig.address,
        ticket,
        round: startingRound,
        runStage,
        onAttesting: () =>
          setState((current) => ({
            ...current,
            status: "attesting",
            error: null,
          })),
        onRoundChange: (round) =>
          setState((current) => ({ ...current, round })),
        onCrashPointKnown,
      })
    );
  }, [
    gameConfig,
    inFlightRef,
    onCrashPointKnown,
    pendingStageRef,
    retryKindRef,
    runFlow,
    runStage,
    setState,
    settleTicket,
    state.round,
    state.ticket,
    walletAddress,
  ]);

  const claim = useCallback(() => settleTicket("claim"), [settleTicket]);
  const settleLoss = useCallback(() => settleTicket("settle"), [settleTicket]);

  const retry = useCallback(() => {
    if (retryKindRef.current === "refresh") return refresh();
    if (pendingStageRef.current) return settleTicket("resume");
    if (retryKindRef.current === "verify") return verifyAndSettle();
    if (retryKindRef.current === "settle") return settleTicket("settle");
    if (retryKindRef.current === "claim") return settleTicket("claim");
    return refresh();
  }, [pendingStageRef, refresh, retryKindRef, settleTicket, verifyAndSettle]);

  const finalized = round !== null && isCrashPointPublished(round);
  const payout =
    ticket && round && finalized
      ? computeTicketPayout(
          ticket.margin,
          ticket.leverageBps,
          round.crashPointBps
        )
      : (ticket?.reservedPayout ?? null);
  const canVerify =
    !!ticket &&
    !ticket.settled &&
    (phase === "locked" || phase === "reveal-requested");

  const retryAction: CrashSettlementRetryAction | null =
    retryKind === null
      ? null
      : retryKind === "refresh"
        ? "refresh"
        : pendingReceiptStage
          ? `${pendingReceiptStage}-receipt-check`
          : retryKind === "verify" || retryKind === "settle"
            ? retryKind
            : "claim";

  return {
    status: state.status,
    error: state.error,
    walletAddress,
    ticket,
    round,
    outcome,
    payout,
    phase,
    displayCrashPoint:
      round && finalized ? formatCrashPointBps(round.crashPointBps) : null,
    canVerify: canVerify && canAct,
    canClaim: outcome === "won" && canAct,
    canSettle: outcome === "lost" && canAct,
    canRetry,
    busy: isSponsoredActionBusy(state.status),
    retryAction,
    transactions,
    verifyAndSettle,
    claim,
    settleLoss,
    retry,
    refresh,
    refreshIfIdle,
  };
}
