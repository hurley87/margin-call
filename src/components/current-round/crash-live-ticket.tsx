"use client";

import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import {
  formatLeverageBps,
  type CrashTicket,
  type TicketOutcome,
} from "@/lib/margin-call-crash";

type CrashLiveTicketProps = {
  ticket: CrashTicket;
  outcome?: TicketOutcome | null;
  payout?: bigint | null;
  displayCrashPoint?: string | null;
  canVerify?: boolean;
  canClaim?: boolean;
  canSettle?: boolean;
  canExpire?: boolean;
  canRefund?: boolean;
  statusMessage?: string | null;
  isAlert?: boolean;
  canRetry?: boolean;
  retryLabel?: string;
  onVerify?: () => void;
  onClaim?: () => void;
  onSettle?: () => void;
  onExpire?: () => void;
  onRefund?: () => void;
  onRetry?: () => void;
};

const outcomeCopy: Record<TicketOutcome, string> = {
  pending: "Awaiting verified Crash Point",
  won: "Won — claim your payout",
  lost: "Lost — settle the ticket",
  "settled-win": "Payout claimed",
  "settled-loss": "Loss settled",
  refundable: "Round expired — refund your margin",
  refunded: "Margin refunded",
};

const amountLabelCopy: Record<TicketOutcome, string> = {
  pending: "Reserved maximum payout",
  won: "Payout",
  lost: "Reserved maximum payout",
  "settled-win": "Payout",
  "settled-loss": "Reserved maximum payout",
  refundable: "Refundable margin",
  refunded: "Refundable margin",
};

/** Confirmed onchain ticket with optional settlement actions for the signed-in player. */
export function CrashLiveTicket({
  ticket,
  outcome = null,
  payout = null,
  displayCrashPoint = null,
  canVerify = false,
  canClaim = false,
  canSettle = false,
  canExpire = false,
  canRefund = false,
  statusMessage = null,
  isAlert = false,
  canRetry = false,
  retryLabel = "Retry",
  onVerify,
  onClaim,
  onSettle,
  onExpire,
  onRefund,
  onRetry,
}: CrashLiveTicketProps) {
  return (
    <div
      aria-labelledby="live-ticket-heading"
      className="border border-[var(--t-green)]/40 bg-[var(--t-panel)] p-4"
    >
      <p
        id="live-ticket-heading"
        className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-green)]"
      >
        Your live ticket
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--t-muted)]">Ticket ID</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {ticket.id.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Round</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {ticket.roundId.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Margin</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatDeskDollars(ticket.margin, TUSD_DECIMALS)} tUSD
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Arcade Leverage</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatLeverageBps(ticket.leverageBps)}
          </dd>
        </div>
        {displayCrashPoint ? (
          <div>
            <dt className="text-[var(--t-muted)]">Verified Crash Point</dt>
            <dd className="tabular-nums text-[var(--t-green-hot)]">
              {displayCrashPoint}
            </dd>
          </div>
        ) : null}
        <div className={displayCrashPoint ? undefined : "sm:col-span-2"}>
          <dt className="text-[var(--t-muted)]">
            {outcome ? amountLabelCopy[outcome] : "Reserved maximum payout"}
          </dt>
          <dd className="tabular-nums text-[var(--t-green-hot)]">
            {formatDeskDollars(payout ?? ticket.reservedPayout, TUSD_DECIMALS)}{" "}
            tUSD
          </dd>
        </div>
        {outcome ? (
          <div className="sm:col-span-2">
            <dt className="text-[var(--t-muted)]">Outcome</dt>
            <dd className="text-[var(--t-text)]">{outcomeCopy[outcome]}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {canVerify ? (
          <button
            className="rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
            onClick={onVerify}
            type="button"
          >
            Verify and settle
          </button>
        ) : null}
        {canClaim ? (
          <button
            className="rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
            onClick={onClaim}
            type="button"
          >
            Claim payout
          </button>
        ) : null}
        {canSettle ? (
          <button
            className="rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
            onClick={onSettle}
            type="button"
          >
            Settle loss
          </button>
        ) : null}
        {canExpire ? (
          <button
            className="rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
            onClick={onExpire}
            type="button"
          >
            Mark round expired
          </button>
        ) : null}
        {canRefund ? (
          <button
            className="rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
            onClick={onRefund}
            type="button"
          >
            Refund margin
          </button>
        ) : null}
        {canRetry ? (
          <button
            className="rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
            onClick={onRetry}
            type="button"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p
          aria-live={isAlert ? undefined : "polite"}
          className="mt-4 text-xs leading-5 text-[var(--t-muted)]"
          role={isAlert ? "alert" : undefined}
        >
          {statusMessage}
        </p>
      ) : (
        <p className="mt-4 text-xs leading-5 text-[var(--t-muted)]">
          One ticket per wallet per round. You can leave and return later —
          settlement never depends on watching the animation.
        </p>
      )}
    </div>
  );
}
