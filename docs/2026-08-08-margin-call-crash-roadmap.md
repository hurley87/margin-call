# Roadmap: Margin Call — Crash After the Game Jam MVP

**Created:** August 8, 2026 · **Updated:** August 9, 2026 · **Status:** Deferred product direction, not an implementation commitment

The [Crash MVP PRD](./2026-08-07-margin-call-crash-prd.md) is the Game Jam scope. Its implementation is specified in the [technical design](./2026-08-08-margin-call-crash-technical-design.md). This roadmap preserves agreed future directions without inventing economics, probabilities, token utility, or launch mechanics that have not been decided. Terminology follows the canonical glossary in [CONTEXT.md](../CONTEXT.md).

## 1. Promotion rule

A roadmap item enters product scope only through a separate review that defines user value, trust and safety boundaries, contract changes, recovery behaviour, tests, and deployment plan. No roadmap item may weaken the MVP guarantees around the `tUSD` settlement asset, direct vault custody, bounded reservations, Inco result integrity, full collateralization, or permissionless recovery.

## 2. Deferred strategy modes

### Laddered tickets

A future ticket may divide total margin across up to three Arcade Leverage tiers, with each tranche settling independently against the same shared crash point. The purpose is to add an allocation decision while preserving automatic asynchronous settlement.

Before promotion, design work must settle ticket representation, capacity display, reservation of the sum of maximum tranche payouts, duplicate-tier handling, rounding, history, and tests. The Game Jam acceptance path remains a single ticket.

### Persistent desk runs

A future mode may layer a virtual trading-career score over independently settled tUSD tickets. It may support concepts such as starting equity, survival, a final margin call at zero, and leaderboards.

Virtual desk equity must remain a non-redeemable score rather than an ERC-20, debt, or representation of tUSD. Exact scoring, reset rules, and leaderboard mechanics are intentionally undecided.

### Public market regimes

A future mode may announce a public regime before entry so players can adapt their strategy to visibly different conditions. A regime cannot ship as a cosmetic label over unchanged odds. Each regime requires separately documented probability math, expected-return disclosure, caps, simulation, tests, and UI explanation before release.

No regime names, distributions, or economics are committed here.

### Confidential analyst report

A later Inco-native extension may offer an intentionally imperfect private report derived from confidential round state and selectively revealed only to its recipient before entry locks. It must never disclose the exact crash point.

This requires a separate design for access control, information leakage, accuracy disclosure, pricing or eligibility if any, attestation, and abuse resistance.

## 3. Deferred experience and analytics

### AI broker margin call and appeal

An opted-in player may eventually receive an AI-voice 1980s risk-manager call after a successfully finalized loss. A conversational appeal could be explored as a separately funded promotional experience, but it must remain independent of core entry, settlement, claims, expiry refunds, LP funds, and `$CALL` rewards.

The MVP's phone-only login (PRD §6, ADR 0008) already captures the delivery channel: the number a player logs in with is — only with explicit, separately obtained opt-in consent — the number the desk-phone experience would call. Nothing in the MVP contacts a player by phone or SMS beyond the login code.

Any implementation requires a separate product, legal, consent, privacy, abuse, reliability, funding, and contract review. No refund probability, provider, budget, or appeal mechanic is committed by this roadmap.

### Deeper analytics and expansion

Post-MVP work may explore richer player and LP analytics, longer-lived performance views, additional cadence configurations, expanded or reshaped Arcade Leverage tier sets, and other presentation improvements. Historical results must never be framed as predicting independently generated future rounds. Any cadence change requires explicit public configuration and cannot alter an active round.

## 4. Deferred LP queue and Margin Call (`$CALL`) rewards

The MVP limits LP withdrawals to free liquidity: a withdrawal that cannot fully execute reverts and the LP retries later. Two LP mechanics were fully drafted for the MVP and deferred on August 9, 2026 to keep the Game Jam contract surface small.

### Constrained FIFO withdrawal queue

Shares that cannot exit through free liquidity would enter a deterministic queue: the exact shares move into vault escrow under a monotonically increasing request ID, only the oldest live request is processable, processing is permissionless and converts at then-current share value, and an unprocessed request can be cancelled to recover the escrowed shares. The queue's purpose is to remove first-withdrawer preference during constrained liquidity. Promotion requires re-validating escrow accounting, head-of-line blocking (including whether the head may partially process), and recovery paths against the vault as actually shipped.

### Margin Call (`$CALL`) LP reward token

A capped testnet ERC-20 named **Margin Call** (symbol `$CALL`) plus a lazily updated time-weighted reward distributor would reward eligible vault shares: wallet checkpoints before every share balance change, allocation consumption paused at zero eligible supply, queued shares excluded without retroactive restoration, claims bounded by the funded allocation, and an emission rate that can only be reduced. It is not a player asset and carries no claim on tUSD, vault assets, revenue, or ownership, and must never be presented as APR or guaranteed yield.

Before promotion, decide whether the testnet `$CALL` reward ships at all or is superseded by the external ERC-20 reward funding architecture and the eventual Bankr-launched token described below.

## 5. Mainnet token direction

After the Base Sepolia Game Jam MVP, the intended mainnet reward token is an actual externally issued ERC-20 launched through **Bankr**. It is not the deferred testnet `$CALL` token and requires separate launch planning.

The future Bankr token is intended to carry the **Margin Call** brand; its supply, allocation, value, utility, governance, emissions, liquidity, and launch mechanics are undecided. This roadmap does not imply a claim on vault assets, tUSD, protocol revenue, or ownership.

Mainnet settlement is intended to use real Circle USDC; the testnet Desk Dollars (`tUSD`) token is a Game Jam stand-in and must never be deployed to mainnet.

Mainnet wagering, real-value rewards, and jurisdictional availability are also outside the MVP and require dedicated legal, security, economic, and deployment review.

## 6. Future external ERC-20 reward funding

A future rewards contract should support user-funded deposits of supported externally issued ERC-20s, including the eventual Bankr-launched token, so a user can fund reward programs when desired. The funder permission model remains part of the later safety design.

“External ERC-20 support” does not mean accepting every token without rules. A later technical design must define:

- Supported-token registration and removal
- Who may create or fund a reward program
- Accounting based on tokens actually received
- Separate balances and schedules for each reward token
- Behaviour for fee-on-transfer, rebasing, callback-capable, or otherwise unusual tokens
- Claim, pause, recovery, and stranded-token rules
- Funding limits, event history, UI disclosure, and security review
- Strict separation from tUSD bankroll assets and player liabilities

No funding permissions, reward schedules, token list, or economics are decided in this roadmap.

## 7. Testnet-only mock reward token

Before a mainnet Bankr launch, testnet reward flows may use a mintable mock ERC-20 solely for testing. The mock represents the integration shape of the future Bankr token but is not that token.

The mock token is distinct from:

- Desk Dollars (`tUSD`), the Game Jam settlement and bankroll asset
- The deferred testnet Margin Call (`$CALL`) LP reward drafted for the MVP and preserved in this roadmap
- The eventual mainnet Bankr-launched ERC-20

It has no value, redemption right, ownership claim, or implication of future allocation. Its branding, supply, mint controls, and test scenarios are decided only when the external-token reward work is designed. It must never silently replace `tUSD` in gameplay or vault accounting.

## 8. Sequencing

The current order of work is:

1. Complete and verify the Base Sepolia Game Jam MVP.
2. Validate player settlement, LP custody, and recovery under real testnet conditions.
3. Choose which deferred strategy, LP-mechanics, or experience work merits a separate specification.
4. Design the external ERC-20 rewards architecture and test it with a clearly labelled mock token.
5. Plan the actual Bankr token launch and any mainnet product only after dedicated economic, security, legal, and operational review.
