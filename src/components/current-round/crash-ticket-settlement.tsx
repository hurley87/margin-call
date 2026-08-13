"use client";

import { useEffect, useRef } from "react";
import { MarginCallVoiceTrigger } from "@/components/desk-phone/margin-call-voice-trigger";
import { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { isExpiryRefundTicket } from "@/lib/margin-call-crash";
import { getTheaterAudio } from "@/lib/theater-audio";
import {
  settlementRetryLabels,
  settlementStatusCopy,
} from "@/lib/settlement-status-copy";
import { CrashLiveTicket } from "./crash-live-ticket";

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
      : (settlementStatusCopy[settlement.status] ?? null);
  const isAlert = settlement.status === "error";
  const busy =
    settlement.status === "attesting" ||
    settlement.status.endsWith("-submitting") ||
    settlement.status.endsWith("-pending");
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
            walletAddress={settlement.walletAddress}
          />
        ) : null}
        <CrashLiveTicket
          busy={busy}
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
              ? settlementRetryLabels[settlement.retryAction]
              : "Retry"
          }
          statusMessage={statusMessage}
          ticket={settlement.ticket}
        />
      </div>
    </section>
  );
}
