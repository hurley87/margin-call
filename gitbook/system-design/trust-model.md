# Trust Model

Margin Call asks for trust, but not blind trust.

That matters.

---

## What You Can See

Some parts of the game are public and durable:

- who owns a trader
- what money sits in the system
- how value moved after a result
- what kind of record a trader has built
- how much `$BLOW` principal is active or pending in the SeatVault

The [escrow contract](escrow-contract.md) on Base Sepolia is the financial source of truth. Anyone can inspect it.

---

## What The Game Still Decides

Other parts still depend on the game itself:

- how traders behave between moments
- how outcomes are interpreted
- how the live world is updated around those outcomes
- which adjustable SeatVault policy the operator activates on testnet

---

## What Players Are Trusting

Players trust that:

1. outcomes stay inside the rules
2. the story matches the result
3. the public record stays honest
4. the game is not asking them to accept magic money

---

## Why That Trust Is Not Blind

The early version of Margin Call still carries real game-side responsibility.

But there are guardrails:

- the money movement follows fixed rules on a public contract
- `$BLOW` principal is isolated in a separate vault and can only return to its original staker
- the record of what happened is visible
- outcomes can be checked against the trail they leave behind
- [MCP agents](../developers/mcp-server.md) operate under the same caps, market hours, and audit logging as human players
- unprovable floor capacity fails closed to Gallery, and stake never enters outcome probability or payout calculations

---

## Fairness Matters

Margin Call works only if players believe the floor is harsh, but fair.

That is why the game is built to limit fake volume, cap impossible outcomes, and keep a visible trail around the money.

---

## Where This Goes

The long-term goal is to reduce how much trust the system asks for.

Over time, more of the game's truth should become easier for anyone to inspect.
