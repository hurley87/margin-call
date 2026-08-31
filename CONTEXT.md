# Margin Call

Margin Call is between product versions. The Crash game has been retired.

The next product is proposed, not implemented. The immediate product is the standalone Stock Gacha MVP; the generalized Margin Call protocol remains a later proposal. These terms describe canonical product language so future specifications, contracts, and UI copy can stay aligned.

## Stock Gacha MVP vocabulary

**Stock Gacha MVP** — The first game proposed for Base. It directly custodies four approved Coinbase B20 stocks and settles USDC rips without depending on the future generalized Margin Call protocol.

**Maker** — A user who deposits one supported B20 stock position into the game.

**Lot** — One quantity of one supported stock deposited by one Maker. A lot is a contract record, not an NFT or a multi-stock basket.

**Grade** — A lot's current oracle-valued NAV in USDC terms. It is not ETH backing.

**Ripper** — A buyer who pays USDC for one verifiably random active lot.

**Rip** — One USDC purchase, random lot selection, Maker settlement, and delivery of the actual B20 stock to the Ripper.

**Rip Price** — The active lots' inverse-NAV-weighted expected value plus the public game surcharge.

**House Reserve** — USDC funded by the game treasury and reserved as necessary to settle a selected lot whose locked NAV is greater than its Rip Price.

**Reward token** — A standard ERC-20 explicitly whitelisted for pre-funded Maker or Ripper rewards. $CALL is the primary launch reward; $BNKR and other reviewed tokens may be added.

**Rewards Vault** — The separate contract that accepts permissionless deposits of whitelisted reward tokens and prevents epoch commitments from exceeding each token's funded balance.

## Proposed protocol vocabulary

**Margin Call** — The proposed shared protocol that holds and accounts for approved real financial inventory under common rules for use by permissionless applications.

**Inventory contributor** — A wallet or application whose deposited inventory remains attributable for earnings, withdrawals, audit, and disputes.

**Approved asset** — An asset accepted under the V1 operator's public asset registry and acceptance criteria.

**Available inventory** — Aggregate approved deposited units currently free for an application to reserve or allocate. Do not call this a “shared pool.”

**Reserved inventory** — Inventory locked for one pending application obligation and unavailable for withdrawal or any other allocation.

**Ownership claim** — A vested, non-expiring user ownership record backed by locked protocol inventory until withdrawal or transfer.

**Protocol-quoted value** — The USDC value obtained from an asset's registry-approved price adapter under its maximum-price-age rule; applications do not supply it.

**Inventory principal** — The full locked protocol-quoted value that a consuming application settles to the contributor for inventory represented by a user ownership claim; it is separate from the allocation fee.

**Allocation fee** — The additional USDC application-access fee charged as the public V1 percentage of locked protocol-quoted value and split between the contributor and Margin Call.

**Allocation** — The atomic protocol transition in which a consuming application settles inventory principal and the allocation fee, inventory becomes claim-backing, and a funded user ownership claim is created.

**Stock Gacha** — The future protocol-backed form of the game. The standalone MVP may own its own custody and settlement first; later migration to the shared protocol must preserve the game's experience, odds, and independently verifiable randomness.
