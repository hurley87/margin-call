import type { useCrashTicketRefund } from "@/hooks/use-crash-ticket-refund";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import {
  refundRetryLabels,
  settlementRetryLabels,
} from "@/lib/settlement-status-copy";

export type TicketResolveAction = {
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

type ResolveCandidate = TicketResolveAction & { show: boolean };

/**
 * Canonical settle + refund CTA priority (same order as CrashLiveTicket /
 * StageSettleDock). First `show: true` wins for a single primary launcher.
 */
export function ticketResolveCandidates(input: {
  settlement: SettlementSlice;
  refund: RefundSlice | null;
}): ResolveCandidate[] {
  const { settlement, refund } = input;
  const settlementRetryLabel = settlement.retryAction
    ? settlementRetryLabels[settlement.retryAction]
    : "Retry";
  const refundRetryLabel = refund?.retryAction
    ? refundRetryLabels[refund.retryAction]
    : "Retry";

  return [
    {
      show: settlement.canVerify,
      label: "Verify and settle",
      run: () => void settlement.verifyAndSettle(),
    },
    {
      show: settlement.canClaim,
      label: "Claim payout",
      run: () => void settlement.claim(),
    },
    {
      show: settlement.canSettle,
      label: "Settle loss",
      run: () => void settlement.settleLoss(),
    },
    {
      show: settlement.canRetry,
      label: settlementRetryLabel,
      run: () => void settlement.retry(),
    },
    {
      show: Boolean(refund?.canExpire),
      label: "Mark round expired",
      run: () => void refund?.expireRound(),
    },
    {
      show: Boolean(refund?.canRefund),
      label: "Refund margin",
      run: () => void refund?.refund(),
    },
    {
      show: Boolean(refund?.canRetry),
      label: refundRetryLabel,
      run: () => void refund?.retry(),
    },
  ];
}

/** First ready settle/refund CTA, or null when none are available. */
export function primaryTicketResolveAction(input: {
  settlement: SettlementSlice;
  refund: RefundSlice | null;
}): TicketResolveAction | null {
  const ready = ticketResolveCandidates(input).find((action) => action.show);
  if (!ready) return null;
  return { label: ready.label, run: ready.run };
}
