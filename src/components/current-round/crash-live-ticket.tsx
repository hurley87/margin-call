"use client";

import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";
import { formatLeverageBps, type CrashTicket } from "@/lib/margin-call-crash";

type CrashLiveTicketProps = {
  ticket: CrashTicket;
};

/** Confirmed onchain ticket for the signed-in player in the current round. */
export function CrashLiveTicket({ ticket }: CrashLiveTicketProps) {
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
        <div className="sm:col-span-2">
          <dt className="text-[var(--t-muted)]">Reserved maximum payout</dt>
          <dd className="tabular-nums text-[var(--t-green-hot)]">
            {formatDeskDollars(ticket.reservedPayout, TUSD_DECIMALS)} tUSD
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-[var(--t-muted)]">
        One ticket per wallet per round. Settlement and claims land in later
        slices after the verified Crash Point is attested.
      </p>
    </div>
  );
}
