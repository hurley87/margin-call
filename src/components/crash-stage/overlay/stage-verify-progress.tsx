"use client";

import type {
  CrashSettlementRetryAction,
  CrashSettlementStatus,
  useCrashTicketSettlement,
} from "@/hooks/use-crash-ticket-settlement";
import { formatLeverageBps } from "@/lib/margin-call-crash";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import {
  settlementRetryLabels,
  settlementStatusCopy,
} from "@/lib/settlement-status-copy";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

export type StageVerifyProgressProps = {
  settlement: Settlement;
  /** Escape hatch after an error: dismiss the ceremony back to the Floor. */
  onCancel: () => void;
};

type StepId = "reveal" | "attest" | "finalize" | "settle";

const STEPS: { id: StepId; title: string; detail: string }[] = [
  {
    id: "reveal",
    title: "Reveal",
    detail: "Request the round's encrypted crash entropy onchain.",
  },
  {
    id: "attest",
    title: "Attest",
    detail: "Inco covalidators decrypt and co-sign the Crash Point.",
  },
  {
    id: "finalize",
    title: "Finalize",
    detail: "Publish the attested Crash Point to Base Sepolia.",
  },
  {
    id: "settle",
    title: "Settle",
    detail: "Claim the win or book the margin call.",
  },
];

/**
 * Full-stage verification stepper for the ceremony's `verifying` phase — the
 * suspense window between clicking Verify and settle and the Crash Point
 * reveal. Replaces the frozen LOCKED numeral + one grey status line.
 */
export function StageVerifyProgress({
  settlement,
  onCancel,
}: StageVerifyProgressProps) {
  const ticket = settlement.ticket;
  const isError = settlement.status === "error";
  const active = isError
    ? errorStep(settlement.retryAction, settlement)
    : activeStep(settlement.status);
  const activeIndex =
    active === null ? STEPS.length : STEPS.findIndex((s) => s.id === active);
  const statusLine = isError
    ? settlement.error
    : (settlementStatusCopy[settlement.status] ?? null);
  const retryLabel = settlement.retryAction
    ? settlementRetryLabels[settlement.retryAction]
    : "Retry";

  return (
    <div
      className="pointer-events-auto mx-auto w-full max-w-xl rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 p-4 backdrop-blur-md sm:p-5"
      data-testid="stage-verify-progress"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Verifying the Crash Point
      </p>
      {ticket ? (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
          {formatDeskDollarsAmount(ticket.margin)} ·{" "}
          {formatLeverageBps(ticket.leverageBps)} · Round{" "}
          {ticket.roundId.toString()}
        </p>
      ) : null}

      <ol className="mt-4 space-y-2">
        {STEPS.map((step, index) => {
          const done = index < activeIndex;
          const isActive = index === activeIndex;
          const failed = isError && isActive;
          return (
            <li
              className={`flex items-start gap-3 border px-3 py-2 ${
                failed
                  ? "border-[var(--t-red)]/50"
                  : isActive
                    ? "border-[var(--t-accent)]/60"
                    : done
                      ? "border-[var(--t-green)]/40"
                      : "border-[var(--t-divider)]"
              }`}
              data-testid={`verify-step-${step.id}`}
              data-state={
                failed
                  ? "failed"
                  : isActive
                    ? "active"
                    : done
                      ? "done"
                      : "upcoming"
              }
              key={step.id}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] font-bold tabular-nums ${
                  failed
                    ? "border-[var(--t-red)] text-[var(--t-red-hot)]"
                    : done
                      ? "border-[var(--t-green)] text-[var(--t-green-hot)]"
                      : isActive
                        ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                        : "border-[var(--t-divider)] text-[var(--t-muted)]"
                }`}
              >
                {done ? "✓" : failed ? "✕" : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-xs font-bold uppercase tracking-[0.14em] ${
                    failed
                      ? "text-[var(--t-red-hot)]"
                      : isActive
                        ? "mc-shimmer text-[var(--t-accent)]"
                        : done
                          ? "text-[var(--t-green-hot)]"
                          : "text-[var(--t-muted)]"
                  }`}
                >
                  {step.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--t-muted)]">
                  {step.detail}
                </span>
                <StepTransactions settlement={settlement} step={step.id} />
              </span>
            </li>
          );
        })}
      </ol>

      {statusLine ? (
        <p
          className={`mt-3 text-sm ${
            isError ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
          }`}
          role={isError ? "alert" : "status"}
        >
          {statusLine}
        </p>
      ) : null}

      {isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {settlement.canRetry ? (
            <button
              className={TERMINAL_ACTION_BUTTON_CLASS}
              onClick={() => void settlement.retry()}
              type="button"
            >
              {retryLabel}
            </button>
          ) : null}
          <button
            className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--t-muted)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]"
            onClick={onCancel}
            type="button"
          >
            Back to the Floor
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StepTransactions({
  settlement,
  step,
}: {
  settlement: Settlement;
  step: StepId;
}) {
  const transactions = settlement.transactions.filter((t) =>
    step === "settle"
      ? t.stage === "claim" || t.stage === "settle"
      : t.stage === step
  );
  if (transactions.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-2">
      {transactions.map((t) => (
        <a
          className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-2 hover:text-[var(--t-text)]"
          href={t.url}
          key={t.hash}
          rel="noreferrer"
          target="_blank"
        >
          {t.confirmed ? "tx confirmed" : "tx pending"} · {shortHash(t.hash)}
        </a>
      ))}
    </span>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

function activeStep(status: CrashSettlementStatus): StepId | null {
  if (status === "reveal-submitting" || status === "reveal-pending") {
    return "reveal";
  }
  if (status === "attesting") return "attest";
  if (status === "finalize-submitting" || status === "finalize-pending") {
    return "finalize";
  }
  if (
    status === "claim-submitting" ||
    status === "claim-pending" ||
    status === "settle-submitting" ||
    status === "settle-pending"
  ) {
    return "settle";
  }
  if (status === "confirmed") return null;
  return "reveal";
}

/** Which step an error belongs to, from the retry action + recorded txs. */
function errorStep(
  retryAction: CrashSettlementRetryAction | null,
  settlement: Settlement
): StepId {
  switch (retryAction) {
    case "reveal-receipt-check":
      return "reveal";
    case "finalize-receipt-check":
      return "finalize";
    case "claim":
    case "settle":
    case "claim-receipt-check":
    case "settle-receipt-check":
      return "settle";
    default:
      // A generic verify retry after a confirmed reveal means the attestation
      // (or a later stage) failed — point at attest, not the finished reveal.
      return settlement.transactions.some(
        (t) => t.stage === "reveal" && t.confirmed
      )
        ? "attest"
        : "reveal";
  }
}
