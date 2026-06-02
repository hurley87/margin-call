/** Sentinel values stored in dealOutcomes.onChainTxHash when no real tx exists. */
export const ON_CHAIN_TX_RECONCILED_DEAL = "reconciled:deal-settled";
export const ON_CHAIN_TX_RECONCILED_NO_ENTRY = "reconciled:no-trader-entry";

export type OnChainResolveResult =
  | { status: "resolved"; txHash: `0x${string}` }
  | { status: "already_resolved"; reason: "deal_settled" | "no_trader_entry" }
  | { status: "queue_not_head" };

export function reconciledTxHash(
  reason: "deal_settled" | "no_trader_entry"
): string {
  return reason === "deal_settled"
    ? ON_CHAIN_TX_RECONCILED_DEAL
    : ON_CHAIN_TX_RECONCILED_NO_ENTRY;
}

/** Map contract revert reasons to retry/reconcile signals (testable without RPC). */
export function classifyResolveEntryRevert(
  message: string
): Extract<
  OnChainResolveResult,
  { status: "queue_not_head" | "already_resolved" }
> | null {
  if (message.includes("Trader mismatch")) {
    return { status: "queue_not_head" };
  }
  if (message.includes("No pending entry")) {
    return { status: "already_resolved", reason: "no_trader_entry" };
  }
  return null;
}
