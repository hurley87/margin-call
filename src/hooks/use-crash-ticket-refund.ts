"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { baseSepoliaPublicClient } from "@/lib/base-sepolia";
import {
  canExpireRound,
  deriveRoundPhase,
  deriveTicketOutcome,
  getMarginCallCrashConfig,
  isRefundable,
  marginCallCrashAbi,
  readPlayerRecentTicket,
  ROUND_STATUS,
  type CrashRound,
  type CrashTicket,
  type TicketOutcome,
} from "@/lib/margin-call-crash";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import {
  resumeSponsoredStage,
  runSponsoredStage,
  type StageErrorCopy,
} from "@/lib/sponsored-call";
import {
  notifyWalletBalancesChanged,
  subscribeToWalletBalanceChanges,
} from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

export type CrashRefundStatus =
  | "unavailable"
  | "loading"
  | "ready"
  | "expire-submitting"
  | "expire-pending"
  | "refund-submitting"
  | "refund-pending"
  | "confirmed"
  | "error";

export type CrashRefundRetryAction =
  | "refresh"
  | "expire"
  | "refund"
  | "expire-receipt-check"
  | "refund-receipt-check";

type Stage = "expire" | "refund";

type State = {
  ticket?: CrashTicket;
  round?: CrashRound;
  status: CrashRefundStatus;
  error: string | null;
};

const initialState: State = { status: "loading", error: null };
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
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const transaction = usePrivySponsoredTransaction();
  const gameConfig = useMemo(() => getMarginCallCrashConfig(), []);
  const [state, setState] = useState<State>(initialState);
  const [, setClock] = useState(Date.now);
  const inFlight = useRef(false);
  const retryKind = useRef<Stage | "refresh" | null>(null);
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!gameConfig || !walletAddress) return false;
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const currentRoundId = await baseSepoliaPublicClient.readContract({
        address: gameConfig.address,
        abi: marginCallCrashAbi,
        functionName: "currentRoundId",
      });
      const found = await readPlayerRecentTicket(
        gameConfig.address,
        currentRoundId,
        walletAddress
      );
      retryKind.current = null;
      setState({
        ticket: found?.ticket,
        round: found?.round,
        status: "ready",
        error: null,
      });
      return true;
    } catch {
      retryKind.current = "refresh";
      setState((current) => ({
        ...current,
        status: "error",
        error: loadFailed,
      }));
      return false;
    }
  }, [gameConfig, walletAddress]);

  useEffect(() => {
    if (!gameConfig) {
      setState({ ...initialState, status: "unavailable", error: unavailable });
      return;
    }
    if (walletAddress) void refresh();
  }, [gameConfig, refresh, walletAddress]);

  useEffect(
    () =>
      subscribeToWalletBalanceChanges(() => {
        if (!gameConfig || !walletAddress || inFlight.current) return;
        void refresh();
      }),
    [gameConfig, refresh, walletAddress]
  );

  useEffect(() => {
    if (!state.ticket || state.ticket.settled) return;
    if (state.round && state.round.status === ROUND_STATUS.expired) return;
    const tick = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(tick);
  }, [state.round, state.ticket]);

  const runStage = useCallback(
    (stage: Stage, request: { to: Address; data: Hex }) => {
      retryKind.current = stage;
      return runSponsoredStage({
        transaction,
        pendingStage,
        stage,
        copy: stageCopy[stage],
        request,
        onStatus: (status) =>
          setState((current) => ({ ...current, status, error: null })),
      });
    },
    [transaction]
  );

  const resumePending = useCallback(
    () =>
      resumeSponsoredStage({
        pendingStage,
        copyByStage: stageCopy,
        onStatus: (status, stage) => {
          retryKind.current = stage;
          setState((current) => ({ ...current, status, error: null }));
        },
      }),
    []
  );

  const runRefundFlow = useCallback(
    async (fallback: string, flow: () => Promise<void>): Promise<boolean> => {
      inFlight.current = true;
      try {
        await flow();
        setState((current) => ({
          ...current,
          status: "confirmed",
          error: null,
        }));
        notifyWalletBalancesChanged();
        return refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : fallback;
        setState((current) => ({
          ...current,
          status: "error",
          error: message,
        }));
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [refresh]
  );

  const expireRound = useCallback(
    async (mode: "expire" | "resume" = "expire"): Promise<boolean> => {
      if (!gameConfig || !walletAddress || !state.round || inFlight.current) {
        return false;
      }
      if (pendingStage.current && mode !== "resume") return false;

      const roundId = state.round.id;
      return runRefundFlow(stageCopy.expire.failed, async () => {
        if (mode === "resume") {
          await resumePending();
        } else {
          await runStage("expire", expireRequest(gameConfig.address, roundId));
        }
        setState((current) =>
          current.round
            ? {
                ...current,
                round: { ...current.round, status: ROUND_STATUS.expired },
              }
            : current
        );
      });
    },
    [
      gameConfig,
      resumePending,
      runRefundFlow,
      runStage,
      state.round,
      walletAddress,
    ]
  );

  const refund = useCallback(
    async (mode: "refund" | "resume" = "refund"): Promise<boolean> => {
      if (!gameConfig || !walletAddress || !state.ticket || inFlight.current) {
        return false;
      }
      if (pendingStage.current && mode !== "resume") return false;

      const ticketId = state.ticket.id;
      return runRefundFlow(stageCopy.refund.failed, async () => {
        if (mode === "resume") {
          await resumePending();
        } else {
          await runStage("refund", refundRequest(gameConfig.address, ticketId));
        }
      });
    },
    [
      gameConfig,
      resumePending,
      runRefundFlow,
      runStage,
      state.ticket,
      walletAddress,
    ]
  );

  const retry = useCallback(() => {
    if (retryKind.current === "refresh") return refresh();
    if (pendingStage.current?.stage === "expire") return expireRound("resume");
    if (pendingStage.current?.stage === "refund") return refund("resume");
    if (retryKind.current === "expire") return expireRound("expire");
    if (retryKind.current === "refund") return refund("refund");
    return refresh();
  }, [expireRound, refresh, refund]);

  const ticket = state.ticket ?? null;
  const round = state.round ?? null;
  const chainTimestamp = BigInt(Math.floor(Date.now() / 1000));
  const phase = round ? deriveRoundPhase(round, chainTimestamp) : null;
  const outcome: TicketOutcome | null =
    ticket && round ? deriveTicketOutcome(ticket, round) : null;
  const isOwner =
    !!ticket &&
    !!walletAddress &&
    ticket.player.toLowerCase() === walletAddress.toLowerCase();

  const canSubmitAfterError =
    state.status === "error" &&
    retryKind.current !== null &&
    retryKind.current !== "refresh";
  const canAct =
    (state.status === "ready" || canSubmitAfterError) &&
    !inFlight.current &&
    isOwner;

  const pendingReceiptStage = pendingStage.current?.stage ?? null;
  const retryAction: CrashRefundRetryAction | null =
    retryKind.current === null
      ? null
      : retryKind.current === "refresh"
        ? "refresh"
        : pendingReceiptStage
          ? `${pendingReceiptStage}-receipt-check`
          : retryKind.current;

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
      !!round &&
      canExpireRound(round, chainTimestamp) &&
      !!ticket &&
      !ticket.settled &&
      canAct,
    canRefund: !!ticket && isRefundable(ticket, round) && canAct,
    canRetry:
      state.status === "error" &&
      retryKind.current !== null &&
      !inFlight.current,
    retryAction,
    expireRound: () => expireRound("expire"),
    refund: () => refund("refund"),
    retry,
    refresh,
  };
}

function expireRequest(to: Address, roundId: bigint) {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "expireRound",
      args: [roundId],
    }) as Hex,
  };
}

function refundRequest(to: Address, ticketId: bigint) {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "refund",
      args: [ticketId, zeroAddress],
    }) as Hex,
  };
}
