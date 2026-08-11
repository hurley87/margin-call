"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  bankrollVaultAbi,
  getBankrollVaultConfig,
  readBankrollVaultState,
} from "@/lib/bankroll-vault";
import { deskDollarsAbi } from "@/lib/desk-dollars";
import {
  applyStageResult,
  confirmSponsoredCall,
  submitSponsoredCall,
  type StageErrorCopy,
} from "@/lib/sponsored-call";
import {
  notifyWalletBalancesChanged,
  subscribeToWalletBalanceChanges,
} from "@/lib/wallet-balance-sync";
import { usePrivySponsoredTransaction } from "./use-privy-sponsored-transaction";

export type BankrollVaultDepositStatus =
  | "unavailable"
  | "loading"
  | "ready"
  | "approval-submitting"
  | "approval-pending"
  | "deposit-submitting"
  | "deposit-pending"
  | "withdrawal-submitting"
  | "withdrawal-pending"
  | "withdrawal-confirmed"
  | "confirmed"
  | "error";

// How a withdrawal that ended in `status: "error"` can recover. In-progress
// withdrawal phases live in the `withdrawal-*` status values above; this field
// only ever accompanies an error and is cleared when any new stage starts.
export type BankrollVaultWithdrawalRecovery =
  "confirmation-unknown" | "reverted-or-failed" | "refresh-after-confirmation";

// What retry() will actually perform, so UI labels can describe it truthfully.
export type BankrollVaultRetryAction =
  | "refresh"
  | "refresh-after-confirmation"
  | "refresh-after-withdrawal-confirmation"
  | "deposit"
  | "withdrawal"
  | "withdrawal-receipt-check";

type Stage = "approval" | "deposit" | "withdrawal";
type VaultValues = Awaited<ReturnType<typeof readBankrollVaultState>>;
type State = Partial<VaultValues> & {
  status: BankrollVaultDepositStatus;
  withdrawalRecovery: BankrollVaultWithdrawalRecovery | null;
  error: string | null;
};
const initialState: State = {
  status: "loading",
  withdrawalRecovery: null,
  error: null,
};
const unavailable =
  "The Bankroll Vault is not configured for this Base Sepolia deployment.";
const loadFailed = "We couldn't load the Bankroll Vault. Please try again.";
const refreshFailed =
  "Your deposit was confirmed, but we couldn't refresh the Bankroll Vault. Please try again.";
const withdrawalRefreshFailed =
  "Your withdrawal was confirmed, but we couldn't refresh the Bankroll Vault. Please try again.";
const withdrawalFailedAndRefreshFailed =
  "Your LP withdrawal did not complete, and we couldn't reload your balances and limits. Retry reloads them.";
const stageCopy: Record<Stage, StageErrorCopy> = {
  approval: {
    failed: "We couldn't approve this exact tUSD amount. Please try again.",
    unconfirmed:
      "Your tUSD approval was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  deposit: {
    failed:
      "We couldn't complete your Bankroll Vault deposit. Please try again.",
    unconfirmed:
      "Your LP deposit was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
  withdrawal: {
    failed:
      "We couldn't complete your Bankroll Vault withdrawal. We refreshed your available amount so you can retry safely.",
    unconfirmed:
      "Your LP withdrawal was submitted, but we couldn't confirm it yet. Retry to check its status.",
  },
};

export function useBankrollVaultDeposit(walletAddress: Address | null) {
  const transaction = usePrivySponsoredTransaction();
  const config = useMemo(() => getBankrollVaultConfig(), []);
  const [state, setState] = useState<State>(initialState);
  const inFlight = useRef(false);
  const retryKind = useRef<
    | Stage
    | "refresh"
    | "refresh-after-confirmation"
    | "refresh-after-withdrawal-confirmation"
    | null
  >(null);
  const retryAmount = useRef<bigint | null>(null);
  // A stage whose transaction was submitted but whose receipt is unresolved.
  // Retry must re-check this hash — resubmitting could double-deposit.
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);

  const refresh = useCallback(
    async (
      preserveConfirmation = false,
      operation: "deposit" | "withdrawal" = "deposit"
    ) => {
      if (!config || !walletAddress) return false;
      if (!preserveConfirmation)
        setState((current) => ({ ...current, status: "loading", error: null }));
      try {
        const values = await readBankrollVaultState(config, walletAddress);
        retryKind.current = null;
        setState((current) => ({
          ...current,
          ...values,
          status: "ready",
          withdrawalRecovery: null,
          error: null,
        }));
        return true;
      } catch {
        retryKind.current = preserveConfirmation
          ? operation === "withdrawal"
            ? "refresh-after-withdrawal-confirmation"
            : "refresh-after-confirmation"
          : "refresh";
        setState((current) => ({
          ...current,
          status: "error",
          withdrawalRecovery:
            preserveConfirmation && operation === "withdrawal"
              ? "refresh-after-confirmation"
              : null,
          error: preserveConfirmation
            ? operation === "withdrawal"
              ? withdrawalRefreshFailed
              : refreshFailed
            : loadFailed,
        }));
        return false;
      }
    },
    [config, walletAddress]
  );

  useEffect(() => {
    if (!config) {
      setState({ ...initialState, status: "unavailable", error: unavailable });
      return;
    }
    if (walletAddress) void refresh();
  }, [config, refresh, walletAddress]);

  // Background re-read when a sibling panel changes wallet balances. Values
  // merge silently; the visible status and error copy stay authoritative.
  useEffect(
    () =>
      subscribeToWalletBalanceChanges(() => {
        if (!config || !walletAddress || inFlight.current) return;
        void readBankrollVaultState(config, walletAddress)
          .then((values) => setState((current) => ({ ...current, ...values })))
          .catch(() => undefined);
      }),
    [config, walletAddress]
  );

  // Shared submit → pending-receipt → outcome scaffolding for every stage.
  // Starting a stage clears prior withdrawal-recovery copy so a stale flavor
  // can never describe a newer operation's error.
  const runStage = useCallback(
    async (stage: Stage, request: { to: Address; data: Hex }) => {
      retryKind.current = stage;
      setState((current) => ({
        ...current,
        status: `${stage}-submitting`,
        withdrawalRecovery: null,
        error: null,
      }));
      const result = await submitSponsoredCall(transaction, request, (hash) => {
        pendingStage.current = { stage, hash };
        setState((current) => ({
          ...current,
          status: `${stage}-pending`,
          error: null,
        }));
      });
      applyStageResult(pendingStage, stageCopy[stage], result);
    },
    [transaction]
  );

  const submitDeposit = useCallback(
    async (
      assets: bigint,
      mode: "auto" | "skip-approval" | "resume" = "auto"
    ): Promise<boolean> => {
      if (!config || !walletAddress || assets <= 0n || inFlight.current)
        return false;
      const pending = pendingStage.current;
      // A submitted hash is the recovery handle for an operation whose receipt
      // is unresolved. Do not let any public entry point replace it.
      if (pending && mode !== "resume") return false;
      if (mode === "resume" && (!pending || pending.stage === "withdrawal"))
        return false;
      inFlight.current = true;
      retryAmount.current = assets;

      try {
        let depositConfirmed = false;
        if (mode === "resume" && pending) {
          retryKind.current = pending.stage;
          setState((current) => ({
            ...current,
            status: `${pending.stage}-pending`,
            withdrawalRecovery: null,
            error: null,
          }));
          applyStageResult(
            pendingStage,
            stageCopy[pending.stage],
            await confirmSponsoredCall(pending.hash)
          );
          depositConfirmed = pending.stage === "deposit";
        }
        if (!depositConfirmed) {
          if (mode === "auto" && (state.allowance ?? 0n) < assets) {
            await runStage("approval", {
              to: config.tokenAddress,
              data: encodeFunctionData({
                abi: deskDollarsAbi,
                functionName: "approve",
                args: [config.vaultAddress, assets],
              }) as Hex,
            });
          }
          await runStage("deposit", {
            to: config.vaultAddress,
            data: encodeFunctionData({
              abi: bankrollVaultAbi,
              functionName: "deposit",
              args: [assets, walletAddress],
            }) as Hex,
          });
        }
        setState((current) => ({
          ...current,
          status: "confirmed",
          error: null,
        }));
        notifyWalletBalancesChanged();
        return refresh(true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : stageCopy.deposit.failed;
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
    [config, refresh, runStage, state.allowance, walletAddress]
  );

  const deposit = useCallback(
    (assets: bigint) => submitDeposit(assets),
    [submitDeposit]
  );
  const withdraw = useCallback(
    async (
      assets: bigint,
      mode: "new" | "resume" = "new"
    ): Promise<boolean> => {
      if (!config || !walletAddress || assets <= 0n || inFlight.current)
        return false;
      const pending = pendingStage.current;
      if (pending && mode !== "resume") return false;
      if (mode === "resume" && (!pending || pending.stage !== "withdrawal"))
        return false;
      inFlight.current = true;
      retryAmount.current = assets;
      retryKind.current = "withdrawal";
      try {
        if (mode === "resume") {
          setState((current) => ({
            ...current,
            status: "withdrawal-pending",
            withdrawalRecovery: null,
            error: null,
          }));
          applyStageResult(
            pendingStage,
            stageCopy.withdrawal,
            await confirmSponsoredCall(pending!.hash)
          );
        } else {
          await runStage("withdrawal", {
            to: config.vaultAddress,
            data: encodeFunctionData({
              abi: bankrollVaultAbi,
              functionName: "withdraw",
              args: [assets, walletAddress, walletAddress],
            }) as Hex,
          });
        }
        setState((current) => ({
          ...current,
          status: "withdrawal-confirmed",
          withdrawalRecovery: null,
          error: null,
        }));
        notifyWalletBalancesChanged();
        return refresh(true, "withdrawal");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : stageCopy.withdrawal.failed;
        // A definitive failure may have raced a changed free-liquidity limit.
        // Refresh before exposing a corrected amount; an unresolved hash never
        // reaches this branch because it remains in pendingStage.
        if (pendingStage.current === null) {
          try {
            const values = await readBankrollVaultState(config, walletAddress);
            setState((current) => ({
              ...current,
              ...values,
              status: "error",
              withdrawalRecovery: "reverted-or-failed",
              error: message,
            }));
          } catch {
            // The on-screen limit is stale, so don't invite a corrected
            // amount; Retry reloads state before anything else can happen.
            retryKind.current = "refresh";
            setState((current) => ({
              ...current,
              status: "error",
              withdrawalRecovery: null,
              error: withdrawalFailedAndRefreshFailed,
            }));
          }
        } else {
          setState((current) => ({
            ...current,
            status: "error",
            withdrawalRecovery: "confirmation-unknown",
            error: message,
          }));
        }
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [config, refresh, runStage, walletAddress]
  );
  const retry = useCallback(() => {
    if (retryKind.current === "refresh") return refresh();
    if (retryKind.current === "refresh-after-confirmation")
      return refresh(true);
    if (retryKind.current === "refresh-after-withdrawal-confirmation")
      return refresh(true, "withdrawal");
    const amount = retryAmount.current;
    if (!amount) return Promise.resolve(false);
    if (pendingStage.current?.stage === "withdrawal")
      return withdraw(amount, "resume");
    if (retryKind.current === "withdrawal") {
      // The failed call may have raced a reduced free-liquidity limit. The
      // corrected-amount withdrawal entry point is the recovery path when the
      // original amount no longer fits the authoritative post-failure read.
      if (amount > (state.maxWithdraw ?? 0n)) return Promise.resolve(false);
      return withdraw(amount);
    }
    if (pendingStage.current) return submitDeposit(amount, "resume");
    return submitDeposit(
      amount,
      retryKind.current === "deposit" ? "skip-approval" : "auto"
    );
  }, [refresh, state.maxWithdraw, submitDeposit, withdraw]);

  // After any resolved stage failure both forms accept a new amount — a failed
  // withdrawal must not lock out the deposit that could restore liquidity. An
  // unresolved receipt keeps both closed: Retry must settle it first.
  const canSubmitAfterError =
    state.status === "error" &&
    (retryKind.current === "approval" ||
      retryKind.current === "deposit" ||
      retryKind.current === "withdrawal") &&
    pendingStage.current === null;
  // An unresolved withdrawal hash is exempt from the limit gate: Retry only
  // re-checks that receipt, which stays valid however the limit moves.
  const canRetryWithdrawal =
    retryKind.current !== "withdrawal" ||
    pendingStage.current !== null ||
    ((retryAmount.current ?? 0n) > 0n &&
      (retryAmount.current ?? 0n) <= (state.maxWithdraw ?? 0n));
  // Mirrors retry()'s dispatch so labels always describe the real action.
  const retryAction: BankrollVaultRetryAction | null =
    retryKind.current === null
      ? null
      : retryKind.current === "refresh" ||
          retryKind.current === "refresh-after-confirmation" ||
          retryKind.current === "refresh-after-withdrawal-confirmation"
        ? retryKind.current
        : pendingStage.current?.stage === "withdrawal"
          ? "withdrawal-receipt-check"
          : retryKind.current === "withdrawal"
            ? "withdrawal"
            : "deposit";

  return {
    ...state,
    canDeposit:
      !!config &&
      !!walletAddress &&
      (state.status === "ready" || canSubmitAfterError) &&
      !inFlight.current,
    canWithdraw:
      !!config &&
      !!walletAddress &&
      (state.status === "ready" || canSubmitAfterError) &&
      !inFlight.current,
    canRetry:
      state.status === "error" &&
      retryKind.current !== null &&
      canRetryWithdrawal &&
      !inFlight.current,
    retryAction,
    deposit,
    withdraw,
    retry,
  };
}
