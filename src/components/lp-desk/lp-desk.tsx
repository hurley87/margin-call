"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useBankrollVaultDeposit,
  type BankrollVaultDepositStatus,
  type BankrollVaultRetryAction,
  type BankrollVaultWithdrawalRecovery,
} from "@/hooks/use-bankroll-vault-deposit";
import {
  useLpFreezeActions,
  type LpFreezeActionStatus,
  type LpFreezeRetryAction,
} from "@/hooks/use-lp-freeze-actions";
import type { BlockingRoundDetail, TierCapacity } from "@/lib/bankroll-vault";
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

function formatSignedAmount(value: bigint | undefined) {
  if (value === undefined) return "— tUSD";
  const sign = value < 0n ? "−" : value > 0n ? "+" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${formatDeskDollars(abs, TUSD_DECIMALS)} tUSD`;
}

function formatUtilization(bps: bigint | undefined) {
  if (bps === undefined) return "—";
  const whole = bps / 100n;
  const fraction = bps % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, "0")}%`;
}

function formatExpiry(expiresAt: bigint | undefined, chainTimestamp?: bigint) {
  if (expiresAt === undefined) return "—";
  const date = new Date(Number(expiresAt) * 1000);
  const label = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (chainTimestamp !== undefined && chainTimestamp >= expiresAt) {
    return `${label} (eligible now)`;
  }
  return label;
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

const freezeStatusCopy: Partial<Record<LpFreezeActionStatus, string>> = {
  attesting: "Fetching Inco attestation for the blocking round…",
  "finalize-submitting": "Submitting finalize for the blocking round…",
  "finalize-pending":
    "Finalization pending until its Base Sepolia receipt succeeds…",
  "expire-submitting": "Submitting expire for the blocking round…",
  "expire-pending": "Expiry pending until its Base Sepolia receipt succeeds…",
  confirmed: "Blocking round resolved on Base Sepolia.",
};

const freezeRetryLabels: Record<LpFreezeRetryAction, string> = {
  finalize: "Retry finalize",
  expire: "Retry expire",
  "finalize-receipt-check": "Retry finalize receipt check",
  "expire-receipt-check": "Retry expire receipt check",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--t-muted)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FreezeBanner({
  blockingRounds,
  earliestExpiry,
  chainTimestamp,
  freeze,
}: {
  blockingRounds: BlockingRoundDetail[];
  earliestExpiry: bigint | undefined;
  chainTimestamp: bigint | undefined;
  freeze: ReturnType<typeof useLpFreezeActions>;
}) {
  return (
    <div
      role="alert"
      className="mt-4 border border-[var(--t-amber)] bg-[color-mix(in_oklab,var(--t-amber)_12%,transparent)] p-4 text-sm text-[var(--t-text)]"
    >
      <p className="font-bold text-[var(--t-amber)]">
        Reveal-window freeze — LP deposits and withdrawals are blocked
      </p>
      <p className="mt-2">
        Share operations stay frozen while any exposed round is revealed or
        expiry-eligible but not yet marked into vault obligations. The 15-minute
        expiry bounds <span className="font-bold">one round&apos;s</span>{" "}
        freeze, not the total — overlapping delayed rounds during a sustained
        reveal outage can keep LP deposits and withdrawals frozen indefinitely.
      </p>
      <p className="mt-2 text-[var(--t-muted)]">
        Earliest clearing expiry: {formatExpiry(earliestExpiry, chainTimestamp)}
      </p>
      <ul className="mt-3 space-y-2">
        {blockingRounds.map((round) => {
          const busy =
            freeze.activeRoundId === round.roundId &&
            freeze.status !== "idle" &&
            freeze.status !== "confirmed" &&
            freeze.status !== "error";
          const actionLabel = round.expiryEligible
            ? "Expire round"
            : round.revealFrozen
              ? "Finalize round"
              : null;
          return (
            <li
              key={round.roundId.toString()}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--t-muted)] pt-2"
            >
              <div>
                <p className="font-bold">Round {round.roundId.toString()}</p>
                <p className="text-xs text-[var(--t-muted)]">
                  Expires {formatExpiry(round.expiresAt, chainTimestamp)}
                  {round.revealFrozen ? " · reveal requested" : " · still open"}
                  {round.expiryEligible ? " · expiry eligible" : ""}
                </p>
              </div>
              {actionLabel ? (
                <button
                  className="rounded-sm border border-[var(--t-amber)] px-3 py-1.5 text-xs font-bold text-[var(--t-amber)] disabled:opacity-50"
                  disabled={!freeze.canAct || busy}
                  onClick={() => void freeze.resolveBlockingRound(round)}
                  type="button"
                >
                  {busy ? "Working…" : actionLabel}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {freezeStatusCopy[freeze.status] ? (
        <p className="mt-3" aria-live="polite">
          {freezeStatusCopy[freeze.status]}
        </p>
      ) : null}
      {freeze.status === "error" && freeze.error ? (
        <p className="mt-3" role="alert">
          {freeze.error}
        </p>
      ) : null}
      {freeze.canRetry && freeze.retryAction ? (
        <button
          className="mt-3 rounded-sm border border-[var(--t-muted)] px-3 py-1.5 text-xs font-bold"
          onClick={() => void freeze.retry()}
          type="button"
        >
          {freezeRetryLabels[freeze.retryAction]}
        </button>
      ) : null}
    </div>
  );
}

function TierCapacityList({ tiers }: { tiers: TierCapacity[] | undefined }) {
  if (!tiers) {
    return (
      <p className="mt-2 text-xs text-[var(--t-muted)]">
        Player capacity by Arcade Leverage tier is unavailable until vault risk
        views load.
      </p>
    );
  }
  return (
    <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      {tiers.map((tier) => (
        <li key={tier.label}>
          <span className="text-[var(--t-muted)]">{tier.label}</span>
          <div>{formatAmount(tier.maxMargin, "tUSD max margin")}</div>
        </li>
      ))}
    </ul>
  );
}

export function LpDesk() {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const vault = useBankrollVaultDeposit(walletAddress);
  const refreshVaultBalances = vault.refresh;
  const refreshVault = useCallback(() => {
    void refreshVaultBalances();
  }, [refreshVaultBalances]);
  const freeze = useLpFreezeActions(refreshVault);
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
  const isFrozen = vault.shareOperationsFrozen === true;
  const blockingRounds = vault.blockingRounds ?? [];

  return (
    <section
      aria-labelledby="lp-desk-heading"
      className="mt-8 border border-[var(--t-muted)] p-5 text-left"
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
      <p className="mt-3 border border-[var(--t-amber)] p-3 text-sm text-[var(--t-text)]">
        Warning: vault-share value can decline as game results are realized.
        Liquidity providers can lose tUSD when players win.
      </p>

      {isFrozen ? (
        <FreezeBanner
          blockingRounds={blockingRounds}
          earliestExpiry={vault.earliestExpiry}
          chainTimestamp={vault.chainTimestamp}
          freeze={freeze}
        />
      ) : null}

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Metric
          label="Wallet Desk Dollars"
          value={formatAmount(vault.tUsdBalance, "tUSD")}
        />
        <Metric
          label="Wallet vault shares"
          value={formatAmount(vault.shareBalance, "vault shares")}
        />
        <Metric
          label="Share price (assets per share)"
          value={formatAmount(vault.assetsPerShare, "tUSD")}
        />
        <Metric
          label="Realized vault gain/loss"
          value={formatSignedAmount(vault.realizedGamePnl)}
        />
        <Metric
          label="Gross assets"
          value={formatAmount(vault.grossAssets, "tUSD")}
        />
        <Metric
          label="Net total assets"
          value={formatAmount(vault.totalAssets, "tUSD")}
        />
        <Metric
          label="Total supply"
          value={formatAmount(vault.totalSupply, "vault shares")}
        />
        <Metric
          label="Pending obligations"
          value={formatAmount(vault.pendingObligations, "tUSD")}
        />
        <Metric
          label="Unrecognized margin"
          value={formatAmount(vault.unrecognizedMargin, "tUSD")}
        />
        <Metric
          label="Reserved liabilities"
          value={formatAmount(vault.reservedLiabilities, "tUSD")}
        />
        <Metric
          label="Safety buffer"
          value={formatAmount(vault.safetyBuffer, "tUSD")}
        />
        <Metric
          label="Global free liquidity"
          value={formatAmount(vault.freeLiquidity, "tUSD")}
        />
        <Metric
          label="Utilization"
          value={formatUtilization(vault.utilizationBps)}
        />
        <Metric
          label="Your immediately withdrawable tUSD"
          value={formatAmount(vault.maxWithdraw, "tUSD")}
        />
      </dl>

      <div className="mt-5 border-t border-[var(--t-muted)] pt-4">
        <h3 className="text-sm font-bold">
          Player capacity by Arcade Leverage tier
        </h3>
        <p className="mt-1 text-xs text-[var(--t-muted)]">
          Advisory remaining max margin for one new ticket from live vault
          capacity. Transaction-time vault checks remain authoritative.
        </p>
        <TierCapacityList tiers={vault.tierCapacity} />
      </div>

      <p className="mt-3 text-xs text-[var(--t-muted)]">
        Gross assets are live vault tUSD. Net total assets price shares after
        pending obligations and unrecognized margin. Share price marks to market
        the moment a round finalizes — before any claim is pulled. Realized
        vault gain/loss is the cumulative verified game result.
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
          className="mt-2 w-full border border-[var(--t-muted)] bg-transparent px-3 py-2 text-[var(--t-text)]"
          disabled={isFrozen}
          id="lp-deposit-amount"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.000000"
          value={amount}
        />
        <p id="lp-deposit-help" className="mt-2 text-xs text-[var(--t-muted)]">
          {isFrozen
            ? "Deposits are blocked while share operations are frozen."
            : "An exact tUSD approval for this deposit may occur first. The LP Desk never requests unlimited approval."}
        </p>
        {validationError ? (
          <p id="lp-deposit-validation" role="alert" className="mt-2 text-sm">
            {validationError}
          </p>
        ) : null}
        <button
          className="mt-4 bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)] disabled:opacity-50"
          disabled={!canSubmit}
          type="submit"
        >
          {vault.status.startsWith("approval-")
            ? "Approval pending…"
            : vault.status.startsWith("deposit-")
              ? "LP deposit pending…"
              : isFrozen
                ? "Deposits frozen"
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
          className="mt-2 w-full border border-[var(--t-muted)] bg-transparent px-3 py-2 text-[var(--t-text)]"
          disabled={isFrozen}
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
          {isFrozen
            ? "Withdrawals are blocked while share operations are frozen."
            : "Withdraw tUSD, not shares, up to your authoritative immediately withdrawable limit. This limit is separate from global free liquidity."}
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
          className="mt-4 bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)] disabled:opacity-50"
          disabled={!canWithdraw}
          type="submit"
        >
          {vault.status === "withdrawal-submitting"
            ? "Withdrawal submitting…"
            : vault.status === "withdrawal-pending"
              ? "Withdrawal pending…"
              : isFrozen
                ? "Withdrawals frozen"
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
          className="mt-3 border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
          onClick={() => void vault.retry()}
          type="button"
        >
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}
