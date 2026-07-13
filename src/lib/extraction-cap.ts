/**
 * Frozen extraction cap helpers. Convex duplicate: `convex/lib/extractionCap.ts`.
 */

import { MAX_EXTRACTION_PERCENTAGE } from "@/lib/constants";

export type ExtractionCapDealFields = {
  pot_usdc: number;
  max_extraction_amount_usdc?: number | null;
};

/**
 * Max profit from pot (USDC) before rake — requires the creation-frozen cap.
 * Matches on-chain `maxExtractionAmount`; never derive from the live pot.
 */
export function maxWinValueUsdc(deal: ExtractionCapDealFields): number {
  if (deal.max_extraction_amount_usdc == null) {
    throw new Error(
      "Deal missing frozen maxExtractionAmountUsdc — stamp at creation via dealCreationCapFields"
    );
  }
  return deal.max_extraction_amount_usdc;
}

/** Derive the frozen cap from creation-time net pot (matches on-chain maxExtractionAmount). */
export function frozenMaxExtractionAmountUsdc(netPotUsdc: number): number {
  return netPotUsdc * (MAX_EXTRACTION_PERCENTAGE / 100);
}
