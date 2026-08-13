"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { CrashRoundEntry } from "@/components/current-round/crash-round-entry";
import { CrashTicketRefund } from "@/components/current-round/crash-ticket-refund";
import { CrashTicketSettlement } from "@/components/current-round/crash-ticket-settlement";
import type { CrashRoundPhase } from "@/lib/margin-call-crash";

export type StageActionsProps = {
  roundId: bigint;
  phase: CrashRoundPhase;
  countdownSeconds: number;
};

/**
 * Floor action overlay: reuses CurrentRound entry + settlement + refund
 * surfaces instead of a parallel Stage CTA stack.
 */
export function StageActions({
  roundId,
  phase,
  countdownSeconds,
}: StageActionsProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 max-h-[55svh] overflow-y-auto px-4 pb-6 pt-16 sm:px-6 sm:pb-8"
      data-testid="stage-actions"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-xl space-y-4 rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/85 p-4 backdrop-blur-md sm:p-5 [&_button]:min-h-11">
        <CrashRoundEntry
          countdownSeconds={countdownSeconds}
          phase={phase}
          roundId={roundId}
        />
        <AuthGate>
          <div className="space-y-4 [&_button.bg-\[var\(--t-accent\)\]]:min-h-16 [&_button.bg-\[var\(--t-accent\)\]]:w-full [&_button.bg-\[var\(--t-accent\)\]]:text-xl [&_button.bg-\[var\(--t-accent\)\]]:tracking-\[0.2em\]">
            <CrashTicketSettlement />
            <CrashTicketRefund />
          </div>
        </AuthGate>
      </div>
    </div>
  );
}
