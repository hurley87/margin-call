# Roadmap: Margin Call — Crash After the Game Jam MVP

**Created:** August 8, 2026 · **Status:** Deferred product direction, not an implementation commitment

The [Crash MVP PRD](./2026-08-07-margin-call-crash-prd.md) is the Game Jam scope. Its implementation is specified in the [technical design](./2026-08-08-margin-call-crash-technical-design.md). This roadmap preserves agreed future directions without inventing economics, probabilities, token utility, or launch mechanics that have not been decided.

## 1. Promotion rule

A roadmap item enters product scope only through a separate review that defines user value, trust and safety boundaries, contract changes, recovery behaviour, tests, and deployment plan. No roadmap item may weaken the MVP guarantees around Circle tUSDC, direct vault custody, bounded reservations, Inco result integrity, full collateralization, or permissionless recovery.

## 2. Deferred strategy modes

### Laddered positions

A future ticket may divide total margin across up to three Arcade Leverage tiers, with each tranche settling independently against the same shared crash point. The purpose is to add an allocation decision while preserving automatic asynchronous settlement.

Before promotion, design work must settle ticket representation, capacity display, reservation of the sum of maximum tranche payouts, duplicate-tier handling, rounding, history, and tests. The Game Jam acceptance path remains a single position.

### Persistent desk runs

A future mode may layer a virtual trading-career score over independently settled tUSDC tickets. It may support concepts such as starting equity, survival, a final margin call at zero, and leaderboards.

Virtual desk equity must remain a non-redeemable score rather than an ERC-20, debt, or representation of tUSDC. Exact scoring, reset rules, and leaderboard mechanics are intentionally undecided.

### Public market regimes

A future mode may announce a public regime before entry so players can adapt their strategy to visibly different conditions. A regime cannot ship as a cosmetic label over unchanged odds. Each regime requires separately documented probability math, expected-return disclosure, caps, simulation, tests, and UI explanation before release.

No regime names, distributions, or economics are committed here.

### Confidential analyst report

A later Inco-native extension may offer an intentionally imperfect private report derived from confidential round state and selectively revealed only to its recipient before entry locks. It must never disclose the exact crash point.

This requires a separate design for access control, information leakage, accuracy disclosure, pricing or eligibility if any, attestation, and abuse resistance.

## 3. Deferred experience and analytics

### AI broker margin call and appeal

An opted-in player may eventually receive an AI-voice 1980s risk-manager call after a successfully finalized loss. A conversational appeal could be explored as a separately funded promotional experience, but it must remain independent of core entry, settlement, claims, expiry refunds, LP funds, and `$MARGIN` rewards.

Any implementation requires a separate product, legal, consent, privacy, abuse, reliability, funding, and contract review. No refund probability, provider, budget, or appeal mechanic is committed by this roadmap.

### Deeper analytics and expansion

Post-MVP work may explore richer player and LP analytics, longer-lived performance views, additional cadence configurations, and other presentation improvements. Historical results must never be framed as predicting independently generated future rounds. Any cadence change requires explicit public configuration and cannot alter an active round.

## 4. Mainnet token direction

After the Base Sepolia Game Jam MVP, the intended mainnet reward token is an actual externally issued ERC-20 launched through **Bankr**. It is not the MVP `$MARGIN` token and requires separate launch planning.

The future Bankr token's name, symbol, supply, allocation, value, utility, governance, emissions, liquidity, and launch mechanics are undecided. This roadmap does not imply a claim on vault assets, tUSDC, protocol revenue, or ownership.

Mainnet wagering, real-value rewards, and jurisdictional availability are also outside the MVP and require dedicated legal, security, economic, and deployment review.

## 5. Future external ERC-20 reward funding

A future rewards contract should support user-funded deposits of supported externally issued ERC-20s, including the eventual Bankr-launched token, so a user can fund reward programs when desired. The funder permission model remains part of the later safety design.

“External ERC-20 support” does not mean accepting every token without rules. A later technical design must define:

- Supported-token registration and removal
- Who may create or fund a reward program
- Accounting based on tokens actually received
- Separate balances and schedules for each reward token
- Behaviour for fee-on-transfer, rebasing, callback-capable, or otherwise unusual tokens
- Claim, pause, recovery, and stranded-token rules
- Funding limits, event history, UI disclosure, and security review
- Strict separation from tUSDC bankroll assets and player liabilities

No funding permissions, reward schedules, token list, or economics are decided in this roadmap.

## 6. Testnet-only mock reward token

Before a mainnet Bankr launch, testnet reward flows may use a mintable mock ERC-20 solely for testing. The mock represents the integration shape of the future Bankr token but is not that token.

The mock token is distinct from:

- Circle tUSDC, which remains the Game Jam settlement and bankroll asset
- MVP `$MARGIN`, the fixed testnet LP reward described by the MVP
- The eventual mainnet Bankr-launched ERC-20

It has no value, redemption right, ownership claim, or implication of future allocation. Its branding, supply, mint controls, and test scenarios are decided only when the external-token reward work is designed. It must never silently replace Circle tUSDC in gameplay or vault accounting.

## 7. Sequencing

The current order of work is:

1. Complete and verify the Base Sepolia Game Jam MVP.
2. Validate player settlement, LP custody, reward accounting, and recovery under real testnet conditions.
3. Choose which deferred strategy or experience work merits a separate specification.
4. Design the external ERC-20 rewards architecture and test it with a clearly labelled mock token.
5. Plan the actual Bankr token launch and any mainnet product only after dedicated economic, security, legal, and operational review.
