"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useBankrollVaultDeposit,
  type BankrollVaultDepositStatus,
  type BankrollVaultRetryAction,
  type BankrollVaultWithdrawalRecovery,
} from "@/hooks/use-bankroll-vault-deposit";
import {
  formatDeskDollars,
  parseTUsdInput,
  TUSD_DECIMALS,
} from "@/lib/desk-dollars";
import { getEvmWalletAddress } from "@/lib/privy/wallet";

function formatAmount(value: bigint | undefined, unit: string) {
  return value === undefined
    ? `— ${unit}`
    : `${formatDeskDollars(value, TUSD_DECIMALS)} ${unit}`;
}

const depositAmountCopy = {
  limitLoading: "Your Desk Dollars balance is still loading.",
  overLimit: "Deposit amount cannot exceed your wallet Desk Dollars balance.",
};

const withdrawalAmountCopy = {
  limitLoading: "Your withdrawable tUSD limit is still loading.",
  overLimit:
    "Withdrawal amount cannot exceed your immediately withdrawable tUSD limit.",
};

function validateAmount(
  amount: string,
  parsed: bigint | null,
  limit: bigint | undefined,
  status: BankrollVaultDepositStatus,
  copy: { limitLoading: string; overLimit: string }
): string | null {
  if (amount.length === 0) return null;
  if (parsed === null)
    return `Enter a tUSD amount with no more than ${TUSD_DECIMALS} decimal places.`;
  if (parsed <= 0n) return "Enter a positive tUSD amount.";
  if (limit === undefined) {
    // Unavailable and load-error states already render their own notice;
    // only a load that is genuinely in progress warrants "still loading".
    return status === "loading" ? copy.limitLoading : null;
  }
  if (parsed > limit) return copy.overLimit;
  return null;
}

const statusCopy: Partial<Record<BankrollVaultDepositStatus, string>> = {
  loading: "Loading your Bankroll Vault balances…",
  "approval-submitting": "Submitting an exact tUSD approval…",
  "approval-pending":
    "Exact tUSD approval pending until its Base Sepolia receipt succeeds…",
  "deposit-submitting": "Submitting your LP deposit…",
  "deposit-pending":
    "LP deposit pending until its Base Sepolia receipt succeeds. Vault shares will not update until confirmation.",
  confirmed: "LP deposit confirmed on Base Sepolia.",
};

const withdrawalPhaseCopy: Partial<Record<BankrollVaultDepositStatus, string>> =
  {
    "withdrawal-submitting": "Submitting your LP withdrawal…",
    "withdrawal-pending":
      "LP withdrawal pending until its Base Sepolia receipt succeeds. Wallet tUSD, shares, and limits will not update until confirmation.",
    "withdrawal-confirmed": "LP withdrawal confirmed on Base Sepolia.",
  };

const withdrawalRecoveryCopy: Record<BankrollVaultWithdrawalRecovery, string> =
  {
    "confirmation-unknown":
      "Your LP withdrawal was submitted, but its receipt is still unconfirmed. Retry checks that same withdrawal.",
    "reverted-or-failed":
      "LP withdrawal did not complete. Your authoritative withdrawable limit was refreshed; enter an amount within that limit to try again.",
    "refresh-after-confirmation":
      "LP withdrawal was confirmed, but the refreshed balances and limits could not be loaded. Retry refreshes the confirmed withdrawal state.",
  };

const retryLabels: Record<BankrollVaultRetryAction, string> = {
  refresh: "Retry",
  "refresh-after-confirmation": "Refresh confirmed deposit",
  "refresh-after-withdrawal-confirmation": "Refresh confirmed withdrawal",
  deposit: "Retry deposit",
  withdrawal: "Retry withdrawal",
  "withdrawal-receipt-check": "Retry withdrawal receipt check",
};

export function LpDesk() {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const vault = useBankrollVaultDeposit(walletAddress);
  const [amount, setAmount] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const parsedAmount = parseTUsdInput(amount);
  const validationError = validateAmount(
    amount,
    parsedAmount,
    vault.tUsdBalance,
    vault.status,
    depositAmountCopy
  );
  const canSubmit =
    vault.canDeposit && parsedAmount !== null && !validationError;
  const parsedWithdrawalAmount = parseTUsdInput(withdrawalAmount);
  const withdrawalValidationError = validateAmount(
    withdrawalAmount,
    parsedWithdrawalAmount,
    vault.maxWithdraw,
    vault.status,
    withdrawalAmountCopy
  );
  const canWithdraw =
    vault.canWithdraw &&
    parsedWithdrawalAmount !== null &&
    !withdrawalValidationError;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || parsedAmount === null) return;
    void vault.deposit(parsedAmount);
  };
  const submitWithdrawal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWithdraw || parsedWithdrawalAmount === null) return;
    void vault.withdraw(parsedWithdrawalAmount);
  };

  const withdrawalRecovery =
    vault.status === "error" ? vault.withdrawalRecovery : null;
  const isAlert =
    vault.status === "unavailable" ||
    (vault.status === "error" && !withdrawalRecovery);
  const statusMessage = isAlert
    ? vault.error
    : (statusCopy[vault.status] ?? null);
  const withdrawalMessage =
    withdrawalPhaseCopy[vault.status] ??
    (withdrawalRecovery ? withdrawalRecoveryCopy[withdrawalRecovery] : null);
  const withdrawalIsAlert = withdrawalRecovery !== null;
  const retryLabel = vault.retryAction
    ? retryLabels[vault.retryAction]
    : "Retry";

  return (
    <section
      aria-labelledby="lp-desk-heading"
      className="mt-8 rounded-sm border border-[var(--t-muted)] p-5 text-left"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lp-desk-heading" className="font-bold text-[var(--t-accent)]">
          LP Desk
        </h2>
        <p className="text-xs text-[var(--t-muted)]">
          Base Sepolia · no real value
        </p>
      </div>
      <p className="mt-2 text-sm text-[var(--t-text)]">
        Provide Desk Dollars (tUSD) to receive vault shares.
      </p>
      <p className="mt-3 rounded-sm border border-[var(--t-amber)] p-3 text-sm text-[var(--t-text)]">
        Warning: vault-share value can decline as game results are realized.
      </p>

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--t-muted)]">Wallet Desk Dollars</dt>
          <dd>{formatAmount(vault.tUsdBalance, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Wallet vault shares</dt>
          <dd>{formatAmount(vault.shareBalance, "vault shares")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">
            Share price (assets per share)
          </dt>
          <dd>{formatAmount(vault.assetsPerShare, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Gross assets</dt>
          <dd>{formatAmount(vault.grossAssets, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Net total assets</dt>
          <dd>{formatAmount(vault.totalAssets, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Total supply</dt>
          <dd>{formatAmount(vault.totalSupply, "vault shares")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Pending obligations</dt>
          <dd>{formatAmount(vault.pendingObligations, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Unrecognized margin</dt>
          <dd>{formatAmount(vault.unrecognizedMargin, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Reserved liabilities</dt>
          <dd>{formatAmount(vault.reservedLiabilities, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Safety buffer</dt>
          <dd>{formatAmount(vault.safetyBuffer, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Global free liquidity</dt>
          <dd>{formatAmount(vault.freeLiquidity, "tUSD")}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">
            Your immediately withdrawable tUSD
          </dt>
          <dd>{formatAmount(vault.maxWithdraw, "tUSD")}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-[var(--t-muted)]">
        Gross assets are live vault tUSD. Net total assets price shares after
        pending obligations and unrecognized margin.
      </p>
      <p className="mt-2 text-xs text-[var(--t-muted)]">
        Global free liquidity is the vault-wide capacity after reservations and
        its safety buffer. Your immediately withdrawable limit is your
        proportional, authoritative maxWithdraw amount and may be lower.
      </p>

      <form
        className="mt-6 border-t border-[var(--t-muted)] pt-5"
        onSubmit={submit}
      >
        <label className="block text-sm font-bold" htmlFor="lp-deposit-amount">
          LP deposit amount (tUSD)
        </label>
        <input
          aria-describedby="lp-deposit-help lp-deposit-validation"
          className="mt-2 w-full rounded-sm border border-[var(--t-muted)] bg-transparent px-3 py-2 text-[var(--t-text)]"
          id="lp-deposit-amount"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.000000"
          value={amount}
        />
        <p id="lp-deposit-help" className="mt-2 text-xs text-[var(--t-muted)]">
          An exact tUSD approval for this deposit may occur first. The LP Desk
          never requests unlimited approval.
        </p>
        {validationError ? (
          <p id="lp-deposit-validation" role="alert" className="mt-2 text-sm">
            {validationError}
          </p>
        ) : null}
        <button
          className="mt-4 rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)] disabled:opacity-50"
          disabled={!canSubmit}
          type="submit"
        >
          {vault.status.startsWith("approval-")
            ? "Approval pending…"
            : vault.status.startsWith("deposit-")
              ? "LP deposit pending…"
              : "Deposit tUSD"}
        </button>
      </form>

      <form
        className="mt-6 border-t border-[var(--t-muted)] pt-5"
        onSubmit={submitWithdrawal}
      >
        <label
          className="block text-sm font-bold"
          htmlFor="lp-withdrawal-amount"
        >
          LP withdrawal amount (tUSD)
        </label>
        <input
          aria-describedby="lp-withdrawal-help lp-withdrawal-validation"
          className="mt-2 w-full rounded-sm border border-[var(--t-muted)] bg-transparent px-3 py-2 text-[var(--t-text)]"
          id="lp-withdrawal-amount"
          inputMode="decimal"
          onChange={(event) => setWithdrawalAmount(event.target.value)}
          placeholder="0.000000"
          value={withdrawalAmount}
        />
        <p
          id="lp-withdrawal-help"
          className="mt-2 text-xs text-[var(--t-muted)]"
        >
          Withdraw tUSD, not shares, up to your authoritative immediately
          withdrawable limit. This limit is separate from global free liquidity.
        </p>
        {withdrawalValidationError ? (
          <p
            id="lp-withdrawal-validation"
            role="alert"
            className="mt-2 text-sm"
          >
            {withdrawalValidationError}
          </p>
        ) : null}
        <button
          className="mt-4 rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)] disabled:opacity-50"
          disabled={!canWithdraw}
          type="submit"
        >
          {vault.status === "withdrawal-submitting"
            ? "Withdrawal submitting…"
            : vault.status === "withdrawal-pending"
              ? "Withdrawal pending…"
              : "Withdraw tUSD"}
        </button>
      </form>

      {statusMessage ? (
        <p
          aria-live={isAlert ? undefined : "polite"}
          className="mt-4 text-sm"
          role={isAlert ? "alert" : undefined}
        >
          {statusMessage}
        </p>
      ) : null}
      {withdrawalMessage ? (
        <p
          aria-live={withdrawalIsAlert ? undefined : "polite"}
          className="mt-4 text-sm"
          role={withdrawalIsAlert ? "alert" : undefined}
        >
          {withdrawalMessage}
        </p>
      ) : null}
      {vault.canRetry ? (
        <button
          className="mt-3 rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
          onClick={() => void vault.retry()}
          type="button"
        >
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}
