"use client";

import {
  useCrashRoundEntry,
  type CrashEntryRetryAction,
  type CrashEntryStatus,
} from "@/hooks/use-crash-round-entry";
import {
  BOUNDED_ENTRY_ALLOWANCE_TUSD,
  canOfferEntry,
  ENTRY_LEVERAGE_TIERS_BPS,
  ENTRY_MARGINS_TUSD,
  formatLeverageBps,
  type CrashRoundPhase,
} from "@/lib/margin-call-crash";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import { CrashLiveTicket } from "./crash-live-ticket";

const statusCopy: Partial<Record<CrashEntryStatus, string>> = {
  loading: "Loading your entry state…",
  "approval-submitting": "Submitting a one-time 1,000 tUSD approval…",
  "approval-pending":
    "Bounded approval pending until its Base Sepolia receipt succeeds…",
  "entry-submitting": "Submitting your sponsored entry…",
  "entry-pending":
    "Entry pending until its Base Sepolia receipt succeeds. Your ticket will not appear until confirmation.",
  confirmed: "Entry confirmed on Base Sepolia.",
};

const retryLabels: Record<CrashEntryRetryAction, string> = {
  refresh: "Retry",
  approval: "Retry approval",
  entry: "Retry entry",
  "approval-receipt-check": "Retry approval receipt check",
  "entry-receipt-check": "Retry entry receipt check",
};

type CrashRoundEntryProps = {
  roundId: bigint;
  phase: CrashRoundPhase;
  countdownSeconds: number;
};

function formatTUsd(value: bigint) {
  return formatDeskDollars(value, TUSD_DECIMALS);
}

/**
 * Player entry surface for the current Crash round.
 * Offers 1/5/10 tUSD margins and six leverage tiers only into initialized
 * open rounds with more than five seconds remaining before lock.
 */
export function CrashRoundEntry({
  roundId,
  phase,
  countdownSeconds,
}: CrashRoundEntryProps) {
  const entry = useCrashRoundEntry({ roundId });

  if (phase === "uninitialized" || phase === "prelaunch") {
    return (
      <EntryShell>
        <p className="text-sm text-[var(--t-muted)]">
          Waiting for an ETH-holding opener to initialize this epoch. Embedded
          wallets never create rounds, so entry stays closed until a handle is
          pre-committed onchain.
        </p>
      </EntryShell>
    );
  }

  if (entry.ticket) {
    return (
      <EntryShell>
        <CrashLiveTicket ticket={entry.ticket} />
      </EntryShell>
    );
  }

  if (phase !== "open") {
    return null;
  }

  if (!canOfferEntry(phase, countdownSeconds)) {
    return (
      <EntryShell>
        <p className="text-sm text-[var(--t-amber-hot)]" role="status">
          Entry cutoff — less than five seconds remain before onchain lock. New
          entries are no longer offered.
        </p>
      </EntryShell>
    );
  }

  if (!entry.walletAddress) {
    return (
      <EntryShell>
        <p className="text-sm text-[var(--t-muted)]">
          Sign in with phone to enter this round with a sponsored transaction.
        </p>
      </EntryShell>
    );
  }

  if (entry.status === "unavailable") {
    return (
      <EntryShell>
        <p className="text-sm text-[var(--t-red)]" role="alert">
          {entry.error}
        </p>
      </EntryShell>
    );
  }

  const isAlert = entry.status === "error";
  const statusMessage = isAlert
    ? entry.error
    : (statusCopy[entry.status] ?? null);
  const retryLabel = entry.retryAction
    ? retryLabels[entry.retryAction]
    : "Retry";

  return (
    <EntryShell>
      <p className="text-sm text-[var(--t-text)]">
        Choose margin and Arcade Leverage. Expected payout is the maximum
        reservation, not a guaranteed return.
      </p>

      <OptionGroup
        legend="Margin"
        options={ENTRY_MARGINS_TUSD}
        selected={entry.selectedMargin}
        format={(margin) => `${formatTUsd(margin)} tUSD`}
        onSelect={entry.selectMargin}
      />

      <OptionGroup
        legend="Arcade Leverage"
        options={ENTRY_LEVERAGE_TIERS_BPS}
        selected={entry.selectedLeverageBps}
        format={formatLeverageBps}
        onSelect={entry.selectLeverage}
      />

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--t-muted)]">Wallet Desk Dollars</dt>
          <dd className="tabular-nums">
            {entry.tUsdBalance === undefined
              ? "—"
              : formatTUsd(entry.tUsdBalance)}{" "}
            tUSD
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Expected maximum payout</dt>
          <dd className="tabular-nums text-[var(--t-green-hot)]">
            {formatTUsd(entry.expectedPayout)} tUSD
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Current vault allowance</dt>
          <dd className="tabular-nums">
            {entry.allowance === undefined ? "—" : formatTUsd(entry.allowance)}{" "}
            tUSD
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Selected margin</dt>
          <dd className="tabular-nums">
            {formatTUsd(entry.selectedMargin)} tUSD
          </dd>
        </div>
      </dl>

      <div className="mt-5 border border-[var(--t-border)] p-3 text-xs leading-5 text-[var(--t-muted)]">
        <p>
          Spender: Bankroll Vault
          {entry.vaultAddress ? (
            <>
              {" "}
              <code className="break-all text-[var(--t-accent)]">
                {entry.vaultAddress}
              </code>
            </>
          ) : null}
        </p>
        <p className="mt-2">
          One-time bounded approval: {formatTUsd(BOUNDED_ENTRY_ALLOWANCE_TUSD)}{" "}
          tUSD. Later entries reuse this allowance with sponsored enter-only
          transactions. This interface never requests an unlimited allowance.
        </p>
        <p className="mt-2">
          Game contract
          {entry.gameAddress ? (
            <>
              :{" "}
              <code className="break-all text-[var(--t-accent)]">
                {entry.gameAddress}
              </code>
            </>
          ) : null}
          . Margin moves directly from your wallet to the vault.
        </p>
        {entry.needsApproval ? (
          <p className="mt-2 text-[var(--t-amber-hot)]">
            Your first entry will submit the bounded approval, wait for its
            receipt, then submit enter.
          </p>
        ) : (
          <p className="mt-2 text-[var(--t-green)]">
            Allowance already covers this margin. Only a sponsored enter will be
            submitted.
          </p>
        )}
      </div>

      {statusMessage ? (
        <p
          className={`mt-4 text-sm ${
            isAlert ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
          }`}
          role={isAlert ? "alert" : "status"}
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="border border-[var(--t-accent)] bg-[var(--t-accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!entry.canEnter}
          onClick={() => void entry.enter()}
          type="button"
        >
          {entry.needsApproval ? "Approve & enter" : "Enter round"}
        </button>
        {entry.canRetry ? (
          <button
            className={TERMINAL_ACTION_BUTTON_CLASS}
            onClick={() => void entry.retry()}
            type="button"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </EntryShell>
  );
}

function OptionGroup({
  legend,
  options,
  selected,
  format,
  onSelect,
}: {
  legend: string;
  options: readonly bigint[];
  selected: bigint;
  format: (option: bigint) => string;
  onSelect: (option: bigint) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {legend}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              aria-pressed={isSelected}
              className={`border px-3 py-2 text-sm font-bold tabular-nums ${
                isSelected
                  ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                  : "border-[var(--t-border)] text-[var(--t-text)] hover:border-[var(--t-accent)]"
              }`}
              key={option.toString()}
              onClick={() => onSelect(option)}
              type="button"
            >
              {format(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function EntryShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-labelledby="crash-entry-heading"
      className="mt-8 border-t border-[var(--t-divider)] pt-6 text-left"
    >
      <h3
        id="crash-entry-heading"
        className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]"
      >
        Enter this round
      </h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}
