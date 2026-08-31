# Create ownership claims only through an atomic fully funded allocation

**Status: Proposed**

After a user purchase reaches finality, the consuming application settles the inventory's full locked protocol-quoted value to the contributor, pays the separate allocation fee, reserves eligible available inventory, and creates the user's ownership claim in one atomic transition. The allocation fee is an additional application-access fee, not payment for inventory principal. A game may reveal the funded outcome only after that transition succeeds; otherwise it retries or refunds without revealing an unfunded reward.

This decision is hard to reverse because relaxing full funding or atomicity would permit contributor inventory to move without principal payment, paid-but-unfunded users, double allocation, or rewards whose backing depends on later operator action. It is surprising because the application owns its outcome while the protocol controls when that outcome may become a user-visible asset. The trade-off is stricter pre-funding and less application flexibility in exchange for a simple solvency invariant: every vested claim is immediately visible, non-expiring, and backed by locked inventory until withdrawal or transfer.

## Consequences

- Every offered Stock Gacha pool must be solvent before its first draw.
- Every meaningful V1 reward is actual protocol inventory, not points, credits, or upgrades.
- Stock Gacha funds any gap between entry payments and inventory principal plus fee from reserve, working capital, or explicit subsidy.
- Failed allocations move no application funding, inventory, fee, or claim.
- Contributors cannot withdraw reserved inventory or inventory backing a claim.
- V1 supports later withdrawal of the actual inventory and makes no launch promise of cash redemption or protocol buyback.
