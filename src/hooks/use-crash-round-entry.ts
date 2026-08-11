"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { getBankrollVaultConfig } from "@/lib/bankroll-vault";
import { baseSepoliaPublicClient } from "@/lib/base-sepolia";
import {
  deskDollarsAbi,
  formatDeskDollars,
  TUSD_DECIMALS,
} from "@/lib/desk-dollars";
import {
  BOUNDED_ENTRY_ALLOWANCE_TUSD,
  canOfferEntry,
  computeMaximumPayout,
  ENTRY_LEVERAGE_TIERS_BPS,
  ENTRY_MARGINS_TUSD,
  getMarginCallCrashConfig,
  marginCallCrashAbi,
  readPlayerTicket,
  type CrashRoundPhase,
  type CrashTicket,
} from "@/lib/margin-call-crash";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import {
  confirmSponsoredCall,
  submitSponsoredCall,
  type SponsoredCallResult,
} from "@/lib/sponsored-call";
import {
  notifyWalletBalancesChanged,
  subscribeToWalletBalanceChanges,
} from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

export type CrashEntryStatus =
  | "unavailable"
  | "loading"
  | "ready"
  | "approval-submitting"
  | "approval-pending"
  | "entry-submitting"
  | "entry-pending"
  | "confirmed"
  | "error";

export type CrashEntryRetryAction =
  | "refresh"
  | "approval"
  | "entry"
  | "approval-receipt-check"
  | "entry-receipt-check";

type Stage = "approval" | "entry";

type EntryValues = {
  tUsdBalance: bigint;
  allowance: bigint;
  ticket: CrashTicket | null;
};

type State = Partial<EntryValues> & {
  status: CrashEntryStatus;
  error: string | null;
  selectedMargin: bigint;
  selectedLeverageBps: bigint;
};

const initialState: State = {
  status: "loading",
  error: null,
  selectedMargin: ENTRY_MARGINS_TUSD[0],
  selectedLeverageBps: ENTRY_LEVERAGE_TIERS_BPS[0],
};

const unavailable =
  "Crash entry is not configured for this Base Sepolia deployment.";
const loadFailed = "We couldn't load your entry state. Please try again.";
const lateEntryError =
  "Entry closed before your transaction landed. This is a normal outcome near lock.";
const stageCopy: Record<Stage, { failed: string; unconfirmed: string }> = {
  approval: {
    failed:
      "We couldn't approve the bounded 1,000 tUSD allowance. Please try again.",
    unconfirmed:
      "Your tUSD approval was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  entry: {
    failed: "We couldn't complete your entry. Please try again.",
    unconfirmed:
      "Your entry was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

function submittingStatus(stage: Stage): CrashEntryStatus {
  return stage === "approval" ? "approval-submitting" : "entry-submitting";
}

function pendingStatus(stage: Stage): CrashEntryStatus {
  return stage === "approval" ? "approval-pending" : "entry-pending";
}

function applyStageResult(
  pendingStage: { current: { stage: Stage; hash: Hex } | null },
  stage: Stage,
  result: SponsoredCallResult
) {
  if (result.outcome === "confirmed") {
    pendingStage.current = null;
    return;
  }
  if (result.outcome === "confirmation-unknown") {
    throw new Error(stageCopy[stage].unconfirmed);
  }
  pendingStage.current = null;
  if (result.outcome === "submission-failed") {
    throw new Error(result.message ?? stageCopy[stage].failed);
  }
  // Entry reverts near lock are the expected cutoff race; treat them as a
  // normal outcome rather than an infrastructure failure.
  throw new Error(stage === "entry" ? lateEntryError : stageCopy[stage].failed);
}

async function readEntryState(
  gameAddress: Address,
  vaultAddress: Address,
  tokenAddress: Address,
  walletAddress: Address,
  roundId: bigint
): Promise<EntryValues> {
  const [tUsdBalance, allowance, ticket] = await Promise.all([
    baseSepoliaPublicClient.readContract({
      address: tokenAddress,
      abi: deskDollarsAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    baseSepoliaPublicClient.readContract({
      address: tokenAddress,
      abi: deskDollarsAbi,
      functionName: "allowance",
      args: [walletAddress, vaultAddress],
    }),
    readPlayerTicket(
      { address: gameAddress, deploymentBlock: 0n },
      roundId,
      walletAddress
    ),
  ]);
  return { tUsdBalance, allowance, ticket };
}

/**
 * Orchestrates the bounded 1,000 tUSD approval and subsequent sponsored enter calls.
 * Approval is requested once when allowance is below the selected margin; entry never
 * requests an unlimited allowance.
 */
export function useCrashRoundEntry({
  roundId,
  phase,
  countdownSeconds,
}: {
  roundId: bigint | null;
  phase: CrashRoundPhase | null;
  countdownSeconds: number;
}) {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const transaction = usePrivySponsoredTransaction();
  const gameConfig = useMemo(() => getMarginCallCrashConfig(), []);
  const vaultConfig = useMemo(() => getBankrollVaultConfig(), []);
  const [state, setState] = useState<State>(initialState);
  const inFlight = useRef(false);
  const retryKind = useRef<Stage | "refresh" | null>(null);
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);
  const lastEntryArgs = useRef<{ margin: bigint; leverageBps: bigint } | null>(
    null
  );

  const refresh = useCallback(async () => {
    if (!gameConfig || !vaultConfig || !walletAddress || roundId === null) {
      return false;
    }
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const values = await readEntryState(
        gameConfig.address,
        vaultConfig.vaultAddress,
        vaultConfig.tokenAddress,
        walletAddress,
        roundId
      );
      retryKind.current = null;
      setState((current) => ({
        ...current,
        ...values,
        status: "ready",
        error: null,
      }));
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
  }, [gameConfig, roundId, vaultConfig, walletAddress]);

  useEffect(() => {
    if (!gameConfig || !vaultConfig) {
      setState({ ...initialState, status: "unavailable", error: unavailable });
      return;
    }
    if (walletAddress && roundId !== null) void refresh();
  }, [gameConfig, refresh, roundId, vaultConfig, walletAddress]);

  useEffect(
    () =>
      subscribeToWalletBalanceChanges(() => {
        if (
          !gameConfig ||
          !vaultConfig ||
          !walletAddress ||
          roundId === null ||
          inFlight.current
        ) {
          return;
        }
        void readEntryState(
          gameConfig.address,
          vaultConfig.vaultAddress,
          vaultConfig.tokenAddress,
          walletAddress,
          roundId
        )
          .then((values) => setState((current) => ({ ...current, ...values })))
          .catch(() => undefined);
      }),
    [gameConfig, roundId, vaultConfig, walletAddress]
  );

  const runStage = useCallback(
    async (stage: Stage, request: { to: Address; data: Hex }) => {
      retryKind.current = stage;
      setState((current) => ({
        ...current,
        status: submittingStatus(stage),
        error: null,
      }));
      const result = await submitSponsoredCall(transaction, request, (hash) => {
        pendingStage.current = { stage, hash };
        setState((current) => ({
          ...current,
          status: pendingStatus(stage),
          error: null,
        }));
      });
      applyStageResult(pendingStage, stage, result);
    },
    [transaction]
  );

  const selectMargin = useCallback((margin: bigint) => {
    setState((current) => ({ ...current, selectedMargin: margin }));
  }, []);

  const selectLeverage = useCallback((leverageBps: bigint) => {
    setState((current) => ({ ...current, selectedLeverageBps: leverageBps }));
  }, []);

  const submitEntry = useCallback(
    async (
      mode: "auto" | "skip-approval" | "resume" = "auto"
    ): Promise<boolean> => {
      if (
        !gameConfig ||
        !vaultConfig ||
        !walletAddress ||
        roundId === null ||
        inFlight.current
      ) {
        return false;
      }
      const pending = pendingStage.current;
      if (pending && mode !== "resume") return false;
      if (mode === "resume" && !pending) return false;

      const margin = state.selectedMargin;
      const leverageBps = state.selectedLeverageBps;
      lastEntryArgs.current = { margin, leverageBps };
      inFlight.current = true;

      try {
        let entryConfirmed = false;
        if (mode === "resume" && pending) {
          retryKind.current = pending.stage;
          setState((current) => ({
            ...current,
            status: pendingStatus(pending.stage),
            error: null,
          }));
          applyStageResult(
            pendingStage,
            pending.stage,
            await confirmSponsoredCall(pending.hash)
          );
          entryConfirmed = pending.stage === "entry";
        }

        if (!entryConfirmed) {
          if (mode === "auto" && (state.allowance ?? 0n) < margin) {
            await runStage("approval", {
              to: vaultConfig.tokenAddress,
              data: encodeFunctionData({
                abi: deskDollarsAbi,
                functionName: "approve",
                args: [vaultConfig.vaultAddress, BOUNDED_ENTRY_ALLOWANCE_TUSD],
              }) as Hex,
            });
          }

          await runStage("entry", {
            to: gameConfig.address,
            data: encodeFunctionData({
              abi: marginCallCrashAbi,
              functionName: "enter",
              args: [roundId, margin, leverageBps],
            }) as Hex,
          });
        }

        setState((current) => ({
          ...current,
          status: "confirmed",
          error: null,
        }));
        notifyWalletBalancesChanged();
        return refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : stageCopy.entry.failed;
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
    [
      gameConfig,
      refresh,
      roundId,
      runStage,
      state.allowance,
      state.selectedLeverageBps,
      state.selectedMargin,
      vaultConfig,
      walletAddress,
    ]
  );

  const enter = useCallback(() => submitEntry("auto"), [submitEntry]);

  const retry = useCallback(() => {
    if (retryKind.current === "refresh") return refresh();
    if (pendingStage.current) return submitEntry("resume");
    return submitEntry(
      retryKind.current === "entry" ? "skip-approval" : "auto"
    );
  }, [refresh, submitEntry]);

  const expectedPayout = computeMaximumPayout(
    state.selectedMargin,
    state.selectedLeverageBps
  );
  const needsApproval = (state.allowance ?? 0n) < state.selectedMargin;
  const entryOffered = phase !== null && canOfferEntry(phase, countdownSeconds);
  const hasTicket = !!state.ticket;
  const canSubmitAfterError =
    state.status === "error" &&
    (retryKind.current === "approval" || retryKind.current === "entry") &&
    pendingStage.current === null;
  const retryAction: CrashEntryRetryAction | null =
    retryKind.current === null
      ? null
      : retryKind.current === "refresh"
        ? "refresh"
        : pendingStage.current?.stage === "approval"
          ? "approval-receipt-check"
          : pendingStage.current?.stage === "entry"
            ? "entry-receipt-check"
            : retryKind.current;

  return {
    ...state,
    walletAddress,
    expectedPayout,
    needsApproval,
    boundedAllowance: BOUNDED_ENTRY_ALLOWANCE_TUSD,
    vaultAddress: vaultConfig?.vaultAddress ?? null,
    gameAddress: gameConfig?.address ?? null,
    entryOffered,
    hasTicket,
    formattedBalance:
      state.tUsdBalance === undefined
        ? null
        : formatDeskDollars(state.tUsdBalance, TUSD_DECIMALS),
    formattedAllowance:
      state.allowance === undefined
        ? null
        : formatDeskDollars(state.allowance, TUSD_DECIMALS),
    formattedMargin: formatDeskDollars(state.selectedMargin, TUSD_DECIMALS),
    formattedExpectedPayout: formatDeskDollars(expectedPayout, TUSD_DECIMALS),
    formattedBoundedAllowance: formatDeskDollars(
      BOUNDED_ENTRY_ALLOWANCE_TUSD,
      TUSD_DECIMALS
    ),
    canEnter:
      !!gameConfig &&
      !!vaultConfig &&
      !!walletAddress &&
      entryOffered &&
      !hasTicket &&
      (state.status === "ready" || canSubmitAfterError) &&
      (state.tUsdBalance ?? 0n) >= state.selectedMargin &&
      !inFlight.current,
    canRetry:
      state.status === "error" &&
      retryKind.current !== null &&
      !inFlight.current,
    retryAction,
    selectMargin,
    selectLeverage,
    enter,
    retry,
    refresh,
  };
}
