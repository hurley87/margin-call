"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useBankrollVaultDeposit } from "@/hooks/use-bankroll-vault-deposit";
import { formatDeskDollars } from "@/lib/desk-dollars";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { parseTUsdInput } from "@/lib/tusd-input";

const unavailableValue = "— tUSD";

function formatTUsd(value: bigint | undefined) {
  return value === undefined
    ? unavailableValue
    : `${formatDeskDollars(value, 6)} tUSD`;
}

function formatVaultShares(value: bigint | undefined) {
  return value === undefined
    ? "— vault shares"
    : `${formatDeskDollars(value, 6)} vault shares`;
}

export function LpDesk() {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const vault = useBankrollVaultDeposit(walletAddress);
  const [amount, setAmount] = useState("");
  const parsedAmount = parseTUsdInput(amount);
  const validationError =
    amount.length === 0
      ? null
      : parsedAmount === null
        ? "Enter a tUSD amount with no more than 6 decimal places."
        : parsedAmount <= 0n
          ? "Enter a positive tUSD amount."
          : vault.tUsdBalance === undefined
            ? "Your Desk Dollars balance is still loading."
            : parsedAmount > vault.tUsdBalance
              ? "Deposit amount cannot exceed your wallet Desk Dollars balance."
              : null;
  const canSubmit =
    vault.canDeposit && parsedAmount !== null && !validationError;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || parsedAmount === null) return;
    void vault.deposit(parsedAmount);
  };

  const statusMessage = (() => {
    switch (vault.status) {
      case "unavailable":
        return vault.error;
      case "loading":
        return "Loading your Bankroll Vault balances…";
      case "approval-submitting":
        return "Submitting an exact tUSD approval…";
      case "approval-pending":
        return "Exact tUSD approval pending until its Base Sepolia receipt succeeds…";
      case "deposit-submitting":
        return "Submitting your LP deposit…";
      case "deposit-pending":
        return "LP deposit pending until its Base Sepolia receipt succeeds. Vault shares will not update until confirmation.";
      case "confirmed":
        return "LP deposit confirmed on Base Sepolia.";
      case "error":
        return vault.error;
      default:
        return null;
    }
  })();
  const liveStatus =
    vault.status === "loading" ||
    vault.status === "approval-submitting" ||
    vault.status === "approval-pending" ||
    vault.status === "deposit-submitting" ||
    vault.status === "deposit-pending" ||
    vault.status === "confirmed";

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
          <dd>{formatTUsd(vault.tUsdBalance)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Wallet vault shares</dt>
          <dd>{formatVaultShares(vault.shareBalance)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">
            Share price (assets per share)
          </dt>
          <dd>{formatTUsd(vault.assetsPerShare)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Gross assets</dt>
          <dd>{formatTUsd(vault.grossAssets)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Net total assets</dt>
          <dd>{formatTUsd(vault.totalAssets)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Total supply</dt>
          <dd>{formatVaultShares(vault.totalSupply)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Pending obligations</dt>
          <dd>{formatTUsd(vault.pendingObligations)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Unrecognized margin</dt>
          <dd>{formatTUsd(vault.unrecognizedMargin)}</dd>
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
          {vault.status === "approval-submitting" ||
          vault.status === "approval-pending"
            ? "Approval pending…"
            : vault.status === "deposit-submitting" ||
                vault.status === "deposit-pending"
              ? "LP deposit pending…"
              : "Deposit tUSD"}
        </button>
      </form>

      {statusMessage ? (
        <p
          aria-live={liveStatus ? "polite" : undefined}
          className="mt-4 text-sm"
          role={
            vault.status === "error" || vault.status === "unavailable"
              ? "alert"
              : undefined
          }
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
