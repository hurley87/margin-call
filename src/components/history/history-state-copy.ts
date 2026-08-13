import type { RoundHistoryState } from "@/lib/margin-call-crash";

type HistoryStateCopy = {
  badge: string;
  detail: string;
  /** Primary row label, or `"crashPoint"` to use the attested display value. */
  rowLabel: string | "crashPoint";
};

/** Badge, long-form, and row labels per honest history state — never invent a multiplier. */
export const historyStateCopy: Record<RoundHistoryState, HistoryStateCopy> = {
  open: { badge: "Open", detail: "Open", rowLabel: "—" },
  delayed: {
    badge: "Delayed",
    detail: "Delayed — awaiting attestation",
    rowLabel: "Awaiting attestation",
  },
  empty: {
    badge: "Empty",
    detail: "Empty — no tickets entered",
    rowLabel: "No entries",
  },
  finalized: {
    badge: "Finalized",
    detail: "Finalized",
    rowLabel: "crashPoint",
  },
  expired: {
    badge: "Expired",
    detail: "Expired — no invented multiplier",
    rowLabel: "Expired — no result",
  },
};

/** Resolves the primary history-row label for a given state. */
export function historyRowLabel(
  state: RoundHistoryState,
  displayCrashPoint: string | null
): string {
  const { rowLabel } = historyStateCopy[state];
  if (rowLabel === "crashPoint") {
    return displayCrashPoint ?? "—";
  }
  return rowLabel;
}
