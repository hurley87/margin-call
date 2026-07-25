/**
 * Confirmation helpers for chain intents (#249).
 * Environment-free policy lookup; receipt waiting needs a viem public client.
 */
import { recommendWaitBlocks } from "../networks";
import type { NetworkSlug } from "../networks";

export type ConfirmationOutcome =
  | { kind: "confirmed"; blockNumber: bigint; status: "success" }
  | { kind: "reverted"; blockNumber: bigint; status: "reverted" }
  | { kind: "not_found" }
  | { kind: "ambiguous"; reason: string };

export type ReceiptLike = {
  status: "success" | "reverted";
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

/**
 * Decide confirmation outcome from a receipt (or absence).
 * Never triggers re-sign or resubmit.
 */
export function evaluateReceipt(
  receipt: ReceiptLike | null | undefined
): ConfirmationOutcome {
  if (!receipt) return { kind: "not_found" };
  if (receipt.status === "reverted") {
    return {
      kind: "reverted",
      blockNumber: receipt.blockNumber,
      status: "reverted",
    };
  }
  return {
    kind: "confirmed",
    blockNumber: receipt.blockNumber,
    status: "success",
  };
}

/** Confirmations to wait for on this network. */
export function confirmationDepth(slug: NetworkSlug | string): number {
  return recommendWaitBlocks(slug);
}
