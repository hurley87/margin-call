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

/** Submitted stage transaction: hash is known at submit, confirmed at receipt. */
export type StageTransactionState = { hash: Hex; confirmed: boolean };

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
    stageHashes: Partial<Record<Stage, StageTransactionState>>;
  }>({ status: "loading", error: null, stageHashes: {} });
  const [, setClock] = useState(Date.now);
  const inFlightRef = useRef(false);
  const retryKindRef = useRef<Stage | ExtraRetryKind | "refresh" | null>(null);
  const pendingStageRef = useRef<{ stage: Stage; hash: Hex } | null>(null);

  const refresh = useCallback(
    async (options?: { preserveStatus?: boolean }): Promise<boolean> => {
      if (!gameConfig || !walletAddress) return false;
      const preserveStatus = options?.preserveStatus ?? false;
      // preserveStatus keeps a just-set "confirmed" observable: the loading
      // overwrite would otherwise batch into the same render and erase it.
      if (!preserveStatus) {
        setState((current) => ({ ...current, status: "loading", error: null }));
      }
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
        setState((current) => ({
          ticket: found?.ticket,
          round: found?.round,
          // A confirmed flow that left the ticket unsettled (receipt-only
          // resume) falls back to ready so its next action stays reachable.
          status:
            preserveStatus && (found?.ticket?.settled ?? true)
              ? current.status
              : "ready",
          error: null,
          // Stage hashes describe one ticket's settlement; drop them once the
          // recovered ticket changes.
          stageHashes:
            found?.ticket && current.ticket?.id === found.ticket.id
              ? current.stageHashes
              : {},
        }));
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
    },
    [gameConfig, loadFailed, walletAddress]
  );

  useEffect(() => {
    if (!gameConfig) {
      setState({ status: "unavailable", error: unavailable, stageHashes: {} });
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

  const markStageConfirmed = useCallback((stage: Stage) => {
    setState((current) => {
      const recorded = current.stageHashes[stage];
      if (!recorded || recorded.confirmed) return current;
      const stageHashes = { ...current.stageHashes };
      stageHashes[stage] = { ...recorded, confirmed: true };
      return { ...current, stageHashes };
    });
  }, []);

  const runStage = useCallback(
    async (stage: Stage, request: { to: Address; data: Hex }) => {
      retryKindRef.current = stage;
      await runSponsoredStage({
        transaction,
        pendingStage: pendingStageRef,
        stage,
        copy: stages[stage],
        request,
        onStatus: (status) =>
          setState((current) => ({ ...current, status, error: null })),
        onHash: (hash) =>
          setState((current) => {
            const stageHashes = { ...current.stageHashes };
            stageHashes[stage] = { hash, confirmed: false };
            return { ...current, stageHashes };
          }),
      });
      // runSponsoredStage throws on every non-confirmed outcome.
      markStageConfirmed(stage);
    },
    [markStageConfirmed, stages, transaction]
  );

  const resumePending = useCallback(async () => {
    const stage = await resumeSponsoredStage({
      pendingStage: pendingStageRef,
      copyByStage: stages,
      onStatus: (status, stage) => {
        retryKindRef.current = stage;
        setState((current) => ({ ...current, status, error: null }));
      },
    });
    if (stage !== null) markStageConfirmed(stage);
    return stage;
  }, [markStageConfirmed, stages]);

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
        return refresh({ preserveStatus: true });
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

  /** Refresh unless a settlement flow is mid-flight (e.g. on a round flip). */
  const refreshIfIdle = useCallback(() => {
    if (inFlightRef.current) return;
    void refresh();
  }, [refresh]);

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
    stageHashes: state.stageHashes,
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
  };
}
