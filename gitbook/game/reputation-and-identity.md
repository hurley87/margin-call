# Reputation & Identity

In Margin Call, identity is not an ornament. It is part of the strategic economy.

---

## Persistent Identity

Each trader has an identity that sticks.

The point is not the tech.

The point is permanence.

If a trader becomes feared, admired, or embarrassing, that history stays attached to them.

Together, they give each trader:

- A name and visual identity
- A wallet that can hold value
- A public in-game performance history
- NFT-standard identity that can support future portability

---

## How Reputation Works

After every deal resolution, Convex updates the trader's visible game history. The current profile derives:

| Field           | Description                                             |
| --------------- | ------------------------------------------------------- |
| **Score**       | `max(0, wins × 3 − losses − wipeouts × 5)`              |
| **Wins/losses** | Counts derived from settled trader P&L                  |
| **Win rate**    | Wins divided by all recorded outcomes                   |
| **Wipeouts**    | Outcomes that mechanically reduced the bankroll to zero |
| **Total P&L**   | Sum of the trader's recorded net results                |

The trader identity NFT is on-chain. The performance record shown by the current product is a Convex-backed game read model; outcomes are not currently posted to the ERC-8004 Reputation Registry.

That distinction matters: public in-game history is available today, while fully on-chain outcome reputation remains future integration work.

---

## Reputation Records Outcomes

Trader reputation is public evidence of what has already happened.

- wins, losses, and wipeouts remain visible
- other desks can use that history when judging a trader or its owner
- the record persists with the trader identity

Reputation does **not currently modify the mechanical win probability**. The game computes each win/loss from market mood and SEC heat before the model writes the narrative. Reputation is tracked and displayed, not fed into that roll.

The same firewall applies to [`$BLOW` floor access](../economy/blow-and-floor-access.md): credentials change capacity, never outcome probability.

---

## The Reputation Flywheel

Reputation changes how the whole market sees you:

1. winning makes a trader look sharper
2. sharper traders become more valuable
3. valuable traders become better targets
4. a public failure hurts more when everyone was watching

This flywheel is counterbalanced by [Anti-Snowball Mechanics](../economy/anti-snowball.md) that ensure advantage creates exposure.

---

## Portability Is Future Work

Margin Call does not currently ship a marketplace or supported trader-transfer flow.

The NFT and its public identity can be transferred at the protocol level, but current game control also depends on application ownership, escrow depositor authority, and wallet bindings. Those do not automatically migrate through an unsupported marketplace transfer.

Any future marketplace must specify how the following behave:

- application control and mandate configuration
- escrow bankroll and depositor reassignment
- carried assets and pending approvals
- active or pending `$BLOW` principal
- persistent identity, portrait, and reputation history

---

## Why This Matters

The on-chain identity gives the future marketplace something durable to build around. Until that workflow ships, the docs do not treat NFT transfer as equivalent to transferring a playable trader.

They are not disposable save files.

They are market characters with memory.
