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

export type SponsoredTransaction = {
  submit: (request: {
    to: Address;
    data: Hex;
    chainId: number;
  }) => Promise<boolean>;
  getSubmittedHash: () => Hex | null;
  getSubmissionError: () => string | null;
};

/** Mutable handle to the stage whose submitted transaction is awaiting a receipt. */
export type SponsoredStageRef<Stage extends string> = {
  current: { stage: Stage; hash: Hex } | null;
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

export type StageErrorCopy = {
  failed: string;
  unconfirmed: string;
  /** Overrides `failed` when the transaction reverted onchain. */
  reverted?: string;
};

/**
 * Maps a sponsored-call outcome to the stage's error copy. Clears the pending
 * stage on any definitive outcome; an unknown confirmation keeps it as the
 * recovery handle for Retry — the caller must re-check that hash rather than
 * resubmit, because the transaction may have mined.
 */
export function applyStageResult<Stage extends string>(
  pendingStage: { current: { stage: Stage; hash: Hex } | null },
  copy: StageErrorCopy,
  result: SponsoredCallResult
): void {
  if (result.outcome === "confirmed") {
    pendingStage.current = null;
    return;
  }
  if (result.outcome === "confirmation-unknown")
    throw new Error(copy.unconfirmed);
  pendingStage.current = null;
  if (result.outcome === "submission-failed")
    throw new Error(result.message ?? copy.failed);
  throw new Error(copy.reverted ?? copy.failed);
}

/**
 * Runs one sponsored transaction stage: reports `<stage>-submitting`, records
 * the pending hash and reports `<stage>-pending` once submitted, then applies
 * the result — throwing the stage's error copy on any failure.
 */
export async function runSponsoredStage<Stage extends string>(options: {
  transaction: SponsoredTransaction;
  pendingStage: SponsoredStageRef<Stage>;
  stage: Stage;
  copy: StageErrorCopy;
  request: { to: Address; data: Hex };
  onStatus: (status: `${Stage}-submitting` | `${Stage}-pending`) => void;
}): Promise<void> {
  const { transaction, pendingStage, stage, copy, request, onStatus } = options;
  onStatus(`${stage}-submitting`);
  const result = await submitSponsoredCall(transaction, request, (hash) => {
    pendingStage.current = { stage, hash };
    onStatus(`${stage}-pending`);
  });
  applyStageResult(pendingStage, copy, result);
}

/**
 * Re-checks the receipt of a stage whose transaction was already submitted —
 * never resubmits. Returns the resumed stage, or null when nothing was pending.
 */
export async function resumeSponsoredStage<Stage extends string>(options: {
  pendingStage: SponsoredStageRef<Stage>;
  copyByStage: Record<Stage, StageErrorCopy>;
  onStatus: (status: `${Stage}-pending`, stage: Stage) => void;
}): Promise<Stage | null> {
  const pending = options.pendingStage.current;
  if (!pending) return null;
  options.onStatus(`${pending.stage}-pending`, pending.stage);
  applyStageResult(
    options.pendingStage,
    options.copyByStage[pending.stage],
    await confirmSponsoredCall(pending.hash)
  );
  return pending.stage;
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
