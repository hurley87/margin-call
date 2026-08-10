import type { Address, Hex } from "viem";
import { BASE_SEPOLIA_CHAIN_ID, baseSepoliaPublicClient } from "./base-sepolia";

/**
 * "confirmation-unknown" means the transaction was submitted but its receipt
 * could not be resolved — the caller must re-check the same hash rather than
 * resubmit, because the transaction may have mined.
 */
export type SponsoredCallResult =
  | { outcome: "confirmed"; hash: Hex }
  | { outcome: "reverted"; hash: Hex }
  | { outcome: "confirmation-unknown"; hash: Hex }
  | { outcome: "submission-failed"; message: string | null };

type SponsoredTransaction = {
  submit: (request: {
    to: Address;
    data: Hex;
    chainId: number;
  }) => Promise<boolean>;
  getSubmittedHash: () => Hex | null;
  getSubmissionError: () => string | null;
};

/** Submits a sponsored Base Sepolia call and resolves its receipt without throwing. */
export async function submitSponsoredCall(
  transaction: SponsoredTransaction,
  request: { to: Address; data: Hex },
  onSubmitted?: (hash: Hex) => void
): Promise<SponsoredCallResult> {
  const submitted = await transaction.submit({
    ...request,
    chainId: BASE_SEPOLIA_CHAIN_ID,
  });
  if (!submitted) {
    return {
      outcome: "submission-failed",
      message: transaction.getSubmissionError(),
    };
  }
  const hash = transaction.getSubmittedHash();
  if (!hash) return { outcome: "submission-failed", message: null };
  onSubmitted?.(hash);
  return confirmSponsoredCall(hash);
}

/** Resolves the receipt for an already-submitted sponsored call. */
export async function confirmSponsoredCall(
  hash: Hex
): Promise<SponsoredCallResult> {
  try {
    const receipt = await baseSepoliaPublicClient.waitForTransactionReceipt({
      hash,
    });
    return receipt.status === "success"
      ? { outcome: "confirmed", hash }
      : { outcome: "reverted", hash };
  } catch {
    return { outcome: "confirmation-unknown", hash };
  }
}
