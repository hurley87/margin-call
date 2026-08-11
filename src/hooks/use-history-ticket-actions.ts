"use client";

import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { requestCrashAttestation } from "@/lib/inco-attestation";
import {
  computeCrashPointBps,
  deriveTicketOutcome,
  getMarginCallCrashConfig,
  marginCallCrashAbi,
  ROUND_STATUS,
  type CrashRound,
  type CrashTicket,
} from "@/lib/margin-call-crash";
import {
  resumeSponsoredStage,
  runSponsoredStage,
  type StageErrorCopy,
} from "@/lib/sponsored-call";
import { notifyWalletBalancesChanged } from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

type Stage = "reveal" | "finalize" | "claim" | "settle" | "expire" | "refund";

export type HistoryTicketActionStatus =
  | "idle"
  | `${Stage}-submitting`
  | `${Stage}-pending`
  | "attesting"
  | "confirmed"
  | "error";

const stageCopy: Record<Stage, StageErrorCopy> = {
  reveal: {
    failed: "We couldn't request reveal for this round. Please try again.",
    unconfirmed:
      "Reveal was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  finalize: {
    failed: "We couldn't finalize this round. Please try again.",
    unconfirmed:
      "Finalization was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  claim: {
    failed: "We couldn't claim this payout. Please try again.",
    unconfirmed:
      "Your claim was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  settle: {
    failed: "We couldn't settle this loss. Please try again.",
    unconfirmed:
      "Loss settlement was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  expire: {
    failed: "We couldn't mark this round expired. Please try again.",
    unconfirmed:
      "Expiry was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  refund: {
    failed: "We couldn't refund this margin. Please try again.",
    unconfirmed:
      "Your refund was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

/**
 * Receipt-backed claim/refund/verify actions for a specific history ticket.
 * Settlement UI never flips from a bare hash — callers refresh after confirm.
 */
export function useHistoryTicketActions(onSettled?: () => void) {
  const gameConfig = getMarginCallCrashConfig();
  const transaction = usePrivySponsoredTransaction();
  const [status, setStatus] = useState<HistoryTicketActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<bigint | null>(null);
  const inFlightRef = useRef(false);
  const pendingStageRef = useRef<{ stage: Stage; hash: Hex } | null>(null);
  const lastTargetsRef = useRef<{
    ticket: CrashTicket;
    round: CrashRound;
    kind: "verify" | "claim" | "settle" | "expire" | "refund";
  } | null>(null);

  const runStage = useCallback(
    (stage: Stage, request: { to: Address; data: Hex }) =>
      runSponsoredStage({
        transaction,
        pendingStage: pendingStageRef,
        stage,
        copy: stageCopy[stage],
        request,
        onStatus: (next) => {
          setStatus(next);
          setError(null);
        },
      }),
    [transaction]
  );

  const runFlow = useCallback(
    async (
      ticketId: bigint,
      fallback: string,
      flow: () => Promise<void>
    ): Promise<boolean> => {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      setActiveTicketId(ticketId);
      try {
        await flow();
        setStatus("confirmed");
        setError(null);
        notifyWalletBalancesChanged();
        onSettled?.();
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : fallback;
        setStatus("error");
        setError(message);
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [onSettled]
  );

  const claim = useCallback(
    (ticket: CrashTicket) => {
      if (!gameConfig) return Promise.resolve(false);
      lastTargetsRef.current = {
        ticket,
        round: {
          id: ticket.roundId,
          openAt: 0n,
          lockAt: 0n,
          expiresAt: 0n,
          crashRandom:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          crashPointBps: 0n,
          totalMargin: 0n,
          reservedPayout: 0n,
          status: ROUND_STATUS.finalized,
        },
        kind: "claim",
      };
      return runFlow(ticket.id, stageCopy.claim.failed, () =>
        runStage("claim", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "claim",
            args: [ticket.id, zeroAddress],
          }) as Hex,
        })
      );
    },
    [gameConfig, runFlow, runStage]
  );

  const settleLoss = useCallback(
    (ticket: CrashTicket) => {
      if (!gameConfig) return Promise.resolve(false);
      lastTargetsRef.current = {
        ticket,
        round: {
          id: ticket.roundId,
          openAt: 0n,
          lockAt: 0n,
          expiresAt: 0n,
          crashRandom:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          crashPointBps: 0n,
          totalMargin: 0n,
          reservedPayout: 0n,
          status: ROUND_STATUS.finalized,
        },
        kind: "settle",
      };
      return runFlow(ticket.id, stageCopy.settle.failed, () =>
        runStage("settle", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "settleLoss",
            args: [ticket.id],
          }) as Hex,
        })
      );
    },
    [gameConfig, runFlow, runStage]
  );

  const expireRound = useCallback(
    (ticket: CrashTicket, round: CrashRound) => {
      if (!gameConfig) return Promise.resolve(false);
      lastTargetsRef.current = { ticket, round, kind: "expire" };
      return runFlow(ticket.id, stageCopy.expire.failed, () =>
        runStage("expire", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "expireRound",
            args: [round.id],
          }) as Hex,
        })
      );
    },
    [gameConfig, runFlow, runStage]
  );

  const refund = useCallback(
    (ticket: CrashTicket, round: CrashRound) => {
      if (!gameConfig) return Promise.resolve(false);
      lastTargetsRef.current = { ticket, round, kind: "refund" };
      return runFlow(ticket.id, stageCopy.refund.failed, () =>
        runStage("refund", {
          to: gameConfig.address,
          data: encodeFunctionData({
            abi: marginCallCrashAbi,
            functionName: "refund",
            args: [ticket.id, zeroAddress],
          }) as Hex,
        })
      );
    },
    [gameConfig, runFlow, runStage]
  );

  const verifyAndSettle = useCallback(
    (ticket: CrashTicket, startingRound: CrashRound) => {
      if (!gameConfig) return Promise.resolve(false);
      lastTargetsRef.current = {
        ticket,
        round: startingRound,
        kind: "verify",
      };
      return runFlow(ticket.id, stageCopy.finalize.failed, async () => {
        let round = startingRound;
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
        }

        if (round.status === ROUND_STATUS.revealRequested) {
          setStatus("attesting");
          setError(null);
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
        }

        const outcome = deriveTicketOutcome(ticket, round);
        if (outcome === "won") {
          await runStage("claim", {
            to: gameConfig.address,
            data: encodeFunctionData({
              abi: marginCallCrashAbi,
              functionName: "claim",
              args: [ticket.id, zeroAddress],
            }) as Hex,
          });
        } else if (outcome === "lost") {
          await runStage("settle", {
            to: gameConfig.address,
            data: encodeFunctionData({
              abi: marginCallCrashAbi,
              functionName: "settleLoss",
              args: [ticket.id],
            }) as Hex,
          });
        }
      });
    },
    [gameConfig, runFlow, runStage]
  );

  const retry = useCallback(() => {
    const pending = pendingStageRef.current;
    if (pending) {
      const ticketId = activeTicketId ?? 0n;
      return runFlow(
        ticketId,
        stageCopy[pending.stage].unconfirmed,
        async () => {
          await resumeSponsoredStage({
            pendingStage: pendingStageRef,
            copyByStage: stageCopy,
            onStatus: (next) => {
              setStatus(next);
              setError(null);
            },
          });
        }
      );
    }
    const last = lastTargetsRef.current;
    if (!last) return Promise.resolve(false);
    switch (last.kind) {
      case "claim":
        return claim(last.ticket);
      case "settle":
        return settleLoss(last.ticket);
      case "expire":
        return expireRound(last.ticket, last.round);
      case "refund":
        return refund(last.ticket, last.round);
      case "verify":
        return verifyAndSettle(last.ticket, last.round);
      default: {
        const _exhaustive: never = last.kind;
        return _exhaustive;
      }
    }
  }, [
    activeTicketId,
    claim,
    expireRound,
    refund,
    runFlow,
    settleLoss,
    verifyAndSettle,
  ]);

  return {
    status,
    error,
    activeTicketId,
    busy:
      status.endsWith("-submitting") ||
      status.endsWith("-pending") ||
      status === "attesting",
    claim,
    settleLoss,
    expireRound,
    refund,
    verifyAndSettle,
    retry,
  };
}
