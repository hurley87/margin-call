# Margin Call: The Game Token

**Status:** Draft for review  
**Target:** Robinhood Chain testnet, then mainnet with canonical Stock Tokens  
**Version:** 0.1  
**Date:** July 26, 2026

## Release boundary

This PRD reverses the "no game token" exclusion in [`docs/prd-margin-call-floor.md`](./prd-margin-call-floor.md), which lists "a game token, staking, cycle-speed purchases, resting-order tiers, buy-and-burn, Morpho yield, supplier APY claims, and monetary leaderboard rewards" as out of scope.

It is a companion to a **permissionless Pack economy** in which any Desk Manager wraps real Stock Tokens into a transferable Pack and other players pay to receive one at random, rather than the single House-operated Window with allowlisted Suppliers described in the Floor PRD. Where the two documents conflict on supply, this one governs the token and assumes the Pack model. The Floor PRD continues to govern custody, the secondary Offer Book, acquisition accounting, the Wire, and the Robinhood-only network boundary.

Prior art in this repository is load-bearing and should be reused rather than rebuilt:

- [`contracts/src/SeatVault.sol`](../contracts/src/SeatVault.sol) — staking against an id for tiers, with two-phase unstake, cooldown, pause, and two-step ownership. Covered by unit, fuzz, invariant, e2e, and integration suites.
- [`convex/seatVault/`](../convex/seatVault/) and [`convex/agent/capacity.ts`](../convex/agent/capacity.ts) — tier indexing, reconciliation, and capacity-aware agent scheduling.
- [`docs/trader-fuel-token.md`](./trader-fuel-token.md) — the shipped `$BLOW` capacity token policy and its invariants.

[`contracts/src/MarginCallToken.sol`](../contracts/src/MarginCallToken.sol) is **not** reusable. It is a thirteen-line ERC-20 with an unpermissioned public `mint()` and no supply cap, commented "Test / Sepolia capacity token." It must be replaced.

## Problem Statement

The Floor as specified has one House-operated Window, allowlisted Suppliers, and no token. Two things break under that design.

Supply is capped by business development. Suppliers are onboarded one at a time, they are asked to lock inventory behind a junior surplus claim with a delayed exit, and the PRD forbids describing the return. Total value locked becomes a function of how many partners the House signs rather than how many participants the market attracts.

More fundamentally, **the rip is negative expected value in equity terms and always will be.** A ripper pays a price above the expected value of what they receive. That gap is what pays the creator and the protocol, and it is the only thing that makes supply rational. It is not a flaw to be engineered away. But a game whose sole economic output to participants is a disclosed loss has no way to reward early supply before rip flow exists, no way to retain participants through variance, and no link between protocol revenue and anything a participant can hold.

A permissionless Pack market introduces a fourth problem that does not exist in the Window model. When anyone can create a Pack, the scarce resource is no longer inventory — it is **selection weight**. Something has to meter it, or the pool degenerates into spam.

The design must solve all four without claiming yield, without promising the token has value, and without creating a subsidy that makes wash trading profitable.

## Solution

Introduce a fixed-supply ERC-20 on Robinhood Chain with four functions and no revenue distribution.

**It meters selection weight.** Creators stake against a Pack to raise its selection weight within a published, bounded multiplier band. Staking buys distribution frequency only. It cannot change a Pack's contents, its oracle NAV, or what a ripper receives on unwrap, and every Pack's weight multiplier and independently verifiable NAV are displayed before a rip. This is a deliberate departure from a shipped invariant and is treated separately below.

**It bootstraps supply.** Creators earn emissions proportional to TVL-seconds of _unripped_ Pack inventory valued at oracle. This pays for locked equity directly and tapers as real rip flow takes over.

**It rebates rippers.** Every rip mints to the ripper in proportion to rip spend. This is a disclosed participation rebate, not a return, and it is bounded by a hard invariant so it can never make self-dealing profitable.

**It meters agent capacity.** Staking unlocks agent cycle tiers through the existing SeatVault, unchanged in mechanism.

Value accrual is mechanical and unpromised. Protocol fees are collected in real Stock Tokens — a rip fee in basis points, an unwrap fee in raw underlying units, and a secondary settlement fee. A governance-set share of that revenue funds open-market buyback and burn; the remainder is retained as protocol-owned equity. There is no fee distribution to stakers, no staking yield, and no APY surface anywhere in the product.

Emissions are disciplined by one rule that makes a death spiral structurally impossible: **emissions in any epoch cannot exceed a multiple of the previous epoch's realized fee revenue.** A protocol with no revenue emits nothing.

## Conflict with the shipped `$BLOW` invariant

[`docs/trader-fuel-token.md`](./trader-fuel-token.md) states the shipped invariant plainly:

> **Stake affects capacity, never outcome probability.**

Weight staking violates it. A creator who stakes makes their Pack more likely to be selected, which changes the distribution of outcomes a ripper faces. Calling this "distribution" rather than "odds" would be a rebrand, not a defense.

The departure is proposed deliberately, because in a permissionless market selection weight is the only scarce resource worth metering, and leaving it unmetered invites spam. It is bounded by four mitigations:

1. The multiplier is bounded within a published band and applies to selection frequency only.
2. Every Pack's exact contents, oracle NAV, staked amount, and current multiplier are visible before payment. The ripper knows the full distribution they are buying into; only the draw is unknown.
3. Staking never changes contents, unwrap output, or fees. The equity floor under every Pack is invariant to all token state, including during pause.
4. The house edge is published as an explicit number rather than implied.

Agent capacity staking through SeatVault preserves the original invariant unchanged and is unaffected by this departure.

**This is the single decision in this document most worth rejecting.** If review concludes that outcome-probability neutrality is non-negotiable, the fallback is to meter Pack listings by a flat creation fee or a staked-deposit requirement that grants no weight advantage, at the cost of losing the primary demand sink for the token.

## User Stories

### Creators and supply

1. As a Pack Creator, I want to earn tokens proportional to the oracle value and duration of unripped inventory I have locked, so that supplying equity is rewarded before rip flow can pay me.
2. As a Pack Creator, I want emissions to stop accruing the moment my Pack is ripped, so that I cannot farm rewards by cycling inventory through myself.
3. As a Pack Creator, I want to stake against a Pack to raise its selection weight, so that I can compete for rip flow without changing what I am offering.
4. As a Pack Creator, I want the weight multiplier to be bounded and published, so that staking is a distribution advantage rather than a hidden edge over rippers.
5. As a Pack Creator, I want unstaking to require a cooldown, so that weight cannot be rented for a single block.
6. As a Pack Creator, I want my staked position released without penalty when my Pack is ripped, so that capital is not trapped by a position that no longer exists.

### Rippers

7. As a Ripper, I want the expected value of a rip published as an explicit house edge, so that I am choosing to pay a premium rather than being misled about one.
8. As a Ripper, I want each Pack's contents, oracle NAV, staked amount, and weight multiplier visible before I pay, so that the only unknown is which Pack I receive.
9. As a Ripper, I want to receive tokens proportional to my rip spend, so that participation is rebated even when a specific rip goes against me.
10. As a Ripper, I want the rebate described as a rebate and never as a return, yield, or expected profit, so that the product does not make a claim it cannot support.
11. As a Ripper, I want no rebate accrual on Packs created by my own Desk, so that the emission cannot be farmed by self-dealing.
12. As a Ripper, I want to unwrap any Pack I receive at any time for its contents less the unwrap fee, so that the token has no bearing on my hard floor.

### Agents

13. As a Desk Manager, I want staked principal to unlock agent cycle tiers through the existing SeatVault, so that automation throughput is metered by committed capital.
14. As a Desk Manager, I want tier changes to apply to scheduling without restarting or reconfiguring my agents, so that capacity is continuous.
15. As a Desk Manager, I want a Trader transfer to invalidate the prior owner's tier claim, so that staked capacity does not survive an ownership change unverified.

### Emissions and treasury

16. As a participant, I want a fixed total supply with a published allocation and vesting schedule, so that dilution is knowable in advance.
17. As a participant, I want per-epoch emissions capped as a multiple of the prior epoch's realized fee revenue, so that the protocol cannot emit into a dead market.
18. As a participant, I want emissions forgone under that cap to be permanently unissuable, so that a slow epoch reduces total supply rather than deferring it.
19. As a participant, I want protocol fee revenue collected in real Stock Tokens, so that revenue is denominated in the asset the game is about.
20. As a participant, I want the buyback and burn share of revenue to be a published mechanical policy rather than a discretionary action, so that treasury behavior is predictable.
21. As a participant, I want the retained share of fees to accumulate as protocol-owned equity, so that revenue also builds TVL.
22. As the House, I want the buyback and retention split to be versioned configuration, so that the trade-off between token buy pressure and equity retention can be tuned with data.

### Safety and honesty

23. As the House, I want the value of tokens emitted per rip to be provably less than the rake paid on that rip, so that wash trading is unprofitable by construction rather than by detection.
24. As the House, I want no staking rewards, no fee sharing, and no yield language anywhere in the contracts or the product, so that the token's utility is access and metering only.
25. As the House, I want the testnet token to be explicitly valueless and visibly labelled, so that a testnet deployment cannot be mistaken for a live economy.
26. As an auditor, I want total emitted supply, per-epoch caps, burn totals, staked principal, and treasury holdings reconcilable from onchain events alone, so that supply claims are verifiable.

## Implementation Decisions

### Token

- Fixed maximum supply set at deployment and not increasable. No owner mint.
- Minting authority is a single non-upgradeable Emitter contract enforcing the epoch schedule and the revenue cap. No other address can mint.
- Burn is permissionless and irreversible. Treasury buyback burns through the same path.
- Allocation is published at deployment across supply mining, rip rebates, treasury, and contributors, with contributor and treasury tranches on a cliff and linear vest. Exact percentages are versioned configuration decided before mainnet, not protocol constants.
- `MarginCallToken.sol` is replaced entirely. Its unpermissioned public `mint()` and absent cap disqualify it from any economic role.

### Emissions

- Time is divided into fixed epochs. The schedule defines a declining maximum issuance per epoch.
- Actual issuance is `min(scheduled_n, k × realized_fee_revenue_{n-1})`, where revenue is valued at oracle in a common unit and `k` is a governance-set multiple that declines on a published schedule. Starting hypothesis: `k = 3.0`.
- Any difference between scheduled and actual issuance is permanently forgone. It does not roll forward. This gives the supply curve a deflationary bias in weak epochs and removes any incentive to stall.
- Supply mining accrues on TVL-seconds of unripped Pack inventory at oracle value. Accrual stops at rip, unwrap, or delist.
- Rip rebates accrue per rip in proportion to rip spend, subject to the wash-trade invariant, with a per-address per-epoch ceiling.
- Rebates vest on a short cliff. A ripper who unwraps immediately keeps their equity floor but forfeits unvested rebate.

### The wash-trade invariant

This is the load-bearing safety property and should be treated as a protocol invariant, not a heuristic.

> For every rip, the oracle-referenced value of tokens emitted to the ripper must be strictly less than the rake paid on that rip.

If it holds, ripping your own Pack is unprofitable regardless of volume, because the rake is a real cost and the rebate can never exceed it. This is materially stronger than the Floor PRD's position, which concedes it cannot prevent suspicious trading and can only discount it in leaderboard scoring.

Enforcement is an oracle-referenced cap on the emission rate, recomputed each epoch. This introduces a dependency on a token price reference. On testnet, and in any epoch where the reference is stale or unavailable, the rate falls back to a conservative governance-declared floor. **The invariant fails closed.**

Same-Desk exclusion, already specified for fills in the Floor PRD, additionally applies to rebate accrual: no rebate is earned ripping a Pack your own Desk created.

### Staking and weight

- Pack weight staking is a new vault. Agent capacity staking reuses `SeatVault.sol` and its Convex indexing unchanged.
- The weight multiplier is bounded — starting hypothesis 1.0x to 2.5x — and is a pure multiplier on selection probability. It never alters Pack contents, oracle NAV, unwrap output, or fees.
- Every Pack's current multiplier, staked amount, contents, and NAV are displayed before a rip.
- Unstaking follows the SeatVault pattern: initiate, cooldown, complete. A repeated initiate does not extend an open cooldown. Starting hypothesis for cooldown is seven days.
- Weight stake is released without cooldown when the backing Pack is ripped.

### Fees and treasury

- Rip fee in basis points on rip price. Unwrap fee in raw underlying units. Secondary settlement fee in the quote asset. All three are collected in real assets, never in the game token.
- Revenue splits by a versioned parameter into a buyback tranche and a retention tranche. Starting hypothesis 50/50.
- The buyback tranche swaps to the token on a published venue and burns. Execution is scheduled and rate-limited, not discretionary.
- **Trade-off to hold explicitly:** the buyback tranche is Stock Token sell volume, which cuts against the volume objective, while the retention tranche grows protocol-owned equity but creates no buy pressure. The split is the dial between those two and should be tuned with data rather than fixed by conviction.
- Treasury holdings, buyback execution, and burn totals are published and reconcilable from events.

### What the token deliberately does not do

- No staking rewards, no fee distribution, no revenue share, no APY, no "real yield." Utility is access, weight, and capacity.
- No governance over custody rules, Pack contents, or fee ceilings in v1. Parameters change through the same closed-Window, versioned-configuration discipline the Floor PRD establishes.
- No effect on unwrap output. The equity floor under every Pack is independent of token state in all conditions, including pause.
- No requirement to hold the token to rip, create a Pack, or unwrap.

## Testing Decisions

- Follow the LazerForge Foundry conventions already adopted for the Floor: pinned compiler, deterministic block state, metadata-free builds, named profiles, CI fuzzing at 1,024 or more cases, and committed gas snapshots.
- `SeatVault.t.sol`, `SeatVault.fuzz.t.sol`, and `SeatVault.invariant.t.sol` are direct prior art for the weight vault. Extend rather than rewrite.
- Invariant campaigns must prove: total minted never exceeds the cap; per-epoch issuance never exceeds `min(schedule, k × prior revenue)`; forgone issuance is unrecoverable; rebate value per rip is always below rake paid; staked principal is always fully withdrawable after cooldown; weight multipliers stay within the published band; and Pack unwrap output is invariant to all token state.
- Fuzz across epoch boundaries, zero-revenue epochs, stale token price references, concurrent stake and unstake, rip during cooldown, and a Pack ripped while weight-staked.
- Adversarial tests must prove self-dealing is unprofitable at arbitrary volume, that a creator cannot farm supply mining by ripping their own inventory, and that an emission-rate oracle failure fails closed to the conservative floor rather than open.
- Convex tests cover epoch accounting idempotency, rebate vesting, tier reconciliation on Trader transfer, and that no product surface renders yield or APY language.

## Out of Scope

- Mainnet token launch, liquidity provisioning, listings, market making, and any price or value claim.
- Fee sharing, staking yield, revenue distribution to holders, and vote-escrow lockup multipliers.
- Governance over custody, contents, or fee ceilings.
- Buying odds, buying NAV, buying information, or any token mechanic that changes what a ripper receives after selection.
- Cross-chain deployment, bridging, and non-Robinhood-Chain venues.
- Retroactive airdrop to legacy Base desks, deals, or `$BLOW` positions.

## Further Notes

The `$BLOW` naming in [`gitbook/economy/blow-and-floor-access.md`](../gitbook/economy/blow-and-floor-access.md) and `docs/trader-fuel-token.md` is inconsistent with the `MARGINCALL` symbol in the deployed contract. Pick one before deployment.

The single most important number in this document is `k`, the revenue multiple on emissions. It is what separates this design from every game token that emitted its way into a death spiral. Set it conservatively, decline it on a published schedule, and never raise it in response to weak demand — a protocol that emits harder when revenue falls is the exact failure mode this rule exists to prevent.

The wash-trade invariant is the strongest claim here and the one most worth attacking in review. If it holds, the leaderboard integrity concerns the Floor PRD concedes it cannot solve become largely moot on the token dimension, because the subsidy an attacker would farm is bounded below the cost of farming it.

The rip being negative expected value is stated deliberately and should never be softened in product copy. The honest description of this economy is that Pack creators distribute equity at a premium to spot and rippers pay that premium for entertainment and a bounded rebate. That is a real business, it is what gacha has always been, and it drives the metric the product cares about: Stock Tokens moving from existing holders to new holders, continuously, with the creator side buying on the open market to restock.
