# Eligibility and participation changes commit at window boundaries

The emission gate (ADR-0002) pays creators to stock Packs above the Rip Price, so pools are designed to spend time at positive expected value — and any script reacting to on-chain NAV inside a window will enable its Traders for exactly those windows, leaving manual players the negative-EV ones. On the supply side, a creator can accrue emissions at high NAV and delist moments before Rip execution, farming the subsidy while dodging the selection risk it pays for. Both are latency games against intra-window state changes.

Decision: every hourly window executes against a set frozen at its opening boundary, extending ADR-0001's frozen-set draw from the draw instant to the whole window. Trader enable, pause, and pool changes take effect at the next boundary, and a Trader enabled and funded at the boundary is committed to that window's Rip — a later pause bounds further exposure to at most one Rip Price. Listings and top-ups join selection at the next boundary; mid-window checks can only remove a Pack fail-closed, never add one. Emission accrual counts only epochs a Pack was selectable throughout: delist stays available at any moment — the exit right is never delayed — but forfeits the current epoch's accrual and drops the Pack from the frozen set. Latency stops being an edge; scripts and humans alike play one window ahead of the tape, which makes reading Pool Statistics intended gameplay rather than an exploit.

## Considered Options

- Immediate effects plus enable/pause cooldowns — rejected: a sniper's goal is missing negative-EV windows, so sitting out is not a cost
- Hiding or delaying Pool Statistics — rejected: pool composition is on-chain and scripts recompute it directly
- Randomizing Rip execution timing within the window — rejected: scheduler complexity without removing the react-to-state edge that boundary commitment removes
