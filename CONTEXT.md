# Margin Call — Crash

A shared-round crash game on Base Sepolia: every minute a round opens, players post tUSD margin against a confidential crash point, and settlement is publicly verifiable. This glossary is the canonical language for the product docs, contracts, and UI copy.

## Language

**Desk Dollars (tUSD)**:
The project-deployed 6-decimal testnet ERC-20 used for all margin, payouts, and LP deposits. Claimable from the in-app faucet; explicitly worthless and never presented as Circle USDC or real dollars. Mainnet intent is real Circle USDC.
_Avoid_: tUSDC, USDC, test USDC

**Arcade Leverage**:
The fixed multiplier tier a player selects at entry — exactly one of `1.25x`, `1.50x`, `2.00x`, `3.00x`, `5.00x`, or `10.00x`. It is both the automatic close threshold and the gross payout multiple.
_Avoid_: multiplier, cashout, leverage slider

**Tier**:
One of the six supported Arcade Leverage values. Tiers are the entire leverage domain; the contracts reject any other value.
_Avoid_: preset, step

**Margin**:
The `tUSD` a player posts to enter a round. Always lowercase; never the token `$CALL` or the game's name.
_Avoid_: stake, bet, wager, deposit (deposit is an LP action)

**Ticket**:
A wallet's holding in one round: margin, tier, and settlement state. One per wallet per round.
_Avoid_: position, entry (as a noun for the thing held)

**Entry**:
The act of posting margin and receiving a Ticket, and the phase in which it is allowed.
_Avoid_: bet, wager

**Crash Point**:
The verified multiplier at which a round's market dies, derived from the attested Inco reveal. Capped at `10.00x`.
_Avoid_: result, outcome, roll

**Finalize**:
A round reaching its verified Crash Point through attestation. Rounds finalize; tickets settle.
_Avoid_: resolve, complete

**Settle**:
A ticket reaching its exactly-one terminal state: claimed win, settled loss, or expiry refund. Tickets settle; rounds finalize.
_Avoid_: finalize (for tickets)

**Reservation**:
The vault's ticket-scoped hold guaranteeing a maximum payout, created atomically at entry and consumed or released at settlement.
_Avoid_: lock, hold, escrow

**Margin Call (`$CALL`)**:
The deferred LP reward token, named after the game. Roadmap-only; not part of the MVP. The intended mainnet Bankr-launched token carries the same brand.
_Avoid_: $MARGIN (retired name)

**Epoch**:
A fixed 60-second slot in the round grid, derived from immutable deployment timing. Epochs exist mathematically whether or not anyone plays them.
_Avoid_: interval, cycle

**Round**:
The onchain state materialized for one epoch — encrypted crash point, tickets, status, timing. Created lazily by the epoch's first entry or by a permissionless pre-open; an epoch nobody enters has no round.
_Avoid_: game, match

**Replay**:
The post-finalization dramatized rendering of a round's verified crash point — the climbing multiplier curve. It is derived from the attested result and never decides, changes, or gates settlement.
_Avoid_: live round, live climb
