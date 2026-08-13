"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { CrashRoundEntry } from "@/components/current-round/crash-round-entry";
import { CrashTicketRefund } from "@/components/current-round/crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { canOfferEntry, type CrashRoundPhase } from "@/lib/margin-call-crash";
import {
  deriveStageCtaKind,
  type CrashStageMode,
  type StageCtaKind,
} from "../use-crash-stage-mode";
import { StageSettleDock } from "./stage-settle-dock";

export type StageActionsProps = {
  mode: CrashStageMode;
  roundId: bigint;
  phase: CrashRoundPhase;
  countdownSeconds: number;
  hasTicket: boolean;
  settlement: ReturnType<typeof useCrashTicketSettlement>;
};

const SETTLE_KINDS = new Set<StageCtaKind>([
  "verify",
  "claim",
  "settle-loss",
  "retry",
]);

function isSettleKind(
  kind: StageCtaKind
): kind is "verify" | "claim" | "settle-loss" | "retry" {
  return SETTLE_KINDS.has(kind);
}

/**
 * Floor action dock in document flow so Enter / Verify stay fully on-screen.
 * Collapses when there is no CTA (including after settle, when the outcome
 * graph owns the pit).
 */
export function StageActions({
  mode,
  roundId,
  phase,
  countdownSeconds,
  hasTicket,
  settlement,
}: StageActionsProps) {
  const offerEntry = canOfferEntry(phase, countdownSeconds) && !hasTicket;
  const ctaKind = deriveStageCtaKind({
    mode,
    offerEntry,
    hasTicket,
    canEnter: false,
    canVerify: settlement.canVerify,
    canClaim: settlement.canClaim,
    canSettle: settlement.canSettle,
    canRefund: false,
    canExpire: false,
    canRetry: settlement.canRetry,
  });

  const showEnter = ctaKind === "enter";
  const showSettle = SETTLE_KINDS.has(ctaKind);
  const showRefund = mode === "expired" && !showSettle;

  if (!showEnter && !showSettle && !showRefund) return null;

  return (
    <div
      className="pointer-events-auto shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
      data-cta={ctaKind}
      data-testid="stage-actions"
    >
      <div className="mx-auto w-full max-w-xl space-y-3 rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 p-4 backdrop-blur-md sm:p-5">
        {showEnter ? (
          <CrashRoundEntry
            compact
            countdownSeconds={countdownSeconds}
            phase={phase}
            roundId={roundId}
          />
        ) : null}
        <AuthGate>
          {showSettle && isSettleKind(ctaKind) ? (
            <StageSettleDock ctaKind={ctaKind} settlement={settlement} />
          ) : null}
          {showRefund ? (
            <div className="[&_section]:mt-0">
              <CrashTicketRefund />
            </div>
          ) : null}
        </AuthGate>
      </div>
    </div>
  );
}
