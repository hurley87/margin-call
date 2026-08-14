"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { CrashRoundEntry } from "@/components/current-round/crash-round-entry";
import {
  CrashTicketRefund,
  type CrashTicketRefundState,
} from "@/components/current-round/crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import type { CrashRoundPhase } from "@/lib/margin-call-crash";
import type { CrashStageMode } from "../use-crash-stage-mode";
import { deriveStageDockKind } from "./stage-dock-state";
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
  const kind = deriveStageDockKind({
    mode,
    phase,
    countdownSeconds,
    hasTicket,
    hasSettlementTicket: settlement.ticket !== null,
    canVerify: settlement.canVerify,
    canClaim: settlement.canClaim,
    canSettle: settlement.canSettle,
    canRetry: settlement.canRetry,
    settlementPhase: settlement.phase,
    settlementOutcome: settlement.outcome,
  });

  if (kind === "none") return null;

  const showEntry = kind === "enter" || kind === "arm";
  const showSettle = kind === "settle";
  const showRefund = kind === "refund";

  return (
    <div
      className="pointer-events-auto flex min-h-0 max-h-[min(70%,32rem)] shrink flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 sm:max-h-[min(75%,36rem)] sm:px-6 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-2"
      data-testid="stage-actions"
    >
      {showEntry || showSettle ? (
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 backdrop-blur-md">
          <div
            className="min-h-0 overflow-y-auto p-3 sm:p-5"
            data-testid="stage-actions-body"
          >
            {showEntry ? (
              <CrashRoundEntry
                armed={kind === "arm"}
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
