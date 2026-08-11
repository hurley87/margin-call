"use client";

import {
  useCrashTicketRefund,
  type CrashRefundRetryAction,
  type CrashRefundStatus,
} from "@/hooks/use-crash-ticket-refund";
import { isExpiryRefundTicket } from "@/lib/margin-call-crash";
import { CrashLiveTicket } from "./crash-live-ticket";

const statusCopy: Partial<Record<CrashRefundStatus, string>> = {
  loading: "Loading your ticket refund state…",
  "expire-submitting": "Submitting round expiry…",
  "expire-pending": "Expiry pending until its Base Sepolia receipt succeeds…",
  "refund-submitting": "Submitting your margin refund…",
  "refund-pending":
    "Refund pending until its Base Sepolia receipt succeeds. tUSD will not update until confirmation.",
  confirmed: "Refund confirmed on Base Sepolia.",
};

const retryLabels: Record<CrashRefundRetryAction, string> = {
  refresh: "Retry",
  expire: "Retry mark expired",
  refund: "Retry refund",
  "expire-receipt-check": "Retry expiry receipt check",
  "refund-receipt-check": "Retry refund receipt check",
};

/**
 * Return-safe expiry refund surface: recovers a prior-round ticket so a player
 * can expire an unresolved round and pull original margin back.
 */
export function CrashTicketRefund() {
  const refund = useCrashTicketRefund();

  if (!refund.walletAddress) return null;
  if (refund.status === "unavailable") return null;
  if (refund.status === "loading" && !refund.ticket) {
    return null;
  }
  if (!refund.ticket) return null;

  if (!isExpiryRefundTicket(refund.phase, refund.outcome)) return null;

  const statusMessage =
    refund.status === "error"
      ? refund.error
      : (statusCopy[refund.status] ?? null);
  const isAlert = refund.status === "error";

  return (
    <section aria-labelledby="ticket-refund-heading" className="mt-8 text-left">
      <h2
        id="ticket-refund-heading"
        className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]"
      >
        Expiry refund
      </h2>
      <div className="mt-4">
        <CrashLiveTicket
          canExpire={refund.canExpire}
          canRefund={refund.canRefund}
          canRetry={refund.canRetry}
          isAlert={isAlert}
          onExpire={() => void refund.expireRound()}
          onRefund={() => void refund.refund()}
          onRetry={() => void refund.retry()}
          outcome={refund.outcome}
          payout={refund.payout}
          retryLabel={
            refund.retryAction ? retryLabels[refund.retryAction] : "Retry"
          }
          statusMessage={statusMessage}
          ticket={refund.ticket}
        />
      </div>
    </section>
  );
}
