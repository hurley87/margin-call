# The crash point is pre-committed encrypted state, not a post-lock VRF draw

A post-lock VRF request (the industry-standard crash design) would be equally manipulation-proof and would delete the encrypted-handle and attestation apparatus entirely — so this decision needs its reasons written down before someone "simplifies" it away. There are three:

1. **Confidential state must be essential, not decorative.** The Game Jam entry is judged on Inco Lightning being load-bearing. Pre-commit-then-reveal is the mechanism that makes it so: the game's core promise — the outcome existed, encrypted, onchain, before the operator saw a single entry — is impossible without it.
2. **It is a strictly stronger player guarantee than VRF.** A VRF operator cannot choose an outcome, but it can observe entries and selectively delay or abandon the randomness request when the round's exposure looks bad. A pre-committed encrypted result cannot be regenerated, replaced, or selectively dropped — the round's fate is sealed before the first ticket exists, and the only failure mode is a visible, refundable expiry.
3. **It follows Inco's paved road.** The Incasino play-then-settle reference implements exactly this pattern on Base Sepolia, minimizing novel integration risk.

Consequence: the reveal depends on covalidator liveness, which is why every round carries a 15-minute expiry with full margin refunds rather than any fallback randomness source.
