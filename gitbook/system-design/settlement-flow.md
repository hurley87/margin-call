# Settlement

Settlement is pull-based, permissionless, and retryable.

A keeper can make the Floor feel snappy. Settlement does not need one.

---

## Round Transitions

```text
Uninitialized → Open → RevealRequested → Finalized
                              ↘ Expired
```

Any wallet can advance permissionless transitions if automation stops: open (with ETH for the Inco fee), request reveal, finalize, or expire.

---

## Ticket Settlement Paths

### Verify and settle (player with Ticket)

After lock, Ticket holders drive verification from the Floor. The Replay for that player starts after settlement confirms — anticipation first, theater second.

### Claim win

Pull the reserved payout once the Round is finalized and your Tier cleared.

### Settle loss

A Ticket that took the margin call releases its reservation. Payout is zero.

### Expiry refund

If the Round expires without a verified Crash Point, reclaim exact original Margin. No invented multiplier. No partial story.

---

## Independence Across Rounds

Later Rounds open on the epoch grid even when an earlier Round is still revealing, delayed, claimable, or refundable.

Your unpaid Ticket from Round 12 does not freeze Round 13 entry for anyone.

---

## Receipt Discipline

Every wallet action moves through a clear lifecycle: awaiting confirmation → submitted → waiting for receipt → confirmed or failed with retry.

{% hint style="info" %}
A transaction hash alone never changes displayed ownership or settlement state. The Floor waits for the receipt and the contract read.
{% endhint %}

---

## What "Permissionless" Means Here

- No admin key required to finalize a correctly attested Round
- No admin key required to expire a stuck Round
- No admin key required to claim or refund your Ticket
- LP withdrawals never depend on an operator manually unlocking your shares — only on free liquidity and the reveal-window freeze rules

The operator can pre-open Rounds and keep the pit warm. They cannot rewrite the Crash Point after the fact.
