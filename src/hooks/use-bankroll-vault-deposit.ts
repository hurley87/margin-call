"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  baseSepoliaPublicClient,
} from "@/lib/base-sepolia";
import {
  bankrollVaultAbi,
  getBankrollVaultConfig,
  readBankrollVaultState,
} from "@/lib/bankroll-vault";
import { deskDollarsAbi } from "@/lib/desk-dollars";
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
const approvalFailed =
  "We couldn't approve this exact tUSD amount. Please try again.";
const depositFailed =
  "We couldn't complete your Bankroll Vault deposit. Please try again.";

export function useBankrollVaultDeposit(walletAddress: Address | null) {
  const transaction = usePrivySponsoredTransaction();
  const config = useMemo(() => getBankrollVaultConfig(), []);
  const [state, setState] = useState<State>(initialState);
  const inFlight = useRef(false);
  const retryKind = useRef<
    "approval" | "deposit" | "refresh" | "refresh-after-confirmation" | null
  >(null);
  const retryAmount = useRef<bigint | null>(null);

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

  const submitDeposit = useCallback(
    async (assets: bigint, skipApproval = false): Promise<boolean> => {
      if (!config || !walletAddress || assets <= 0n || inFlight.current)
        return false;
      inFlight.current = true;
      retryAmount.current = assets;

      const submitAndConfirm = async (
        request: { to: Address; data: Hex },
        stage: "approval" | "deposit",
        failMessage: string
      ) => {
        retryKind.current = stage;
        setState((current) => ({
          ...current,
          status: `${stage}-submitting`,
          error: null,
        }));
        const submitted = await transaction.submit({
          ...request,
          chainId: BASE_SEPOLIA_CHAIN_ID,
        });
        if (!submitted)
          throw new Error(transaction.getSubmissionError() ?? failMessage);
        const hash = transaction.getSubmittedHash();
        if (!hash) throw new Error(failMessage);
        setState((current) => ({
          ...current,
          status: `${stage}-pending`,
          error: null,
        }));
        const receipt = await baseSepoliaPublicClient.waitForTransactionReceipt(
          { hash }
        );
        if (receipt.status !== "success") throw new Error(failMessage);
      };

      try {
        if (!skipApproval && (state.allowance ?? 0n) < assets) {
          await submitAndConfirm(
            {
              to: config.tokenAddress,
              data: encodeFunctionData({
                abi: deskDollarsAbi,
                functionName: "approve",
                args: [config.vaultAddress, assets],
              }) as Hex,
            },
            "approval",
            approvalFailed
          );
        }
        await submitAndConfirm(
          {
            to: config.vaultAddress,
            data: encodeFunctionData({
              abi: bankrollVaultAbi,
              functionName: "deposit",
              args: [assets, walletAddress],
            }) as Hex,
          },
          "deposit",
          depositFailed
        );
        setState((current) => ({
          ...current,
          status: "confirmed",
          error: null,
        }));
        return refresh(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : depositFailed;
        setState((current) => ({
          ...current,
          status: "error",
          error: retryKind.current === "approval" ? message : depositFailed,
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
    return submitDeposit(amount, retryKind.current === "deposit");
  }, [refresh, submitDeposit]);

  return {
    ...state,
    canDeposit:
      !!config &&
      !!walletAddress &&
      state.status === "ready" &&
      !inFlight.current,
    canRetry:
      state.status === "error" &&
      retryKind.current !== null &&
      !inFlight.current,
    deposit,
    retry,
  };
}
