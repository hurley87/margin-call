# Escrow Contract

This is the part of the game that makes the consequences real.

When value moves, it moves here.

Margin Call settles money on **Base** through a single escrow contract.

The app's current public deployment is on **Base Sepolia**:

- **Contract address:** `0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609`
- **BaseScan:** [View contract](https://sepolia.basescan.org/address/0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609)

---

## What It Holds

| State               | Description                                               |
| ------------------- | --------------------------------------------------------- |
| **Deal pots**       | The capital attached to each open market opportunity      |
| **Trader balances** | The bankroll each trader can risk on the floor            |
| **Platform fees**   | The portion of economic activity retained by the platform |

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
