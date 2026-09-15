---
status: accepted
---

# Finalize liquidation shortfalls as treasury losses

The protocol treasury is the sole V1 credit provider. After a successful bounded liquidation sale, insufficient proceeds must not prevent finalization. All shortfall proceeds go to the Credit Pool, applied to remaining principal first and then interest. Remove the position's entire remaining principal from global outstanding principal exactly once, emit `BadDebtRealized(tokenId, principalLoss, unpaidInterest, shortfall)`, finalize the position, and burn its NFT.

The treasury absorbs the economic loss. No claim attaches to the current owner, any prior owner, or another position. Historical bad debt does not keep the APR gate closed after all active principal is cleared, and writing off debt does not manufacture liquid credit.

V1 pays **no liquidator reward and no protocol liquidation fee**, whether liquidation has a surplus or a shortfall. Any surplus after full debt repayment goes to the current NFT owner. Because liquidation has no protocol incentive, Margin Call operates a first-party keeper with treasury-funded gas. The keeper has no privileged bypass: unavailable pricing, failed token transfers, or out-of-bounds execution still revert atomically and leave the position active for retry.

See the [PRD liquidation section](../margin-account-prd.md#liquidation). This is an accepted design decision for a product that remains unimplemented.
