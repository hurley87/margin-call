---
status: proposed
---

# Irrevocability is scoped to the result, not the payment

Once a lot is selected, that outcome and its bound recipient are immutable forever. Before randomness lands there is no result to discard, so a rip may refund on a narrow, pre-declared, outcome-independent trigger. The earlier framing made the _payment_ irrevocable and forbade refunds outright, which is stricter than the property it was protecting and left the game with no remedy when randomness never arrives.

## Considered options

**Absolute irrevocability, no refund path.** Rejected because it converts two ordinary vendor failure modes into permanent loss. Chainlink publishes no fulfillment SLA and does not document whether an in-flight request survives an underfunded subscription, so a rip could be paid for and never resolve, with nothing to retry.

**Re-requesting randomness after a timeout.** Rejected on Chainlink's explicit instruction: "Do not allow re-requesting or cancellation of randomness… you must prevent the ability for any party to discard unfavorable randomness." Refunding a rip that has no result is safe; issuing it a second result is not.

## Consequences

The refund latch must key on **whether the VRF word is stored**, not on whether selection has been computed. Selection is a deterministic function of public data, so anyone can compute their own lot off-chain the moment the word lands; latching on selection would let a buyer look ahead and refund a bad draw, which is precisely the grinding vector being avoided.

Because `fulfillRandomWords` must never revert, a callback arriving after a timeout refund stores the word and returns without effect. The two paths race, and the one-way flag decides.
