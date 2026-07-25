/**
 * Reconcile ambiguous chain-intent submissions by transaction identity (#249).
 * Never re-signs or resubmits. Pure decision helpers + status mapping.
 */
import type { ChainIntentStatus } from "./stateMachine";
import {
  evaluateReceipt,
  type ConfirmationOutcome,
  type ReceiptLike,
} from "./confirm";

export type ReconcileDecision =
  | {
      action: "confirm";
      txHash: string;
      outcome: Extract<ConfirmationOutcome, { kind: "confirmed" }>;
    }
  | { action: "fail"; txHash?: string; reason: string }
  | { action: "stay_reconciling"; reason: string }
  | { action: "abandon"; reason: string };

export type ReconcileInput = {
  status: ChainIntentStatus;
  txHash?: string | null;
  /** Receipt looked up by txHash, if any. */
  receiptByHash?: ReceiptLike | null;
  /**
   * Optional receipt found by scanning the sender's nonce at submit time.
   * Used only when txHash is missing or not yet indexed.
   */
  receiptByNonce?: ReceiptLike | null;
  /** How many reconcile attempts have already run. */
  reconcileAttempts: number;
  /** Max attempts before abandoning. */
  maxReconcileAttempts?: number;
};

/**
 * Decide the next status for an ambiguous submission.
 * Precedence: known txHash receipt → nonce receipt → stay reconciling → abandon.
 */
export function decideReconcile(input: ReconcileInput): ReconcileDecision {
  const maxAttempts = input.maxReconcileAttempts ?? 10;

  if (input.status !== "submitted" && input.status !== "reconciling") {
    return {
      action: "stay_reconciling",
      reason: `Intent status ${input.status} is not eligible for reconcile`,
    };
  }

  if (input.txHash) {
    const outcome = evaluateReceipt(input.receiptByHash);
    switch (outcome.kind) {
      case "confirmed":
        return { action: "confirm", txHash: input.txHash, outcome };
      case "reverted":
        return {
          action: "fail",
          txHash: input.txHash,
          reason: "Transaction reverted on-chain",
        };
      case "not_found":
      case "ambiguous":
        break;
      default: {
        const _exhaustive: never = outcome;
        return _exhaustive;
      }
    }
  }

  if (input.receiptByNonce) {
    const outcome = evaluateReceipt(input.receiptByNonce);
    const txHash = input.receiptByNonce.transactionHash;
    switch (outcome.kind) {
      case "confirmed":
        return { action: "confirm", txHash, outcome };
      case "reverted":
        return {
          action: "fail",
          txHash,
          reason: "Transaction at sender nonce reverted on-chain",
        };
      case "not_found":
      case "ambiguous":
        break;
      default: {
        const _exhaustive: never = outcome;
        return _exhaustive;
      }
    }
  }

  if (input.reconcileAttempts >= maxAttempts) {
    return {
      action: "abandon",
      reason: `Exceeded ${maxAttempts} reconcile attempts without finding a receipt`,
    };
  }

  return {
    action: "stay_reconciling",
    reason: input.txHash
      ? "txHash not yet indexed; will retry without resubmitting"
      : "No txHash recorded; waiting for nonce match without resubmitting",
  };
}

/** Map a reconcile decision onto a chain-intent status transition target. */
export function decisionToStatus(
  decision: ReconcileDecision
): ChainIntentStatus {
  switch (decision.action) {
    case "confirm":
      return "confirmed";
    case "fail":
      return "failed";
    case "abandon":
      return "abandoned";
    case "stay_reconciling":
      return "reconciling";
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}
