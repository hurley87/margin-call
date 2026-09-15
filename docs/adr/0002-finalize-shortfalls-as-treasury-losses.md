---
status: accepted
---

# Finalize liquidation shortfalls as treasury losses

The protocol treasury is the sole V1 credit provider. After a successful bounded liquidation sale, insufficient proceeds must not prevent finalization. All shortfall proceeds go to the Credit Pool, applied to remaining principal first and then interest. Remove the position's entire remaining principal from global outstanding principal exactly once, emit `BadDebtRealized(tokenId, principalLoss, unpaidInterest, shortfall)` with separately identified principal loss and unpaid interest, finalize the position, and burn its NFT. The total shortfall equals the sum of those two loss components; recovered and written-off principal together form a single decrease in global principal. Historical bad debt does not keep the APR gate closed after all active principal is cleared.

The treasury absorbs the economic loss; settlement does not require a synchronous treasury top-up. No claim attaches to current or prior NFT owners, and other positions' collateral and accounting remain isolated. This chooses explicit loss realization over a repayment requirement that would strand an underwater position. Ordinary repayments remain interest-first.

Shortfalls pay neither liquidator reward nor owner residual, so a first-party keeper with treasury-funded gas is required to submit zero-reward liquidations. The keeper has no privileged bypass: failed token transfers, unavailable pricing, or out-of-bounds execution still revert atomically and leave the position active for retry. Writing off debt does not manufacture liquid credit.

See the [PRD shortfall waterfall](../margin-account-prd.md#shortfall-liquidation). This is an accepted design decision for a product that remains unimplemented.
