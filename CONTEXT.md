# Margin Call

A Pack-ripping game on Robinhood Chain: creators permissionlessly fund Packs of tokenized stocks, and Traders rip one Pack per hourly window. Packs are drawn with probability inversely weighted by NAV, and the Rip price tracks the expected value of the draw — the harmonic mean of the eligible set's NAVs plus a surcharge.

## Language

**Pack**:
A transferable ERC-721 backed by a recorded basket of approved Stock Tokens, held in protocol custody until unwrapped.
_Avoid_: box, crate, bundle, loot box

**Rip**:
The single, settled act of a Trader paying the Rip Price and receiving one Pack drawn from the eligible set with odds inversely weighted by NAV (`weight ∝ 1/NAV^alpha`). A Rip settles exactly once.
_Avoid_: open, buy, pull

**Rip Price**:
The stablecoin price a Trader pays per Rip in a given Pool. By default dynamic: `harmonic_mean(eligible NAVs) × (1 + surcharge)` — the expected value of the draw plus the house edge. Bounded to `[minPackNav, poolMax] × (1 + surcharge)`, where `minPackNav` is the owner-set NAV floor (`setMinPackNav`) that serves as both price floor and dust guard. A fixed price is a valid Pool configuration.
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
A named tier with one stablecoin, a pricing rule (dynamic harmonic-mean + surcharge by default, or fixed), published USD NAV bounds, and approved Stock Token rules. Selection happens within one Pool.
_Avoid_: tier (as a standalone term), market

**Eligible Set**:
The Packs in a Pool that pass all objective checks (funding, asset rules, oracle freshness, NAV bounds, non-frozen asset) at a checkpoint and can therefore be selected. Frozen at each window's opening boundary; mid-window checks can only remove a Pack, never add one. Draw odds across this set are inversely weighted by NAV (`weight ∝ 1/NAV^alpha`).
_Avoid_: inventory, supply

**Asset Registry**:
The owner-controlled whitelist of approved Stock Tokens. Per asset: token address, TWAP price feed, staleness bound, status (Active/Frozen/Delisting), and live inventory. The owner can add assets, remove them (only at zero inventory), and freeze them; a frozen asset leaves both the selection weight set and the price basket until unfrozen.
_Avoid_: allowlist (as a standalone term)

**Creator Emissions**:
The game-token allocation streamed to Creators for providing inventory, shaped as a restock controller: each epoch's budget is weighted toward the assets the pool is depleting (`∝ gap^convexity`, then `÷ inventory`), so replenishment holds the draw distribution near its owner-set target. A Creator's return, alongside a pro-rata share of acquisition fees; never a return promise.
_Avoid_: yield

**Game Token**:
The fixed-supply ERC-20 earned through Creator Emissions (the restock controller). Transfer-locked at launch; carries no selection weight, cadence benefit, or redemption right. Ticker is an open branding decision.
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

**Window Commitment**:
The rule that participation and eligibility changes (Trader enable/pause/pool changes, Pack listings and top-ups) take effect at the next window boundary, so each window executes against a frozen state and reaction latency is never an edge. Delist is the exception: available anytime, at the cost of the current epoch's accrual.
_Avoid_: lock-in, cooldown

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
