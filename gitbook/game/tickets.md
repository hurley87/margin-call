# Tickets

A **Ticket** is your holding in one Round: Margin, Arcade Leverage Tier, and settlement state.

One wallet. One Ticket. One Round.

---

## Life of a Ticket

1. **Entry** — you post Margin; the vault reserves `floor(Margin × Tier)` as maximum payout
2. **Open hold** — entry is locked in until the Round locks; you cannot mid-climb out
3. **Finalize** — the Round gets a verified Crash Point (or expires without one)
4. **Settle** — your Ticket reaches exactly one terminal state

Rounds finalize. Tickets settle. Do not mix those words — they keep the Floor honest.

---

## Terminal States

### Claimed win

Crash Point ≥ your Tier. You pull the reserved payout. Equality wins.

### Settled loss (margin call)

Crash Point died below your Tier. Payout is zero. Reserved liability releases back to the vault. Losing Margin stays in the bankroll.

### Expiry refund

The Round hit expiry without a verified Crash Point. No outcome is invented. You reclaim **exactly** your original Margin.

{% hint style="info" %}
Claims and refunds are pull-based. A transaction hash alone never changes ownership — the Floor waits for a successful receipt and onchain state.
{% endhint %}

---

## What Never Happens

- Two Tickets for the same wallet in the same Round
- A Ticket that wins and loses
- A Replay that flips a settled Ticket
- An operator rewriting your Margin, Tier, or Crash Point after entry

---

## Where Tickets Live in the App

- **Floor** — current Ticket chip, Verify / claim / refund CTAs
- **Record** — personal Ticket history in the lookback window
- **Rounds** — global Round history with verification links

You can leave mid-Round. Come back later. Settle when you are ready. Later epochs do not wait on you.
