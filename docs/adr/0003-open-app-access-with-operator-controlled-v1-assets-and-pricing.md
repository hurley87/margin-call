# Keep application access open while the V1 operator controls assets and pricing inputs

**Status: Proposed**

Any wallet or application may deposit, but V1 accepts only assets in the operator's public registry. Each entry publishes the asset address, canonical unit convention, one approved external oracle or pricing adapter, and maximum price age. Applications can permissionlessly use available inventory under protocol terms, but they cannot list arbitrary assets, provide protocol valuations, or bypass stale-price rejection. The V1 operator also publishes one uniform allocation-fee rate for all approved assets.

This decision is hard to reverse because asset identity, units, pricing, fees, and corporate-action handling determine the meaning and solvency of every reservation and claim. It is surprising because application access is permissionless while asset admission and valuation are not. The trade-off accepts operator control over a small, auditable V1 risk surface so third-party applications can integrate without receiving bespoke permission or becoming trusted price sources.

## Consequences

- The operator must publish the registry and asset-acceptance criteria.
- Missing or stale approved prices fail closed at reservation and allocation.
- The protocol snapshots the approved quote and locks the USDC inventory principal and allocation fee; applications cannot substitute a price.
- B20 registry entries must distinguish raw token amounts, scaled economic units, and corporate-action multipliers so splits, consolidations, or multiplier changes preserve economic ownership.
- Asset-specific fee rates remain a possible later extension, not V1 behavior.
