/**
 * Convex copy of `src/lib/deal-entry-eligibility.ts` (no imports from outside `convex/`).
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
