"use client";

import { useEffect, useRef } from "react";
import { MarginCallVoiceTrigger } from "@/components/desk-phone/margin-call-voice-trigger";
import {
  useCrashTicketSettlement,
  type CrashSettlementRetryAction,
  type CrashSettlementStatus,
} from "@/hooks/use-crash-ticket-settlement";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { isExpiryRefundTicket } from "@/lib/margin-call-crash";
import { getTheaterAudio } from "@/lib/theater-audio";
import { CrashLiveTicket } from "./crash-live-ticket";

const statusCopy: Partial<Record<CrashSettlementStatus, string>> = {
  loading: "Loading your ticket settlement state…",
  "reveal-submitting": "Submitting reveal request…",
  "reveal-pending": "Reveal pending until its Base Sepolia receipt succeeds…",
  attesting: "Fetching the covalidator attestation for your round…",
  "finalize-submitting": "Submitting finalization…",
  "finalize-pending":
    "Finalization pending until its Base Sepolia receipt succeeds…",
  "claim-submitting": "Submitting your claim…",
  "claim-pending":
    "Claim pending until its Base Sepolia receipt succeeds. tUSD will not update until confirmation.",
  "settle-submitting": "Submitting loss settlement…",
  "settle-pending":
    "Loss settlement pending until its Base Sepolia receipt succeeds…",
  confirmed: "Settlement confirmed on Base Sepolia.",
};

const retryLabels: Record<CrashSettlementRetryAction, string> = {
  refresh: "Retry",
  verify: "Retry verify and settle",
  claim: "Retry claim",
  settle: "Retry settle loss",
  "reveal-receipt-check": "Retry reveal receipt check",
  "finalize-receipt-check": "Retry finalization receipt check",
  "claim-receipt-check": "Retry claim receipt check",
  "settle-receipt-check": "Retry settle receipt check",
};

/**
 * Return-safe settlement surface: recovers a prior-round ticket so a judge can
 * verify and claim without watching the current-round animation.
 */
export function CrashTicketSettlement() {
  const settlement = useCrashTicketSettlement();
  const reducedMotion = useReducedMotion();

  // Payout landed → ring the register once (balance flash follows via the
  // wallet-balance sync).
  const previousStatus = useRef(settlement.status);
  useEffect(() => {
    if (
      !reducedMotion &&
      settlement.status === "confirmed" &&
      previousStatus.current !== "confirmed" &&
      settlement.outcome === "settled-win"
    ) {
      getTheaterAudio().playWinRegister();
    }
    previousStatus.current = settlement.status;
  }, [reducedMotion, settlement.outcome, settlement.status]);

  if (!settlement.walletAddress) return null;
  if (settlement.status === "unavailable") return null;
  if (settlement.status === "loading" && !settlement.ticket) {
    return (
      <section className="mt-8 text-left">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Checking for an open ticket…
        </p>
      </section>
    );
  }
  if (!settlement.ticket) return null;

  if (isExpiryRefundTicket(settlement.phase, settlement.outcome)) return null;

  const statusMessage =
    settlement.status === "error"
      ? settlement.error
      : (statusCopy[settlement.status] ?? null);
  const isAlert = settlement.status === "error";
  // Desk-phone voice owns this surface only — not theater replay.
  const isLiquidatedLoss =
    settlement.outcome === "lost" || settlement.outcome === "settled-loss";

  return (
    <section
      aria-labelledby="ticket-settlement-heading"
      className="mt-8 text-left"
    >
      <h2
        id="ticket-settlement-heading"
        className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]"
      >
        Ticket settlement
      </h2>
      <div className="mt-4">
        {isLiquidatedLoss ? (
          <MarginCallVoiceTrigger
            roundId={settlement.ticket.roundId}
            ticketId={settlement.ticket.id}
          />
        ) : null}
        <CrashLiveTicket
          canClaim={settlement.canClaim}
          canRetry={settlement.canRetry}
          canSettle={settlement.canSettle}
          canVerify={settlement.canVerify}
          displayCrashPoint={settlement.displayCrashPoint}
          isAlert={isAlert}
          onClaim={() => void settlement.claim()}
          onRetry={() => void settlement.retry()}
          onSettle={() => void settlement.settleLoss()}
          onVerify={() => void settlement.verifyAndSettle()}
          outcome={settlement.outcome}
          payout={settlement.payout}
          retryLabel={
            settlement.retryAction
              ? retryLabels[settlement.retryAction]
              : "Retry"
          }
          statusMessage={statusMessage}
          ticket={settlement.ticket}
        />
      </div>
    </section>
  );
}
