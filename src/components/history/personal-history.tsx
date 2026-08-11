"use client";

import { useCallback } from "react";
import { useHistoryTicketActions } from "@/hooks/use-history-ticket-actions";
import { usePersonalHistory } from "@/hooks/use-personal-history";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import {
  formatLeverageBps,
  type PlayerTicketHistoryItem,
  type TicketOutcome,
} from "@/lib/margin-call-crash";

const outcomeCopy: Record<TicketOutcome, string> = {
  pending: "Awaiting verified Crash Point",
  won: "Won — claim your payout",
  lost: "Lost — settle the ticket",
  "settled-win": "Payout claimed",
  "settled-loss": "Loss settled",
  refundable: "Round expired — refund your margin",
  refunded: "Margin refunded",
};

const statusCopy: Record<string, string> = {
  "reveal-submitting": "Submitting reveal request…",
  "reveal-pending": "Reveal pending until its Base Sepolia receipt succeeds…",
  attesting: "Fetching the covalidator attestation…",
  "finalize-submitting": "Submitting finalization…",
  "finalize-pending":
    "Finalization pending until its Base Sepolia receipt succeeds…",
  "claim-submitting": "Submitting your claim…",
  "claim-pending":
    "Claim pending until its Base Sepolia receipt succeeds. Settlement will not update until confirmation.",
  "settle-submitting": "Submitting loss settlement…",
  "settle-pending":
    "Loss settlement pending until its Base Sepolia receipt succeeds…",
  "expire-submitting": "Submitting expiry…",
  "expire-pending": "Expiry pending until its Base Sepolia receipt succeeds…",
  "refund-submitting": "Submitting your refund…",
  "refund-pending":
    "Refund pending until its Base Sepolia receipt succeeds. Settlement will not update until confirmation.",
  confirmed: "Confirmed on Base Sepolia.",
};

/**
 * Wallet-scoped ticket history with receipt-backed claim/refund actions.
 */
export function PersonalHistory() {
  const history = usePersonalHistory();
  const refresh = history.retry;
  const onSettled = useCallback(() => {
    void refresh();
  }, [refresh]);
  const actions = useHistoryTicketActions(onSettled);

  if (!history.walletAddress) return null;

  if (history.status === "unavailable" || history.status === "error") {
    return (
      <section
        aria-labelledby="personal-history-error"
        className="mt-8 text-left"
      >
        <p
          id="personal-history-error"
          className="text-sm text-[var(--t-red-hot)]"
          role="alert"
        >
          {history.error}
        </p>
        <button
          className="mt-4 rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
          onClick={() => void history.retry()}
          type="button"
        >
          Retry
        </button>
      </section>
    );
  }

  if (history.status !== "ready") {
    return (
      <section className="mt-8 text-left">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Loading your ticket history…
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="personal-history-heading"
      className="mt-8 text-left"
    >
      <h2
        id="personal-history-heading"
        className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]"
      >
        Personal history
      </h2>
      <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--t-muted)]">
        Every ticket in the lookback window. Claim and refund actions wait for
        Base Sepolia receipts — a transaction hash alone never changes
        settlement state.
      </p>

      {history.tickets.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--t-muted)]">
          No tickets found for this wallet in the recent lookback.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {history.tickets.map((item) => (
            <PersonalHistoryRow
              actions={actions}
              item={item}
              key={item.ticket.id.toString()}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonalHistoryRow({
  item,
  actions,
}: {
  item: PlayerTicketHistoryItem;
  actions: ReturnType<typeof useHistoryTicketActions>;
}) {
  const isActive = actions.activeTicketId === item.ticket.id;
  const statusMessage = isActive
    ? actions.status === "error"
      ? actions.error
      : (statusCopy[actions.status] ?? null)
    : null;
  const canActOnRow =
    !actions.busy || actions.activeTicketId === item.ticket.id;
  const amount =
    item.outcome === "refundable" || item.outcome === "refunded"
      ? item.ticket.margin
      : (item.payout ?? item.ticket.reservedPayout);

  return (
    <li className="border border-[var(--t-border)] bg-[var(--t-panel)] p-4">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--t-muted)]">Ticket</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {item.ticket.id.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Round</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {item.ticket.roundId.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Margin</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatDeskDollars(item.ticket.margin, TUSD_DECIMALS)} tUSD
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Arcade Leverage</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatLeverageBps(item.ticket.leverageBps)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Crash Point</dt>
          <dd
            className={
              item.displayCrashPoint
                ? "tabular-nums text-[var(--t-green-hot)]"
                : "text-[var(--t-muted)]"
            }
          >
            {item.displayCrashPoint ?? "Not finalized"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">
            {item.outcome === "refundable" || item.outcome === "refunded"
              ? "Refund"
              : item.outcome === "won" || item.outcome === "settled-win"
                ? "Payout"
                : "Reserved payout"}
          </dt>
          <dd className="tabular-nums text-[var(--t-green-hot)]">
            {formatDeskDollars(amount, TUSD_DECIMALS)} tUSD
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[var(--t-muted)]">State</dt>
          <dd className="text-[var(--t-text)]">{outcomeCopy[item.outcome]}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {item.canVerify && canActOnRow ? (
          <button
            className="rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
            disabled={actions.busy && isActive}
            onClick={() =>
              void actions.verifyAndSettle(item.ticket, item.round)
            }
            type="button"
          >
            Verify and settle
          </button>
        ) : null}
        {item.canClaim && canActOnRow ? (
          <button
            className="rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
            disabled={actions.busy && isActive}
            onClick={() => void actions.claim(item.ticket)}
            type="button"
          >
            Claim payout
          </button>
        ) : null}
        {item.canSettle && canActOnRow ? (
          <button
            className="rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
            disabled={actions.busy && isActive}
            onClick={() => void actions.settleLoss(item.ticket)}
            type="button"
          >
            Settle loss
          </button>
        ) : null}
        {item.canExpire && canActOnRow ? (
          <button
            className="rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
            disabled={actions.busy && isActive}
            onClick={() => void actions.expireRound(item.ticket, item.round)}
            type="button"
          >
            Mark round expired
          </button>
        ) : null}
        {item.canRefund && canActOnRow ? (
          <button
            className="rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
            disabled={actions.busy && isActive}
            onClick={() => void actions.refund(item.ticket, item.round)}
            type="button"
          >
            Refund margin
          </button>
        ) : null}
        {isActive && actions.status === "error" ? (
          <button
            className="rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
            onClick={() => void actions.retry()}
            type="button"
          >
            Retry
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p
          aria-live={actions.status === "error" ? undefined : "polite"}
          className="mt-4 text-xs leading-5 text-[var(--t-muted)]"
          role={actions.status === "error" ? "alert" : undefined}
        >
          {statusMessage}
        </p>
      ) : null}
    </li>
  );
}
