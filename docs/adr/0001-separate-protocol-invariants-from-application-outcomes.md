# Separate protocol invariants from application outcomes

**Status: Proposed**

Margin Call owns custody, inventory state and provenance, approved price inputs, reservations, ownership claims, withdrawals, settlement, and protocol solvency invariants. Applications own their experiences, pricing, pools, allocation selection, risk, and outcome logic. In particular, Stock Gacha owns independently verifiable randomness and its odds; Margin Call validates only asset eligibility, inventory availability, user-payment finality, full principal and fee funding, and the resulting state transition.

This boundary is hard to reverse because putting application outcomes inside Margin Call would make the shared protocol inherit every application's product logic and risk model. It is surprising because Margin Call makes an outcome real without deciding the outcome. The trade-off is that the protocol cannot guarantee an application's fairness or profitability; applications and independent verifiers must establish those properties, while Margin Call guarantees only that an eligible, sufficiently funded outcome becomes a valid inventory transition.

## Consequences

- Games decide outcomes; the protocol makes valid outcomes real.
- An application cannot bypass protocol valuation, inventory-state, principal, fee, finality, or solvency checks.
- Stock Gacha must publish its pool, remaining availability, entry price, and odds, and make its draws independently verifiable.
- Margin Call does not set game odds or require a calculated expected-value display.
