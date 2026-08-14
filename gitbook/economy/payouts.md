# Payouts

The Floor publishes the distribution. Previous Rounds do not predict the next Crash Point.

---

## Winner Math

A winning Ticket pays:

```text
floor(Margin × Arcade Leverage Tier)
```

That amount includes returned Margin. It is reserved at entry, so a win is a pull against a known reservation — not a hope against an empty vault.

A losing Ticket pays `0`.

---

## House Edge and Cap

The transparent distribution carries an approximately **1% house edge**.

Displayed and payable Crash Points cap at **`10.00x`**.

Roughly **1%** of Rounds crash below `1.00x` and show as an instant `1.00x` crash.

Roughly **one Round in five** dies below the lowest Tier (`1.25x`), so every Ticket in that Round takes the margin call.

Those outcomes are part of the disclosed distribution. They are not bugs, and they are not operator edits.

---

## What Settlement Never Does

- Invent a Crash Point after expiry
- Pay more than the reserved maximum
- Let a Replay change the payout
- Block Round N+1 because Round N still has unclaimed Tickets

---

## Reading Your Result

| Crash Point vs your Tier | Result        | Payout                         |
| ------------------------ | ------------- | ------------------------------ |
| ≥ Tier                   | Won           | `floor(Margin × Tier)`         |
| < Tier                   | Margin called | `0`                            |
| Never finalized          | Expired       | Exact original Margin (refund) |

Equality wins. The red phone only rings for Tickets still open when the market dies.
