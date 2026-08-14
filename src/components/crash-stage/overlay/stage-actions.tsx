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
 * Floor action dock — centered entry / settle card. Height is content-sized
 * and capped to the Floor slot (`max-h-full`), not the viewport: an `svh`
 * cap is taller than the remaining column once the header and banner are
 * in, and `flex-1 min-h-0` then collapses the card to zero. Overflow is a
 * fallback for short screens or expanded approval details. The primary
 * Enter / Verify CTA stays pinned at the card footer.
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
      className="pointer-events-auto mx-auto flex max-h-full min-h-0 w-full max-w-xl flex-col"
      data-testid="stage-actions"
    >
      {showEntry || showSettle ? (
        <div className="flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 backdrop-blur-md">
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
      ) : null}
      {showRefund ? (
        <AuthGate>
          <CrashTicketRefund refund={refund} />
        </AuthGate>
      ) : null}
    </div>
  );
}
