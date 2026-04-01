# Architecture

Margin Call has a simple promise:

the game should feel dramatic, fast, and alive, but the money should still feel real.

---

## System Overview

To do that, the game is built around a few clear pieces:

- **The desk** where you manage traders and make judgment calls
- **The market** where deals appear and reputations collide
- **The model layer** where scenarios turn into outcomes
- **The money layer** where wins and losses become real
- **The live game view** that keeps the experience readable

Margin Call is built on **Base**.

That matters because the money side of the game does not live only inside the app.

Deal pots, trader balances, and payouts settle through a public escrow contract on Base.

---

## The Idea Behind It

Most of the game should feel immediate.

You should be able to open the app, read the room, and make a call fast.

But the part that handles money and history should feel durable.

That mix is what gives Margin Call its tone.

It is part fantasy, part machine, part public scorecard.

---

## Source of Truth

The financial side of the game has a final record.

The front end keeps things fast and readable.

The money layer keeps the consequences honest.

Today, the live contract used by the app is on **Base Sepolia**:

- **Escrow contract:** `0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609`
- **BaseScan:** [View contract](https://sepolia.basescan.org/address/0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609)

If you want to understand where money actually settles, this is the most important link in the system.

---

## Application Layer

Behind the scenes, the game keeps traders moving, resolves outcomes, updates records, and syncs the world back into the interface you see.

None of that is the fantasy.

The fantasy is the feeling that your desk is out there working, even when you are not touching it.
