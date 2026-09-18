---
status: accepted
---

# Keep NFT transfers independent of pricing and health

Margin Call's proposed V1 must let financed positions change owners without unwinding their stock or debt. `MarginCall` itself therefore inherits OpenZeppelin ERC-721 and active Position NFTs transfer through its standard ERC-721 authorization path without an oracle lookup, health threshold, or protocol-admin transfer pause. There is no separate `PositionNFT` contract. This includes stale/frozen pricing, liquidatable positions, and positions whose debt exceeds their collateral value.

There is **no financial transfer gate in V1**: no `canTransfer`, `isTransferable`, fresh-price requirement, maintenance-health check, or protocol pause may sit in the ERC-721 transfer path. `MarginCall` overrides the ERC-721 ownership update hook only to clear the position's old executor on a real ownership transfer. That clearing happens internally before any safe-transfer receiver callback can manage the position. Normal ERC-721 ownership/approval, existence, and receiver-callback rules still apply, but transfer must not revert because of debt, price state, leverage, health, or liquidation eligibility.

We rejected both blocking transfers until valid pricing returns and splitting ownership into a second `PositionNFT` contract. The first would block transfer availability during held markets; the second would add mint/burn calls and transfer-hook choreography without changing V1 economics. Keeping ownership and position accounting in `MarginCall` makes executor clearing a single-contract invariant.

The trade-off is that a buyer can receive an immediately liquidatable position: transfer creates no grace period, debt reset, or promise of unchanged economics. The existing risk follows ownership, and the old executor is cleared before recipient callbacks. NFT approvals and executor permissions remain separate.

This decision governs the Margin Call transfer layer. Marketplace/payment availability is separate, and a burned NFT cannot be sold. Position presentations must expose debt and unavailable pricing or known liquidation risk. Liquidation itself still requires valid pricing and bounded execution.

See the [PRD transfer semantics](../margin-account-prd.md#transfer-semantics). This is an accepted design decision, implemented in the live `MarginCall` ERC-721 transfer path.
