# Liquidity

All game liquidity lives in a community-funded **BankrollVault** — an ERC-4626-style vault over Desk Dollars.

Player Margin enters that vault directly on entry. Losing Margin stays. Winning payouts leave. LP share value moves with realized game results.

---

## Who Holds What

| Contract          | Holds general bankroll? | Job                                      |
| ----------------- | ----------------------- | ---------------------------------------- |
| `BankrollVault`   | Yes                     | LP deposits, player Margin, reservations |
| `MarginCallCrash` | No                      | Rounds, Tickets, attestation, settlement |

The game contract may only ask the vault to reserve, release, pay, or refund amounts bounded to a specific Ticket. It never takes custody of a free-floating pot.

---

## Reservations

When you enter, the vault atomically:

1. receives your Margin, and
2. reserves your maximum payout (`floor(Margin × Tier)`).

If it cannot, the transaction reverts. Accepted player liabilities stay fully collateralized until the Ticket settles or refunds.

---

## Reveal-Window Freeze

When a Round's outcome becomes publicly knowable but is not yet priced into vault shares, LP deposits, mints, withdrawals, and redemptions freeze.

Entries and later Rounds continue. The freeze is about share fairness, not pausing the game.

Share price marks the verified result at finalization or expiry — not when winners later claim — so nobody trades vault shares against a known but unpaid outcome.

---

## LP Desk

On `/lp` you can see:

- Wallet Desk Dollars and vault-share balances
- Share price and realized vault gain or loss
- Reserved liabilities, pending obligations, safety buffer, free liquidity, utilization
- Capacity by Arcade Leverage Tier
- Immediately withdrawable assets

Withdrawals only pull free liquidity. If reserved liabilities or the safety buffer would be touched, the withdrawal reverts and you retry later.

{% hint style="info" %}
LP reward emissions (`$CALL`) and a constrained withdrawal queue are roadmap items, not live MVP features.
{% endhint %}
