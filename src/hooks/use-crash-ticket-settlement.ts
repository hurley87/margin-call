"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { baseSepoliaPublicClient } from "@/lib/base-sepolia";
import { requestCrashAttestation } from "@/lib/inco-attestation";
import {
  computeCrashPointBps,
  computeTicketPayout,
  deriveRoundPhase,
  deriveTicketOutcome,
  formatCrashPointBps,
  getMarginCallCrashConfig,
  isCrashPointPublished,
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

export type CrashSettlementStatus =
  | "unavailable"
  | "loading"
  | "ready"
  | "reveal-submitting"
  | "reveal-pending"
  | "attesting"
  | "finalize-submitting"
  | "finalize-pending"
  | "claim-submitting"
  | "claim-pending"
  | "settle-submitting"
  | "settle-pending"
  | "confirmed"
  | "error";

export type CrashSettlementRetryAction =
  | "refresh"
  | "verify"
  | "claim"
  | "settle"
  | "reveal-receipt-check"
  | "finalize-receipt-check"
  | "claim-receipt-check"
  | "settle-receipt-check";

type Stage = "reveal" | "finalize" | "claim" | "settle";

type State = {
  ticket?: CrashTicket;
  round?: CrashRound;
  status: CrashSettlementStatus;
  error: string | null;
};

const initialState: State = { status: "loading", error: null };
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
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const transaction = usePrivySponsoredTransaction();
  const gameConfig = useMemo(() => getMarginCallCrashConfig(), []);
  const [state, setState] = useState<State>(initialState);
  const [, setClock] = useState(Date.now);
  const inFlight = useRef(false);
  const retryKind = useRef<Stage | "refresh" | "verify" | null>(null);
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
    // Time only moves the phase before finalization or expiry.
    if (
      state.round &&
      (state.round.status === ROUND_STATUS.finalized ||
        state.round.status === ROUND_STATUS.expired)
    ) {
      return;
    }
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

  const runSettlementFlow = useCallback(
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

  const settleTicket = useCallback(
    async (mode: "claim" | "settle" | "resume" = "claim"): Promise<boolean> => {
      if (!gameConfig || !walletAddress || !state.ticket || inFlight.current) {
        return false;
      }
      if (pendingStage.current && mode !== "resume") return false;

      const ticketId = state.ticket.id;
      return runSettlementFlow(stageCopy.claim.failed, async () => {
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
      resumePending,
      runSettlementFlow,
      runStage,
      state.ticket,
      walletAddress,
    ]
  );

  const verifyAndSettle = useCallback(async (): Promise<boolean> => {
    if (!gameConfig || !walletAddress || !state.ticket || !state.round) {
      return false;
    }
    if (inFlight.current) return false;
    if (pendingStage.current) return settleTicket("resume");

    const ticket = state.ticket;
    const startingRound = state.round;
    retryKind.current = "verify";
    return runSettlementFlow(stageCopy.finalize.failed, async () => {
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
    runSettlementFlow,
    runStage,
    settleTicket,
    state.round,
    state.ticket,
    walletAddress,
  ]);

  const claim = useCallback(() => settleTicket("claim"), [settleTicket]);
  const settleLoss = useCallback(() => settleTicket("settle"), [settleTicket]);

  const retry = useCallback(() => {
    if (retryKind.current === "refresh") return refresh();
    if (pendingStage.current) return settleTicket("resume");
    if (retryKind.current === "verify") return verifyAndSettle();
    if (retryKind.current === "settle") return settleTicket("settle");
    if (retryKind.current === "claim") return settleTicket("claim");
    return refresh();
  }, [refresh, settleTicket, verifyAndSettle]);

  const ticket = state.ticket ?? null;
  const round = state.round ?? null;
  const finalized = round !== null && isCrashPointPublished(round);
  const outcome: TicketOutcome | null =
    ticket && round ? deriveTicketOutcome(ticket, round) : null;
  const payout =
    ticket && round && finalized
      ? computeTicketPayout(
          ticket.margin,
          ticket.leverageBps,
          round.crashPointBps
        )
      : (ticket?.reservedPayout ?? null);
  const phase = round
    ? deriveRoundPhase(round, BigInt(Math.floor(Date.now() / 1000)))
    : null;
  const canVerify =
    !!ticket &&
    !ticket.settled &&
    (phase === "locked" || phase === "reveal-requested");
  const canSubmitAfterError =
    state.status === "error" &&
    retryKind.current !== null &&
    retryKind.current !== "refresh";
  const canAct =
    (state.status === "ready" || canSubmitAfterError) && !inFlight.current;

  const pendingReceiptStage = pendingStage.current?.stage ?? null;
  const retryAction: CrashSettlementRetryAction | null =
    retryKind.current === null
      ? null
      : retryKind.current === "refresh"
        ? "refresh"
        : pendingReceiptStage
          ? `${pendingReceiptStage}-receipt-check`
          : retryKind.current === "verify" || retryKind.current === "settle"
            ? retryKind.current
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
    canRetry:
      state.status === "error" &&
      retryKind.current !== null &&
      !inFlight.current,
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
