"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { runVerifyAndSettleFlow } from "@/lib/crash-settlement-flow";
import {
  claimRequest,
  expireRequest,
  getMarginCallCrashConfig,
  refundRequest,
  settleLossRequest,
  type CrashRound,
  type CrashTicket,
} from "@/lib/margin-call-crash";
import {
  resumeSponsoredStage,
  runSponsoredStage,
  type StageErrorCopy,
} from "@/lib/sponsored-call";
import { isSponsoredActionBusy } from "@/lib/sponsored-action-busy";
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
  const gameConfig = useMemo(() => getMarginCallCrashConfig(), []);
  const transaction = usePrivySponsoredTransaction();
  const [status, setStatus] = useState<HistoryTicketActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<bigint | null>(null);
  const inFlightRef = useRef(false);
  const pendingStageRef = useRef<{ stage: Stage; hash: Hex } | null>(null);
  const lastActionRef = useRef<(() => Promise<boolean>) | null>(null);

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

  // Remembers the submitted action so Retry can rerun it with the same targets.
  const runAction = useCallback(
    (
      ticketId: bigint,
      fallback: string,
      flow: () => Promise<void>
    ): Promise<boolean> => {
      const run = () => runFlow(ticketId, fallback, flow);
      lastActionRef.current = run;
      return run();
    },
    [runFlow]
  );

  const claim = useCallback(
    (ticket: CrashTicket) => {
      if (!gameConfig) return Promise.resolve(false);
      return runAction(ticket.id, stageCopy.claim.failed, () =>
        runStage("claim", claimRequest(gameConfig.address, ticket.id))
      );
    },
    [gameConfig, runAction, runStage]
  );

  const settleLoss = useCallback(
    (ticket: CrashTicket) => {
      if (!gameConfig) return Promise.resolve(false);
      return runAction(ticket.id, stageCopy.settle.failed, () =>
        runStage("settle", settleLossRequest(gameConfig.address, ticket.id))
      );
    },
    [gameConfig, runAction, runStage]
  );

  const expireRound = useCallback(
    (ticket: CrashTicket, round: CrashRound) => {
      if (!gameConfig) return Promise.resolve(false);
      return runAction(ticket.id, stageCopy.expire.failed, () =>
        runStage("expire", expireRequest(gameConfig.address, round.id))
      );
    },
    [gameConfig, runAction, runStage]
  );

  const refund = useCallback(
    (ticket: CrashTicket) => {
      if (!gameConfig) return Promise.resolve(false);
      return runAction(ticket.id, stageCopy.refund.failed, () =>
        runStage("refund", refundRequest(gameConfig.address, ticket.id))
      );
    },
    [gameConfig, runAction, runStage]
  );

  const verifyAndSettle = useCallback(
    (ticket: CrashTicket, startingRound: CrashRound) => {
      if (!gameConfig) return Promise.resolve(false);
      return runAction(ticket.id, stageCopy.finalize.failed, () =>
        runVerifyAndSettleFlow({
          contractAddress: gameConfig.address,
          ticket,
          round: startingRound,
          runStage,
          onAttesting: () => {
            setStatus("attesting");
            setError(null);
          },
        })
      );
    },
    [gameConfig, runAction, runStage]
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
    return lastActionRef.current?.() ?? Promise.resolve(false);
  }, [activeTicketId, runFlow]);

  return {
    status,
    error,
    activeTicketId,
    busy: isSponsoredActionBusy(status),
    claim,
    settleLoss,
    expireRound,
    refund,
    verifyAndSettle,
    retry,
  };
}
