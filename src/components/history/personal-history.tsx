"use client";

import {
  useHistoryTicketActions,
  type HistoryTicketActionStatus,
} from "@/hooks/use-history-ticket-actions";
import { usePersonalHistory } from "@/hooks/use-personal-history";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import {
  formatLeverageBps,
  type PlayerTicketHistoryItem,
} from "@/lib/margin-call-crash";
import { ticketOutcomeCopy } from "../current-round/crash-live-ticket";

const statusCopy: Record<
  Exclude<HistoryTicketActionStatus, "idle" | "error">,
  string
> = {
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

const amountLabels: Record<PlayerTicketHistoryItem["amountKind"], string> = {
  refund: "Refund",
  payout: "Payout",
  reserved: "Reserved payout",
};

/**
 * Wallet-scoped ticket list with receipt-backed claim/refund actions.
 * Page chrome (title / lede) lives on /record.
 */
export function PersonalHistory() {
  const history = usePersonalHistory();
  const actions = useHistoryTicketActions(history.retry);

  if (!history.walletAddress) return null;

  if (history.status === "unavailable" || history.status === "error") {
    return (
      <div className="text-left">
        <p className="text-sm text-[var(--t-red-hot)]" role="alert">
          {history.error}
        </p>
        <button
          className="mt-4 rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
          onClick={() => void history.retry()}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (history.status !== "ready") {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Loading your ticket history…
      </p>
    );
  }

  if (history.tickets.length === 0) {
    return (
      <p className="text-sm text-[var(--t-muted)]">
        No tickets found for this wallet in the recent lookback.
      </p>
    );
  }

  return (
    <ul className="space-y-4 text-left">
      {history.tickets.map((item) => (
        <PersonalHistoryRow
          actions={actions}
          item={item}
          key={item.ticket.id.toString()}
        />
      ))}
    </ul>
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
  const statusMessage = !isActive
    ? null
    : actions.status === "error"
      ? actions.error
      : actions.status === "idle"
        ? null
        : statusCopy[actions.status];
  const canActOnRow = !actions.busy || isActive;
  const rowActions = [
    {
      show: item.canVerify,
      label: "Verify and settle",
      accent: true,
      run: () => actions.verifyAndSettle(item.ticket, item.round),
    },
    {
      show: item.canClaim,
      label: "Claim payout",
      accent: true,
      run: () => actions.claim(item.ticket),
    },
    {
      show: item.canSettle,
      label: "Settle loss",
      accent: false,
      run: () => actions.settleLoss(item.ticket),
    },
    {
      show: item.canExpire,
      label: "Mark round expired",
      accent: false,
      run: () => actions.expireRound(item.ticket, item.round),
    },
    {
      show: item.canRefund,
      label: "Refund margin",
      accent: true,
      run: () => actions.refund(item.ticket),
    },
  ];

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
            {formatDeskDollarsAmount(item.ticket.margin)}
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
            {amountLabels[item.amountKind]}
          </dt>
          <dd className="tabular-nums text-[var(--t-green-hot)]">
            {formatDeskDollarsAmount(item.displayAmount)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[var(--t-muted)]">State</dt>
          <dd className="text-[var(--t-text)]">
            {ticketOutcomeCopy[item.outcome]}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {rowActions
          .filter((action) => action.show && canActOnRow)
          .map((action) => (
            <button
              className={
                action.accent
                  ? "rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)]"
                  : "rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
              }
              disabled={actions.busy}
              key={action.label}
              onClick={() => void action.run()}
              type="button"
            >
              {action.label}
            </button>
          ))}
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
