# Arcade Leverage

Arcade Leverage is the only leverage in the game.

You pick exactly one Tier when you enter. The contracts reject every other value.

That Tier is both:

1. the automatic close threshold, and
2. the gross payout multiple on your Margin.

There is no slider. There is no mid-climb cashout. There is no "almost."

---

## The Six Tiers

| Tier     | Approx. reach chance | If it clears                 |
| -------- | -------------------- | ---------------------------- |
| `1.25x`  | ~79.2%               | Pays `floor(Margin × 1.25)`  |
| `1.50x`  | ~66.0%               | Pays `floor(Margin × 1.50)`  |
| `2.00x`  | ~49.5%               | Pays `floor(Margin × 2.00)`  |
| `3.00x`  | ~33.0%               | Pays `floor(Margin × 3.00)`  |
| `5.00x`  | ~19.8%               | Pays `floor(Margin × 5.00)`  |
| `10.00x` | ~9.9%                | Pays `floor(Margin × 10.00)` |

Higher Tiers reserve bigger payouts and survive fewer Crash Points. That is the whole trade.

---

## How a Ticket Wins

A Ticket wins when the verified Crash Point is **greater than or equal to** the selected Tier.

Equality wins.

A winner receives `floor(Margin × selected Tier)`, including returned Margin. A losing Ticket receives zero.

---

## Reading the Room

`1.25x` is the desk that wants to clear and live.

`10.00x` is the desk that wants the headline.

Neither is smarter. Both are priced into the same transparent distribution. The Crash Point for a Round is shared — your rivals are staring at the same encrypted handle you are.

{% hint style="info" %}
This is an arcade abstraction, not trading education. Arcade Leverage is not real borrowing, debt, or liquidation cascade mechanics.
{% endhint %}

---

## Capacity Limits

The vault must reserve your maximum payout before entry succeeds. Per-ticket and per-round caps exist so one Ticket cannot eat the Floor. If a Tier is full for the current vault state, entry reverts cleanly — try a smaller Margin, a lower Tier, or wait for free liquidity to return.
