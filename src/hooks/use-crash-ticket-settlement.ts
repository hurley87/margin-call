"use client";

import { useCallback } from "react";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { requestCrashAttestation } from "@/lib/inco-attestation";
import {
  computeCrashPointBps,
  computeTicketPayout,
  deriveTicketOutcome,
  formatCrashPointBps,
  isCrashPointPublished,
  marginCallCrashAbi,
  ROUND_STATUS,
} from "@/lib/margin-call-crash";
import { type StageErrorCopy } from "@/lib/sponsored-call";
import {
  useCrashTicketStages,
  type CrashTicketStageStatus,
} from "./use-crash-ticket-stages";

type Stage = "reveal" | "finalize" | "claim" | "settle";

export type CrashSettlementStatus = CrashTicketStageStatus<Stage, "attesting">;

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
 */
export function useCrashTicketSettlement() {
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
  } = useCrashTicketStages<Stage, "verify", "attesting">({
    stages: stageCopy,
    unavailable,
    loadFailed,
  });

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
    return runFlow(stageCopy.finalize.failed, async () => {
      let round = startingRound;
      // Locked rounds still store Open until reveal is requested.
      if (round.status === ROUND_STATUS.open) {
        await runStage("reveal", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "requestReveal",
            args: [round.id],
          }) as Hex,
        });
        round = { ...round, status: ROUND_STATUS.revealRequested };
        setState((current) => ({ ...current, round }));
      }

      if (round.status === ROUND_STATUS.revealRequested) {
        setState((current) => ({
          ...current,
          status: "attesting",
          error: null,
        }));
        const attestation = await requestCrashAttestation(round.crashRandom);
        await runStage("finalize", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "finalizeRound",
            args: [round.id, attestation.plaintext, attestation.signatures],
          }) as Hex,
        });
        round = {
          ...round,
          status: ROUND_STATUS.finalized,
          crashPointBps: computeCrashPointBps(attestation.plaintext),
        };
        setState((current) => ({ ...current, round }));
      }

      const outcome = deriveTicketOutcome(ticket, round);
      if (outcome === "won") {
        await runStage("claim", claimRequest(gameConfig.address, ticket.id));
      } else if (outcome === "lost") {
        await runStage(
          "settle",
          settleLossRequest(gameConfig.address, ticket.id)
        );
      }
    });
  }, [
    gameConfig,
    inFlightRef,
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
    retryAction,
    verifyAndSettle,
    claim,
    settleLoss,
    retry,
    refresh,
  };
}

function claimRequest(to: Address, ticketId: bigint) {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "claim",
      args: [ticketId, zeroAddress],
    }) as Hex,
  };
}

function settleLossRequest(to: Address, ticketId: bigint) {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "settleLoss",
      args: [ticketId],
    }) as Hex,
  };
}
