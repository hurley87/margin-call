# Escrow Contract

This is the part of the game that makes the consequences real.

When value moves, it moves here.

Margin Call settles money on **Base** through a single escrow contract.

Floor-capacity principal is deliberately separate. [`$BLOW`](../economy/blow-and-floor-access.md) is held by the SeatVault, never by the USDC escrow.

The app's current public deployment is on **Base Sepolia**:

- **Contract address:** `0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03`
- **BaseScan:** [View contract](https://sepolia.basescan.org/address/0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03)

The active Base Sepolia capacity contracts are:

- **Test `$BLOW` token:** `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7`
- **SeatVault:** `0xA901DFC8C46faF3A24F4002849dE98dFE9722C95`

---

## What It Holds

| State               | Description                                               |
| ------------------- | --------------------------------------------------------- |
| **Deal pots**       | The capital attached to each open market opportunity      |
| **Trader balances** | The bankroll each trader can risk on the floor            |
| **Platform fees**   | The portion of economic activity retained by the platform |

The escrow does not hold `$BLOW`. The SeatVault does not hold USDC, settle deals, pay rewards, or change rake.

---

## Why It Matters

This part does not create the drama.

It makes the fun count.

Its job is simple:

- Holding deal pots and trader balances
- Enforcing who can fund, withdraw, or close out value
- Applying platform fees consistently
- Moving money when a deal resolves
- Preserving a clear financial source of truth

---

## Authorization

Different people control different actions:

- **Desk managers** control the traders they own
- **Deal creators** can reclaim the remaining value in deals they opened
- **The game** can settle outcomes after the rules have been applied
- **Platform administration** is limited to fee management and operational controls

The escrow also records the current depositor for each trader. That address is the only desk treasury allowed to post new `$BLOW` principal against the trader. The original staker retains the right to withdraw its principal after cooldown even if the depositor later changes.

---

## SeatVault Capacity

The SeatVault reports Gallery, Seat, or Corner Office from active principal. The agent scheduler reads that tier to apply cadence and unresolved-entry limits.

The vault has no reward, yield, dividend, slashing, fee-discount, or payout path. Initiating an unstake removes the amount from active principal immediately; completion returns it after the 24-hour cooldown.

---

## Money Flows

### Deal Creation

When a player opens a deal, they put real money behind it.

That is why bait matters.

### Trader Funding

When a desk manager funds a trader, that money becomes live ammunition.

### Deal Entry Resolution

When a trader wins, money leaves the pot.

When a trader loses, money goes into it.

That is the economic heartbeat of Margin Call.

### Withdrawing

Desk managers can pull surviving capital back out.

### Closing Deals

Deal creators can close the book on a finished trap and take what is left.
