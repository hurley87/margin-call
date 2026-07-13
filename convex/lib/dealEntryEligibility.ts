/**
 * Convex copy of `src/lib/deal-entry-eligibility.ts` (no imports from outside `convex/`).
 */

export type DealDeskCreatorFields = {
  creatorDeskManagerId?: string | null;
  creatorAddress?: string | null;
};

export type TraderDeskFields = {
  deskManagerId: string;
  deskWalletAddress?: string | null;
};

function walletAddressesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function isOwnDeskCreatedDeal(
  deal: DealDeskCreatorFields,
  trader: TraderDeskFields
): boolean {
  const creator = deal.creatorDeskManagerId;
  const idMatch = !!creator && String(creator) === String(trader.deskManagerId);
  return (
    idMatch ||
    walletAddressesMatch(deal.creatorAddress, trader.deskWalletAddress)
  );
}

export function isTraderEligibleToEnterDealByDesk(
  deal: DealDeskCreatorFields,
  trader: TraderDeskFields
): boolean {
  return !isOwnDeskCreatedDeal(deal, trader);
}
