# Creator emissions gate at NAV ≥ Rip Price

Uniform selection pays every Pack the same fixed proceeds, so without a counterweight the rational creator strategy is to mint every Pack at the minimum NAV bound and collect a guaranteed spread — no above-price outcomes would exist. We keep uniform selection (it is the audit story) and instead gate creator emissions: only Packs whose NAV is at or above the Rip Price accrue emissions. Floor packs stay selection-eligible but earn zero tokens, making emissions the explicit and only subsidy for stocking above-price outcomes.

## Consequences

- Selection-eligible and emission-eligible are distinct Pack states (see CONTEXT.md); a Pack drifting below the Rip Price at a checkpoint stops accruing but can still be ripped.
- Rejected alternatives: NAV-weighted selection odds (destroys the uniform-selection invariant), narrowing the NAV band to ~Rip Price (kills the creator spread that gets supply in the door at all).
