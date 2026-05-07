/**
 * Desk-based entry eligibility for Next.js. Convex duplicate: `convex/lib/dealEntryEligibility.ts`.
 * No `creatorDeskManagerId` ⇒ house-style ⇒ allowed. Same id as trader's desk ⇒ blocked.
 */

export type DealDeskCreatorFields = {
  creatorDeskManagerId?: string | null;
};

export type TraderDeskFields = {
  deskManagerId: string;
};

export function isOwnDeskCreatedDeal(
  deal: DealDeskCreatorFields,
  traderDeskManagerId: string
): boolean {
  const creator = deal.creatorDeskManagerId;
  if (creator == null || creator === "") return false;
  return String(creator) === String(traderDeskManagerId);
}

export function isTraderEligibleToEnterDealByDesk(
  deal: DealDeskCreatorFields,
  trader: TraderDeskFields
): boolean {
  return !isOwnDeskCreatedDeal(deal, trader.deskManagerId);
}
