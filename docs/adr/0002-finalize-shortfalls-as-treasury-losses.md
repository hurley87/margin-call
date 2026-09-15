---
status: accepted
---

# Finalize liquidation shortfalls as treasury losses

The protocol treasury is the sole V1 credit provider. After a successful bounded liquidation sale, insufficient proceeds must not prevent finalization. Send all realized USDC to the Credit Pool, compute `shortfall = currentDebt - proceeds`, emit `BadDebtRealized(tokenId, shortfall)`, finalize the position, and burn its NFT.

The treasury absorbs the economic loss. No claim attaches to the current owner, any prior owner, or another position. V1 has no global outstanding-principal counter and no APR-change gate: the borrow APR is fixed at 10%, so liquidation finalization does not need to repair aggregate principal state.

V1 pays **no liquidator reward and no protocol liquidation fee**, whether liquidation has a surplus or a shortfall. Any surplus after full debt repayment goes to the current NFT owner. Because liquidation has no protocol incentive, Margin Call operates a first-party keeper with treasury-funded gas. The keeper has no privileged bypass: unavailable pricing, failed token transfers, or out-of-bounds execution still revert atomically and leave the position active for retry.

See the [PRD liquidation section](../margin-account-prd.md#liquidation). This is an accepted design decision for a product that remains unimplemented.
