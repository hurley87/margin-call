"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useBankrollVaultDeposit,
  type BankrollVaultDepositStatus,
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

function validateAmount(
  amount: string,
  parsed: bigint | null,
  balance: bigint | undefined,
  status: BankrollVaultDepositStatus
): string | null {
  if (amount.length === 0) return null;
  if (parsed === null)
    return `Enter a tUSD amount with no more than ${TUSD_DECIMALS} decimal places.`;
  if (parsed <= 0n) return "Enter a positive tUSD amount.";
  if (balance === undefined) {
    // Unavailable and load-error states already render their own notice;
    // only a load that is genuinely in progress warrants "still loading".
    return status === "loading"
      ? "Your Desk Dollars balance is still loading."
      : null;
  }
  if (parsed > balance)
    return "Deposit amount cannot exceed your wallet Desk Dollars balance.";
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

export function LpDesk() {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const vault = useBankrollVaultDeposit(walletAddress);
  const [amount, setAmount] = useState("");
  const parsedAmount = parseTUsdInput(amount);
  const validationError = validateAmount(
    amount,
    parsedAmount,
    vault.tUsdBalance,
    vault.status
  );
  const canSubmit =
    vault.canDeposit && parsedAmount !== null && !validationError;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || parsedAmount === null) return;
    void vault.deposit(parsedAmount);
  };

  const isAlert = vault.status === "error" || vault.status === "unavailable";
  const statusMessage = isAlert
    ? vault.error
    : (statusCopy[vault.status] ?? null);

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
      </dl>
      <p className="mt-3 text-xs text-[var(--t-muted)]">
        Gross assets are live vault tUSD. Net total assets price shares after
        pending obligations and unrecognized margin.
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

      {statusMessage ? (
        <p
          aria-live={isAlert ? undefined : "polite"}
          className="mt-4 text-sm"
          role={isAlert ? "alert" : undefined}
        >
          {statusMessage}
        </p>
      ) : null}
      {vault.canRetry ? (
        <button
          className="mt-3 rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
          onClick={() => void vault.retry()}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}
