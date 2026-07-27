# Margin Call

A fixed-price Pack-ripping game on Robinhood Chain: creators permissionlessly fund Packs of tokenized stocks, and Traders rip one Pack per hourly window at a fixed price, selected uniformly at random.

## Language

**Pack**:
A transferable ERC-721 backed by a recorded basket of approved Stock Tokens, held in protocol custody until unwrapped.
_Avoid_: box, crate, bundle, loot box

**Rip**:
The single, settled act of a Trader paying the Rip Price and receiving one uniformly-selected eligible Pack. A Rip settles exactly once.
_Avoid_: open, buy, pull, draw

**Rip Price**:
The fixed stablecoin price a Trader pays per Rip in a given Pool. Initial configuration: $25.
_Avoid_: entry fee, ticket price

**Trader**:
A transferable ERC-721 identity that executes at most one Rip per hourly window in its assigned Pool; its budget and portfolio are protocol custody keyed to the token, so transfer carries both. In V1 it is clockwork automation, not an autonomous agent.
_Avoid_: agent, bot

**Desk Manager**:
The human owner of a Trader who funds, configures, enables, and pauses it. Makes every discretionary choice the Trader cannot.
_Avoid_: player, user, owner

**Creator**:
Any participant who mints and fully funds a Pack. Permissionless; no allowlist.
_Avoid_: supplier, issuer

**Pool**:
A named tier with one stablecoin, one fixed Rip Price, published USD NAV bounds, and approved Stock Token rules. Selection happens within one Pool.
_Avoid_: tier (as a standalone term), market

**Eligible Set**:
The Packs in a Pool that pass all objective checks (funding, asset rules, oracle freshness, NAV bounds, anti-spam) at a checkpoint and can therefore be selected. Uniform odds apply across this set only.
_Avoid_: inventory, supply

**Selection-Eligible vs Emission-Eligible**:
Two distinct states. A Pack is selection-eligible while its NAV is within Pool bounds ($15–$100 initial). It is emission-eligible only while its NAV is at or above the Rip Price ($25 initial). A $18-NAV Pack can be ripped but accrues no creator emissions.

**Creator Emissions**:
The 15% game-token allocation paid pro rata (NAV × eligible time) to emission-eligible Packs over the launch season. The explicit subsidy for stocking above-price outcomes; never a return promise.
_Avoid_: yield, rewards (reserve "rewards" for participation)

**Participation Rewards**:
The separate 15% game-token allocation shared among confirmed qualifying Rips per fixed epoch pot. Always below the disclosed game cost.
_Avoid_: cashback, rebate

**Game Token**:
The fixed-supply (1B) ERC-20 earned through Creator Emissions and Participation Rewards. Transfer-locked at launch; carries no selection weight, cadence benefit, or redemption right.
_Avoid_: points, currency

**NAV**:
The USD value of a Pack's recorded basket computed from approved Chainlink feeds at a checkpoint. Display/eligibility input only — custody accounting is raw token units.
_Avoid_: price, value (unqualified)

**Stock Token**:
A Robinhood-issued tokenized-stock ERC-20 on the approved whitelist, resolved from Robinhood's canonical contract registry.
_Avoid_: stock, equity, asset (unqualified)

**Checkpoint**:
A defined hourly-epoch boundary or Pack interaction (Rip, top-up, claim) where fresh oracle data re-evaluates eligibility. Stale or invalid data fails closed.
_Avoid_: refresh, sync

**Season**:
The finite 15-day launch-emission period. V1 is exactly one Season (August 4–19, 2026): when it ends, emissions and selection stop, and redemption rights remain.
_Avoid_: launch period, phase

**Desk Grant**:
The one-time $50 mock-stablecoin deposit a new account receives at desk creation, plus its rate-limited in-app refill. Testnet-only onboarding, not a game reward.
_Avoid_: airdrop, faucet (reserve "faucet" for Robinhood's official Stock Token faucet)

**Pool Statistics**:
The live published stats of a Pool's Eligible Set (Pack count, mean/median NAV, NAV distribution). The demand-side defense against floor-flooding — transparency instead of unenforceable supply caps.
_Avoid_: pool health, pool quality

**Claim Root**:
The per-epoch merkle root of off-chain-computed emission and reward entitlements, posted on-chain and reproducible by anyone from confirmed records.
_Avoid_: payout snapshot

**House**:
The operator of selection and scheduling infrastructure. Can affect liveness; can never alter custody, price, odds, or block the disclosed exit.
_Avoid_: admin, protocol (when meaning the operator)
