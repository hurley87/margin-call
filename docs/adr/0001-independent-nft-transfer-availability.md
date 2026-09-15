---
status: accepted
---

# Keep NFT transfers independent of pricing and health

Margin Call's proposed V1 must let financed positions change owners without unwinding their stock or debt. Active Position NFTs therefore transfer through standard ERC-721 authorization without an oracle lookup, health threshold, or protocol-admin transfer pause. This includes stale/frozen pricing, liquidatable positions, and positions whose debt exceeds their collateral value.

We rejected blocking transfers until valid pricing or healthy collateral returns because that would also block NFT sale settlement during those periods. The trade-off is that a buyer can receive an immediately liquidatable position: transfer creates no grace period, debt reset, or promise of unchanged economics. The existing risk follows ownership, and the old executor is cleared before recipient callbacks. NFT approvals and executor permissions remain separate.

This decision governs the Margin Call transfer layer. Marketplace/payment availability is separate, and a burned NFT cannot be sold. Position presentations must expose debt and unavailable pricing or known liquidation risk. Liquidation itself still requires valid pricing and bounded execution.

See the [PRD transfer semantics](../margin-account-prd.md#transfer-semantics). This is an accepted design decision for a product that remains unimplemented.
