import type { useCrashTicketRefund } from "@/hooks/use-crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import {
  isExpiryRefundTicket,
  type CrashRoundPhase,
  type TicketOutcome,
} from "@/lib/margin-call-crash";
import {
  primaryTicketResolveAction,
  type TicketResolveAction,
} from "./primary-ticket-resolve-action";

export type TicketHudClearAction = TicketResolveAction;

type SettlementSlice = Parameters<
  typeof primaryTicketResolveAction
>[0]["settlement"] & {
  phase: CrashRoundPhase | null;
  outcome: TicketOutcome | null;
};

type RefundSlice = NonNullable<
  Parameters<typeof primaryTicketResolveAction>[0]["refund"]
>;

/**
 * Primary HUD clear action for an unsettled leftover ticket. Null when the
 * chip is the current Open entry (cannot cancel) or no resolve path exists.
 *
 * Prefers the shared dock `can*` catalog, then falls back to phase/outcome so
 * the chip stays clickable while a sibling hook is still catching up.
 */
export function ticketHudClearAction(input: {
  isLiveOpenEntry: boolean;
  settlement: SettlementSlice;
  refund: RefundSlice | null;
}): TicketHudClearAction | null {
  if (input.isLiveOpenEntry) return null;

  const primary = primaryTicketResolveAction({
    settlement: input.settlement,
    refund: input.refund,
  });
  if (primary) return primary;

  return phaseOutcomeFallback(input.settlement, input.refund);
}

function phaseOutcomeFallback(
  settlement: SettlementSlice,
  refund: RefundSlice | null
): TicketHudClearAction | null {
  const refundAction = refundClearAction(
    refund,
    settlement.phase,
    settlement.outcome
  );
  if (refundAction) return refundAction;

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

  if (!isExpiryRefundTicket(phase, outcome)) {
    return null;
  }

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
