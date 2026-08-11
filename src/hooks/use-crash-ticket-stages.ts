"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { baseSepoliaPublicClient } from "@/lib/base-sepolia";
import {
  deriveRoundPhase,
  deriveTicketOutcome,
  getMarginCallCrashConfig,
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

export type CrashTicketStageStatus<
  Stage extends string,
  ExtraStatus extends string = never,
> =
  | "unavailable"
  | "loading"
  | "ready"
  | `${Stage}-submitting`
  | `${Stage}-pending`
  | ExtraStatus
  | "confirmed"
  | "error";

/**
 * Shared core of the ticket resolution hooks: recovers a returning player's
 * recent ticket, keeps it fresh across wallet-balance changes and a phase
 * clock, and drives receipt-confirmed sponsored transaction stages with
 * retry/resume bookkeeping. Consumers supply their stage set and error copy.
 */
export function useCrashTicketStages<
  Stage extends string,
  ExtraRetryKind extends string = never,
  ExtraStatus extends string = never,
>(copy: {
  stages: Record<Stage, StageErrorCopy>;
  unavailable: string;
  loadFailed: string;
}) {
  type Status = CrashTicketStageStatus<Stage, ExtraStatus>;

  const { stages, unavailable, loadFailed } = copy;
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const transaction = usePrivySponsoredTransaction();
  const gameConfig = useMemo(() => getMarginCallCrashConfig(), []);
  const [state, setState] = useState<{
    ticket?: CrashTicket;
    round?: CrashRound;
    status: Status;
    error: string | null;
  }>({ status: "loading", error: null });
  const [, setClock] = useState(Date.now);
  const inFlightRef = useRef(false);
  const retryKindRef = useRef<Stage | ExtraRetryKind | "refresh" | null>(null);
  const pendingStageRef = useRef<{ stage: Stage; hash: Hex } | null>(null);

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
      retryKindRef.current = null;
      setState({
        ticket: found?.ticket,
        round: found?.round,
        status: "ready",
        error: null,
      });
      return true;
    } catch {
      retryKindRef.current = "refresh";
      setState((current) => ({
        ...current,
        status: "error",
        error: loadFailed,
      }));
      return false;
    }
  }, [gameConfig, loadFailed, walletAddress]);

  useEffect(() => {
    if (!gameConfig) {
      setState({ status: "unavailable", error: unavailable });
      return;
    }
    if (walletAddress) void refresh();
  }, [gameConfig, refresh, unavailable, walletAddress]);

  useEffect(
    () =>
      subscribeToWalletBalanceChanges(() => {
        if (!gameConfig || !walletAddress || inFlightRef.current) return;
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
      retryKindRef.current = stage;
      return runSponsoredStage({
        transaction,
        pendingStage: pendingStageRef,
        stage,
        copy: stages[stage],
        request,
        onStatus: (status) =>
          setState((current) => ({ ...current, status, error: null })),
      });
    },
    [stages, transaction]
  );

  const resumePending = useCallback(
    () =>
      resumeSponsoredStage({
        pendingStage: pendingStageRef,
        copyByStage: stages,
        onStatus: (status, stage) => {
          retryKindRef.current = stage;
          setState((current) => ({ ...current, status, error: null }));
        },
      }),
    [stages]
  );

  const runFlow = useCallback(
    async (fallback: string, flow: () => Promise<void>): Promise<boolean> => {
      inFlightRef.current = true;
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
        inFlightRef.current = false;
      }
    },
    [refresh]
  );

  const ticket = state.ticket ?? null;
  const round = state.round ?? null;
  const phase = round
    ? deriveRoundPhase(round, BigInt(Math.floor(Date.now() / 1000)))
    : null;
  const outcome: TicketOutcome | null =
    ticket && round ? deriveTicketOutcome(ticket, round) : null;

  // Render-time snapshots: refs may only be read inside callbacks, so derived
  // render values come from here rather than from the refs directly.
  const retryKind = retryKindRef.current;
  const canSubmitAfterError =
    state.status === "error" && retryKind !== null && retryKind !== "refresh";
  const canAct =
    (state.status === "ready" || canSubmitAfterError) && !inFlightRef.current;
  const canRetry =
    state.status === "error" && retryKind !== null && !inFlightRef.current;
  const pendingReceiptStage = pendingStageRef.current?.stage ?? null;

  return {
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
  };
}
