/** Canonical key for matching activity rows to `deal_approvals` (case-insensitive UUIDs). */
export function pendingDealReviewKey(traderId: string, dealId: string): string {
  return `${traderId.toLowerCase()}:${dealId.toLowerCase()}`;
}
