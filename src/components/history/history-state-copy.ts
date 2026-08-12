import type { RoundHistoryState } from "@/lib/margin-call-crash";

/** Badge and long-form copy per honest history state — never invent a multiplier. */
export const historyStateCopy: Record<
  RoundHistoryState,
  { badge: string; detail: string }
> = {
  open: { badge: "Open", detail: "Open" },
  delayed: { badge: "Delayed", detail: "Delayed — awaiting attestation" },
  empty: { badge: "Empty", detail: "Empty — no tickets entered" },
  finalized: { badge: "Finalized", detail: "Finalized" },
  expired: { badge: "Expired", detail: "Expired — no invented multiplier" },
};
