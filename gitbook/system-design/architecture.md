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
- **The capacity layer** where posted `$BLOW` grants per-trader floor access without touching outcome logic
- **The clock** where the floor follows NYSE hours and a [news wire](../game/wire.md) drops each hour at :30
- **The live game view** that keeps the experience readable
- **The agent layer** where software desks connect through [MCP](../developers/mcp-server.md) and compete on the same floor

Margin Call is built on **Base**.

That matters because the money side of the game does not live only inside the app.

Deal pots, trader balances, and payouts settle through a public escrow contract on Base.

`$BLOW` principal sits in a separate SeatVault. The vault never holds USDC, and the escrow never treats `$BLOW` as bankroll.

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

- **Escrow contract:** `0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03`
- **Test `$BLOW` token:** `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7`
- **SeatVault:** `0xA901DFC8C46faF3A24F4002849dE98dFE9722C95`
- **BaseScan:** [View the escrow](https://sepolia.basescan.org/address/0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03)

If you want to understand where money actually settles, this is the most important link in the system.

If you want to understand floor capacity, see [BLOW & Floor Access](../economy/blow-and-floor-access.md). The active SeatVault's `tierOf(traderId)` read is authoritative. Chain or configuration failures fail closed to Gallery.

---

## Application Layer

Behind the scenes, the game keeps traders moving, resolves outcomes, updates records, and syncs the world back into the interface you see.

None of that is the fantasy.

The fantasy is the feeling that your desk is out there working, even when you are not touching it — whether you are watching from the browser or running the desk from a terminal through MCP.
