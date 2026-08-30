# Margin Call

Margin Call is between product versions. The Crash game has been retired.

The next product is proposed, not implemented. These terms describe its canonical product language so future specifications, contracts, and UI copy can stay aligned.

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

**Stock Gacha** — The proposed first application and protocol proof; it owns its game experience, pools, odds, and independently verifiable randomness, but does not define Margin Call's scope.
