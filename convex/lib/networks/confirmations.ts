/**
 * Per-network confirmation policy (#249).
 */
import { getNetwork } from "./registry";
import type { ConfirmationPolicy, NetworkSlug } from "./types";

/** Confirmation policy for a network slug. */
export function getConfirmationPolicy(
  slug: NetworkSlug | string
): ConfirmationPolicy {
  return getNetwork(slug).confirmation;
}

/** Receipt confirmations to wait before treating a tx as final. */
export function recommendWaitBlocks(slug: NetworkSlug | string): number {
  return getConfirmationPolicy(slug).recommendWaitBlocks;
}

/**
 * SeatVault indexer confirmation depth (legacy Base path).
 * Throws if the network has no SeatVault depth configured.
 */
export function seatVaultConfirmationDepth(slug: NetworkSlug | string): number {
  const depth = getConfirmationPolicy(slug).seatVaultConfirmationDepth;
  if (depth === undefined) {
    throw new Error(
      `Network "${getNetwork(slug).slug}" has no SeatVault confirmation depth (legacy Base-only).`
    );
  }
  return depth;
}
