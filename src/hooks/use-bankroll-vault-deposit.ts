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
  confirmSponsoredCall,
  submitSponsoredCall,
  type SponsoredCallResult,
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
  | "confirmed"
  | "error";

type Stage = "approval" | "deposit";
type VaultValues = Awaited<ReturnType<typeof readBankrollVaultState>>;
type State = Partial<VaultValues> & {
  status: BankrollVaultDepositStatus;
  error: string | null;
};
const initialState: State = {
  status: "loading",
  error: null,
};
const unavailable =
  "The Bankroll Vault is not configured for this Base Sepolia deployment.";
const loadFailed = "We couldn't load the Bankroll Vault. Please try again.";
const refreshFailed =
  "Your deposit was confirmed, but we couldn't refresh the Bankroll Vault. Please try again.";
const stageCopy: Record<Stage, { failed: string; unconfirmed: string }> = {
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
};

export function useBankrollVaultDeposit(walletAddress: Address | null) {
  const transaction = usePrivySponsoredTransaction();
  const config = useMemo(() => getBankrollVaultConfig(), []);
  const [state, setState] = useState<State>(initialState);
  const inFlight = useRef(false);
  const retryKind = useRef<
    Stage | "refresh" | "refresh-after-confirmation" | null
  >(null);
  const retryAmount = useRef<bigint | null>(null);
  // A stage whose transaction was submitted but whose receipt is unresolved.
  // Retry must re-check this hash — resubmitting could double-deposit.
  const pendingStage = useRef<{ stage: Stage; hash: Hex } | null>(null);

  const refresh = useCallback(
    async (preserveConfirmation = false) => {
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
          error: null,
        }));
        return true;
      } catch {
        retryKind.current = preserveConfirmation
          ? "refresh-after-confirmation"
          : "refresh";
        setState((current) => ({
          ...current,
          status: "error",
          error: preserveConfirmation ? refreshFailed : loadFailed,
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

  const submitDeposit = useCallback(
    async (
      assets: bigint,
      mode: "auto" | "skip-approval" | "resume" = "auto"
    ): Promise<boolean> => {
      if (!config || !walletAddress || assets <= 0n || inFlight.current)
        return false;
      inFlight.current = true;
      retryAmount.current = assets;

      const applyStageResult = (stage: Stage, result: SponsoredCallResult) => {
        if (result.outcome === "confirmed") {
          pendingStage.current = null;
          return;
        }
        if (result.outcome === "confirmation-unknown")
          throw new Error(stageCopy[stage].unconfirmed);
        pendingStage.current = null;
        if (result.outcome === "submission-failed")
          throw new Error(result.message ?? stageCopy[stage].failed);
        throw new Error(stageCopy[stage].failed);
      };

      const runStage = async (
        stage: Stage,
        request: { to: Address; data: Hex }
      ) => {
        retryKind.current = stage;
        setState((current) => ({
          ...current,
          status: `${stage}-submitting`,
          error: null,
        }));
        const result = await submitSponsoredCall(
          transaction,
          request,
          (hash) => {
            pendingStage.current = { stage, hash };
            setState((current) => ({
              ...current,
              status: `${stage}-pending`,
              error: null,
            }));
          }
        );
        applyStageResult(stage, result);
      };

      try {
        let depositConfirmed = false;
        const pending = pendingStage.current;
        if (mode === "resume" && pending) {
          retryKind.current = pending.stage;
          setState((current) => ({
            ...current,
            status: `${pending.stage}-pending`,
            error: null,
          }));
          applyStageResult(
            pending.stage,
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
    [config, refresh, state.allowance, transaction, walletAddress]
  );

  const deposit = useCallback(
    (assets: bigint) => submitDeposit(assets),
    [submitDeposit]
  );
  const retry = useCallback(() => {
    if (retryKind.current === "refresh") return refresh();
    if (retryKind.current === "refresh-after-confirmation")
      return refresh(true);
    const amount = retryAmount.current;
    if (!amount) return Promise.resolve(false);
    if (pendingStage.current) return submitDeposit(amount, "resume");
    return submitDeposit(
      amount,
      retryKind.current === "deposit" ? "skip-approval" : "auto"
    );
  }, [refresh, submitDeposit]);

  // After a resolved approval/deposit failure the form accepts a new amount.
  // An unresolved receipt keeps deposits closed: Retry must settle it first.
  const canDepositAfterError =
    state.status === "error" &&
    (retryKind.current === "approval" || retryKind.current === "deposit") &&
    pendingStage.current === null;

  return {
    ...state,
    canDeposit:
      !!config &&
      !!walletAddress &&
      (state.status === "ready" || canDepositAfterError) &&
      !inFlight.current,
    canRetry:
      state.status === "error" &&
      retryKind.current !== null &&
      !inFlight.current,
    deposit,
    retry,
  };
}
