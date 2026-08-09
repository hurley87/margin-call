# Player margin is recognized into share value at finalization, not entry

An earlier draft let entering margin raise `totalAssets` — and therefore share pricing — immediately, with `pendingObligations` marking only verified winning payouts at finalization. That draft had two defects:

1. **It made acceptance criterion 17 impossible.** A losing round's gain was recognized at entry, so finalizing a losing round changed nothing — the criterion's "share value rises at the moment a losing round finalizes" could never be tested true.
2. **It handed LPs a one-sided option needing no information at all.** With unearned margin priced in mid-round, redeeming during any open round and re-buying after finalization could never lose: the price fell when players won and stayed flat when they lost. Repeated every round, that is a systematic transfer from passive LPs, independent of the reveal-window sandwich.

The decision: entry adds each ticket's margin to both `totalAssets` and a new `unrecognizedMargin` figure, and all share pricing uses `totalAssets − pendingObligations − unrecognizedMargin`. Entry is therefore pricing-neutral. `finalizeRound` releases the round's margin from `unrecognizedMargin` while marking winning payouts into `pendingObligations`, so share value moves by exactly the round's realized result at the attestation, in either direction, before any claim. Expiry moves the round's margin from `unrecognizedMargin` to `pendingObligations` with no price change, since never-recognized margin is owed back as refunds.

Consequences: criterion 17 is testable as written; the mid-round redeem/re-deposit round-trip is EV-negative by the house edge rather than riskless; expiry needs no separate marking judgment; and `pendingObligations + unrecognizedMargin` never exceeds `reservedLiabilities`, so free liquidity remains the stricter constraint and withdrawal math is untouched.
