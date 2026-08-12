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

export const ticketOutcomeCopy: Record<TicketOutcome, string> = {
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

// Decorative desk stamp per settled outcome; the Outcome row carries the fact.
const outcomeStamps: Partial<
  Record<TicketOutcome, { label: string; className: string }>
> = {
  won: {
    label: "WON",
    className: "border-[var(--t-green-hot)] text-[var(--t-green-hot)]",
  },
  "settled-win": {
    label: "PAID",
    className: "border-[var(--t-green-hot)] text-[var(--t-green-hot)]",
  },
  lost: {
    label: "MARGIN CALLED",
    className: "border-[var(--t-red-hot)] text-[var(--t-red-hot)]",
  },
  "settled-loss": {
    label: "MARGIN CALLED",
    className: "border-[var(--t-red-hot)] text-[var(--t-red-hot)]",
  },
  refunded: {
    label: "REFUNDED",
    className: "border-[var(--t-muted)] text-[var(--t-muted)]",
  },
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
  const stamp = outcome ? outcomeStamps[outcome] : undefined;

  return (
    <div
      aria-labelledby="live-ticket-heading"
      className={`relative border border-[var(--t-green)]/40 bg-[var(--t-panel)] p-4 ${
        outcome === "lost" ? "mc-shake" : ""
      }`}
    >
      {stamp ? (
        <span
          aria-hidden="true"
          className={`mc-stamp-in pointer-events-none absolute right-3 top-3 border-2 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.2em] ${stamp.className}`}
          data-testid="ticket-outcome-stamp"
        >
          {stamp.label}
        </span>
      ) : null}
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
            <dd className="text-[var(--t-text)]">
              {ticketOutcomeCopy[outcome]}
            </dd>
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
