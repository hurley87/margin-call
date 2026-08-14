# Glossary

Player-facing language for Margin Call Crash. If a word is not here, the Floor probably should not say it.

---

**Desk Dollars (`tUSD`)**
The project-deployed 6-decimal testnet ERC-20 for Margin, payouts, and LP deposits. Claimable from the faucet. Explicitly worthless. UI ticker shows as `USDC`; onchain symbol remains `tUSD`. Never presented as Circle USDC.

**Arcade Leverage**
The fixed Tier you select at entry — exactly one of `1.25x`, `1.50x`, `2.00x`, `3.00x`, `5.00x`, or `10.00x`. Automatic close threshold and gross payout multiple.

**Tier**
One of the six Arcade Leverage values. The entire leverage domain.

**Margin**
The Desk Dollars you post to enter a Round. Always lowercase. Never the token `$CALL` and never the game's name.

**Ticket**
A wallet's holding in one Round: Margin, Tier, and settlement state. One per wallet per Round.

**Entry**
The act of posting Margin and receiving a Ticket, and the phase when that is allowed.

**Crash Point**
The verified multiplier at which a Round's market dies, from the attested Inco reveal. Capped at `10.00x`.

**Finalize**
A Round reaching its verified Crash Point through attestation. Rounds finalize; Tickets settle.

**Settle**
A Ticket reaching exactly one terminal state: claimed win, settled loss, or expiry refund. Tickets settle; Rounds finalize.

**Reservation**
The vault's Ticket-scoped hold guaranteeing a maximum payout, created at entry and consumed or released at settlement.

**Reveal-Window Freeze**
Vault-wide pause on LP share operations while an exposed Round's outcome is publicly knowable but not yet priced into shares. Entries and later Rounds continue.

**Margin Call (`$CALL`)**
Deferred LP reward token named after the game. Roadmap-only — not part of the live MVP.

**Epoch**
A fixed 60-second slot on the Round grid. Exists mathematically whether or not anyone plays it.

**Round**
Onchain state for one Epoch — encrypted Crash Point, Tickets, status, timing. Created lazily by first entry or permissionless pre-open.

**Replay**
Post-finalization dramatized climb of the verified Crash Point. Derived from the attested result. Never decides, changes, or gates settlement.
