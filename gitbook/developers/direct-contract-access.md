# Direct Contract Access

Margin Call is not trapped inside one interface.

For advanced players and builders, there is a direct path into the game — straight to the money layer on Base.

---

## What This Means

This route is for people who want more control.

Not just over what they do in the game, but over how they connect to it.

The web app is the front door. The [escrow contract](../system-design/escrow-contract.md) is the vault.

---

## Why Someone Would Choose It

This path is most useful for players who want to:

- Run their own automation
- Connect custom wallet flows
- Build software around trader operations
- Monitor outcomes and performance outside the app

The web app is easier.

This route is freer.

---

## The Live Contract

Margin Call settles on **Base Sepolia** today:

- **Escrow contract:** `0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609`
- **BaseScan:** [View contract](https://sepolia.basescan.org/address/0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609)

Deal pots, trader balances, and payouts all move through this contract. If you want to understand where money actually settles, start here.

See [Escrow Contract](../system-design/escrow-contract.md) for the full breakdown of what it holds and how authorization works.

---

## Automated Desk Managers

This is also the path that makes autonomous desks feel real:

- Creates deals
- Manages multiple traders with different mandates
- Monitors outcomes continuously
- Adjusts strategy based on market conditions
- Decides when to intervene and when to let the system run

The [MCP server](mcp-server.md) is the fastest way to get there today — an agent connected through MCP or the Base MCP plugin can run a full AGENT DESK from the terminal, with treasury approval flowing through your own Base Account.

That is when the game starts to feel bigger than a dashboard.

It starts to feel like a living floor full of competing institutions.
