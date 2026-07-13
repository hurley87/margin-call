/**
 * Frozen extraction cap helpers. Convex copy of `src/lib/extraction-cap.ts`.
 */

import { MAX_EXTRACTION_PERCENTAGE } from "../agent/_constants";

export type ExtractionCapDealFields = {
  pot_usdc: number;
  max_extraction_amount_usdc?: number | null;
};

/** Max gross win value (USDC) before rake — frozen cap when set, else live pot fallback. */
export function maxWinValueUsdc(deal: ExtractionCapDealFields): number {
  if (deal.max_extraction_amount_usdc != null) {
    return deal.max_extraction_amount_usdc;
  }
  return frozenMaxExtractionAmountUsdc(deal.pot_usdc);
}

/** Derive the frozen cap from creation-time net pot (matches on-chain maxExtractionAmount). */
export function frozenMaxExtractionAmountUsdc(netPotUsdc: number): number {
  return netPotUsdc * (MAX_EXTRACTION_PERCENTAGE / 100);
}

/**
 * Cap fields every deal-creation insert must stamp, kept as one unit so the
 * percentage and frozen amount can never drift or be half-set on a new path.
 * Convex-only (deal creation never happens client-side).
 */
export function dealCreationCapFields(netPotUsdc: number): {
  maxExtractionPercentage: number;
  maxExtractionAmountUsdc: number;
} {
  return {
    maxExtractionPercentage: MAX_EXTRACTION_PERCENTAGE,
    maxExtractionAmountUsdc: frozenMaxExtractionAmountUsdc(netPotUsdc),
  };
}
