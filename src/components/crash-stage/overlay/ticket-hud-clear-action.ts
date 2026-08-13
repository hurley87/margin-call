import type {
  CrashRefundRetryAction,
  useCrashTicketRefund,
} from "@/hooks/use-crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import {
  isExpiryRefundTicket,
  type CrashRoundPhase,
  type TicketOutcome,
} from "@/lib/margin-call-crash";
import { settlementRetryLabels } from "@/lib/settlement-status-copy";

export type TicketHudClearAction = {
  label: string;
  run: () => void;
};

type SettlementSlice = Pick<
  ReturnType<typeof useCrashTicketSettlement>,
  | "canVerify"
  | "canClaim"
  | "canSettle"
  | "canRetry"
  | "retryAction"
  | "verifyAndSettle"
  | "claim"
  | "settleLoss"
  | "retry"
  | "phase"
  | "outcome"
>;

type RefundSlice = Pick<
  ReturnType<typeof useCrashTicketRefund>,
  | "canExpire"
  | "canRefund"
  | "canRetry"
  | "retryAction"
  | "expireRound"
  | "refund"
  | "retry"
>;

const refundRetryLabels: Record<CrashRefundRetryAction, string> = {
  refresh: "Retry",
  expire: "Retry mark expired",
  refund: "Retry refund",
  "expire-receipt-check": "Retry expiry receipt check",
  "refund-receipt-check": "Retry refund receipt check",
};

/**
 * Primary HUD clear action for an unsettled leftover ticket. Null when the
 * chip is the current Open entry (cannot cancel) or no resolve path exists.
 *
 * Prefers dock `can*` flags, then falls back to phase/outcome so the chip
 * stays clickable while a sibling refund/settlement hook is still catching up.
 */
export function ticketHudClearAction(input: {
  isLiveOpenEntry: boolean;
  settlement: SettlementSlice;
  refund: RefundSlice | null;
}): TicketHudClearAction | null {
  if (input.isLiveOpenEntry) return null;

  const { settlement, refund } = input;

  if (settlement.canVerify) {
    return {
      label: "Verify and settle",
      run: () => void settlement.verifyAndSettle(),
    };
  }
  if (settlement.canClaim) {
    return {
      label: "Claim payout",
      run: () => void settlement.claim(),
    };
  }
  if (settlement.canSettle) {
    return {
      label: "Settle loss",
      run: () => void settlement.settleLoss(),
    };
  }
  if (settlement.canRetry) {
    const label = settlement.retryAction
      ? settlementRetryLabels[settlement.retryAction]
      : "Retry";
    return {
      label,
      run: () => void settlement.retry(),
    };
  }

  const refundAction = refundClearAction(
    refund,
    settlement.phase,
    settlement.outcome
  );
  if (refundAction) return refundAction;

  // Settlement hook knows the ticket is locked/finalized but canAct is false
  // (loading/error gap) — still expose the same primary CTA as the dock.
  if (
    settlement.phase === "locked" ||
    settlement.phase === "reveal-requested"
  ) {
    return {
      label: "Verify and settle",
      run: () => void settlement.verifyAndSettle(),
    };
  }
  if (settlement.outcome === "won") {
    return {
      label: "Claim payout",
      run: () => void settlement.claim(),
    };
  }
  if (settlement.outcome === "lost") {
    return {
      label: "Settle loss",
      run: () => void settlement.settleLoss(),
    };
  }

  return null;
}

function refundClearAction(
  refund: RefundSlice | null,
  phase: CrashRoundPhase | null,
  outcome: TicketOutcome | null
): TicketHudClearAction | null {
  if (!refund) {
    return null;
  }

  if (refund.canExpire) {
    return {
      label: "Mark round expired",
      run: () => void refund.expireRound(),
    };
  }
  if (refund.canRefund) {
    return {
      label: "Refund margin",
      run: () => void refund.refund(),
    };
  }
  if (refund.canRetry) {
    const label = refund.retryAction
      ? refundRetryLabels[refund.retryAction]
      : "Retry";
    return {
      label,
      run: () => void refund.retry(),
    };
  }

  if (!isExpiryRefundTicket(phase, outcome)) {
    return null;
  }

  // Settlement already classified the leftover as expiry/refundable; the Floor
  // refund hook may still be on "loading" so can* is false — still wire the CTA.
  if (phase === "expired-eligible") {
    return {
      label: "Mark round expired",
      run: () => void refund.expireRound(),
    };
  }
  if (outcome === "refundable" || phase === "expired") {
    return {
      label: "Refund margin",
      run: () => void refund.refund(),
    };
  }

  return null;
}
