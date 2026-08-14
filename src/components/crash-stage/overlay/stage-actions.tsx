"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { CrashRoundEntry } from "@/components/current-round/crash-round-entry";
import {
  CrashTicketRefund,
  type CrashTicketRefundState,
} from "@/components/current-round/crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import {
  canOfferEntry,
  isExpiryRefundTicket,
  type CrashRoundPhase,
} from "@/lib/margin-call-crash";
import type { CrashStageMode } from "../use-crash-stage-mode";
import { StageSettleDock } from "./stage-settle-dock";

export type StageActionsProps = {
  mode: CrashStageMode;
  roundId: bigint;
  phase: CrashRoundPhase;
  countdownSeconds: number;
  hasTicket: boolean;
  settlement: ReturnType<typeof useCrashTicketSettlement>;
  /** Floor-owned refund brain — same instance as the HUD clear action. */
  refund: CrashTicketRefundState;
};

/**
 * Floor action dock in document flow so Enter / Verify stay fully on-screen.
 * Entry vs settle is the settlement/entry flags — not a parallel CTA enum.
 * The root never scrolls; tall forms scroll an inner body while sticky CTAs
 * inside entry/settle keep the primary action pinned.
 */
export function StageActions({
  mode,
  roundId,
  phase,
  countdownSeconds,
  hasTicket,
  settlement,
  refund,
}: StageActionsProps) {
  const showSettle =
    settlement.ticket !== null &&
    (settlement.canVerify ||
      settlement.canClaim ||
      settlement.canSettle ||
      settlement.canRetry);
  const showEnter =
    canOfferEntry(phase, countdownSeconds) && !hasTicket && !showSettle;
  // Expiry leftovers can block the next Open round — show refund even when the
  // live theater is no longer on the expired round.
  const showRefund =
    !showSettle &&
    (mode === "expired" ||
      isExpiryRefundTicket(settlement.phase, settlement.outcome));

  if (!showEnter && !showSettle && !showRefund) return null;

  return (
    <div
      className="pointer-events-auto flex min-h-0 max-h-[min(70%,32rem)] shrink flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 sm:max-h-[min(75%,36rem)] sm:px-6 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-2"
      data-testid="stage-actions"
    >
      {showEnter || showSettle ? (
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 backdrop-blur-md">
          <div
            className="min-h-0 overflow-y-auto p-3 sm:p-5"
            data-testid="stage-actions-body"
          >
            {showEnter ? (
              <CrashRoundEntry
                countdownSeconds={countdownSeconds}
                phase={phase}
                roundId={roundId}
              />
            ) : null}
            {showSettle ? (
              <AuthGate>
                <StageSettleDock settlement={settlement} />
              </AuthGate>
            ) : null}
          </div>
        </div>
      ) : null}
      {showRefund ? (
        <AuthGate>
          <CrashTicketRefund refund={refund} />
        </AuthGate>
      ) : null}
    </div>
  );
}
