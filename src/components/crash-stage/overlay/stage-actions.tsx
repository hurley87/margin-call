"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { CrashRoundEntry } from "@/components/current-round/crash-round-entry";
import { CrashTicketRefund } from "@/components/current-round/crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { canOfferEntry, type CrashRoundPhase } from "@/lib/margin-call-crash";
import type { CrashStageMode } from "../use-crash-stage-mode";
import { StageSettleDock } from "./stage-settle-dock";

export type StageActionsProps = {
  mode: CrashStageMode;
  roundId: bigint;
  phase: CrashRoundPhase;
  countdownSeconds: number;
  hasTicket: boolean;
  settlement: ReturnType<typeof useCrashTicketSettlement>;
};

/**
 * Floor action dock in document flow so Enter / Verify stay fully on-screen.
 * Entry vs settle is the settlement/entry flags — not a parallel CTA enum.
 */
export function StageActions({
  mode,
  roundId,
  phase,
  countdownSeconds,
  hasTicket,
  settlement,
}: StageActionsProps) {
  const showSettle =
    settlement.ticket !== null &&
    (settlement.canVerify ||
      settlement.canClaim ||
      settlement.canSettle ||
      settlement.canRetry);
  const showEnter =
    canOfferEntry(phase, countdownSeconds) && !hasTicket && !showSettle;
  const showRefund = mode === "expired" && !showSettle;

  if (!showEnter && !showSettle && !showRefund) return null;

  return (
    <div
      className="pointer-events-auto shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
      data-testid="stage-actions"
    >
      {showEnter || showSettle ? (
        <div className="mx-auto w-full max-w-xl space-y-3 rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 p-4 backdrop-blur-md sm:p-5">
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
      ) : null}
      {showRefund ? (
        <AuthGate>
          <CrashTicketRefund />
        </AuthGate>
      ) : null}
    </div>
  );
}
