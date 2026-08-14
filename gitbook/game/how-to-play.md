# How to Play

## Getting Started

### 1. Log In With Your Phone

Open [margincall.fun](https://margincall.fun) and sign in with a phone number and SMS code.

An embedded smart wallet on Base Sepolia is created for you. No browser extension. No seed phrase. No test ETH. Gas for in-app actions is sponsored.

### 2. Claim Desk Dollars

Hit the faucet.

You get `100` Desk Dollars per hour. The Floor shows the ticker as `USDC`. The onchain symbol is `tUSD`. Neither is Circle USDC, and neither has real value.

### 3. Wait for Entry Open

Rounds run on a fixed 60-second grid. The entry window is the first 45 seconds.

When the Floor says **Entry open**, you are in business. The interface stops offering entry a few seconds before lock so a late transaction cannot straddle the close.

### 4. Pick Margin and Arcade Leverage

Choose exactly one Margin amount:

| Margin | What it means                    |
| ------ | -------------------------------- |
| `1`    | Small ticket — learn the Floor   |
| `5`    | Standard size                    |
| `10`   | Full size for the current matrix |

Then choose exactly one Arcade Leverage Tier: `1.25x`, `1.50x`, `2.00x`, `3.00x`, `5.00x`, or `10.00x`.

That Tier is both your automatic close threshold and your gross payout multiple.

See [Arcade Leverage](arcade-leverage.md) for the disclosed reach odds.

### 5. Approve Once, Then Enter

The first time you play, you approve a bounded `1,000` Desk Dollars allowance for the vault. Unlimited allowances are never requested. Later entries reuse that allowance.

Confirm entry. Your Margin moves into the bankroll vault and your Ticket's maximum payout is reserved atomically. If the vault cannot reserve it, the transaction reverts and nothing is kept.

{% hint style="info" %}
One Ticket per wallet per Round. If you already entered this epoch, wait for the next one.
{% endhint %}

### 6. Leave or Watch

You do not need to babysit the climb.

After lock, players with an unsettled Ticket see **Verify and settle**. The 3D Replay for a Ticket holder starts after settlement confirms. Spectators see the climb once the Round is finalized.

### 7. Settle Your Ticket

| Outcome       | What you do                                                 |
| ------------- | ----------------------------------------------------------- |
| Win           | Claim the reserved payout (`floor(Margin × Tier)`)          |
| Margin call   | Ticket settles at zero — Margin stays in the vault          |
| Expiry refund | If the Round never finalizes, reclaim exact original Margin |

Then enter the next Round. A delayed claim never blocks later epochs.

---

## First-Session Checklist

1. Phone login works and you see a wallet address
2. Faucet claim lands Desk Dollars in the UI
3. You enter an Open Round with Margin `1` and Tier `1.25x`
4. You verify after lock and see a Crash Point on the Record
5. You claim, settle a loss, or understand the refund path

---

## Where to Look Afterward

- **Floor** (`/`) — live Round, entry, Replay
- **Record** (`/record`) — your Tickets and claim / refund actions
- **Rounds** (`/history`) — recent finalized Rounds and verification trail
- **LP** (`/lp`) — vault deposits and withdrawals
