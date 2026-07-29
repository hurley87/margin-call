# Margin Call: NAV-Weighted Pack Rip

- **Status:** Draft for review
- **Version:** 2.0
- **Target:** Robinhood Chain testnet
- **Date:** July 29, 2026
- **Supersedes:** v1.0 of this document. v2.0 collapses the inherited "AI trader agent" apparatus — clockwork Traders, Desk Managers, hourly windows, Seasons, and multi-Pool tiers are all removed — and pins the economic model (settlement, fees, price floor) through a design interview. The custody, curated-whitelist, additions-only, zero-fee-exit, and trusted-peg invariants carry forward. `CLAUDE.md` still describes the older agent concept and is a downstream doc to reconcile.

Domain terms are defined in the repo glossary, [`CONTEXT.md`](../CONTEXT.md), maintained alongside this document.

## Product decision

Margin Call is a Pack-ripping game with **one global pool** and **one kind of participant — a user**, who can act as a **Maker** (create Packs) or a **Taker** (rip Packs), or both. The value inside a Pack is the only thing the game reads: a Maker deposits a basket of approved tokenized-stock ERC-20s, and the Pack's USD NAV drives how often it is drawn, what a Rip costs, and how the game token is emitted. There is no ETH or separate "backing" pile — collapsing value and collateral into one number (NAV) is what lets contents set both the odds and the price.

**Selection is inversely weighted by NAV** (`weight ∝ 1/NAV^α`): cheap Packs are drawn often, rich Packs rarely. **A Rip costs the expected value of the draw** — the harmonic mean of the eligible Packs' NAVs, plus a surcharge — computed **live at the moment of the Rip**. Because the harmonic mean _is_ the expected NAV of the inverse-NAV draw, a Rip is a fair bet minus the surcharge: **every Rip is −surcharge in expectation**, always. That single fact removes the need for windows, cooldowns, and rip-rate limits — there is no transient positive-EV state to snipe, and a bot that rips forever simply burns the rake.

This is a **maker–taker market**. Takers remove liquidity (rip a Pack out of the pool) and pay the surcharge; **Makers provide liquidity and earn it.** The full Rip payment is socialized across the resting Packs at an **equal rate per Pack** (settlement Model A), so a Maker is made whole in real stablecoin regardless of what their Pack holds — no adverse selection, and no dependence on the token's value. The game token is a _steering_ layer, not the Maker's paycheck.

The asset set is **curated and owner-controlled** — only whitelisted, deep-liquidity tickers can be deposited, which makes oracle manipulation uneconomic. The draw is a disclosed trusted House operation in V1 (auditable eligible set and outcome; randomness is an operator promise, replaced by verifiable randomness on any mainnet deployment). Rips are disclosed negative-expected-value entertainment; the product makes no promise that the token appreciates or that anyone profits.

## Actors

- **User** — anyone with a wallet. Rips Packs (Taker) and/or creates them (Maker). No intermediary identity, no automation, no manager. Ripped Packs land directly in the user's wallet as ERC-721s.
- **Maker** — a user in the create role: funds a Pack with an approved stock basket and provides it as inventory. Earns the socialized Acquisition Fee (stablecoin) plus Maker Emissions (token) while the Pack rests. "Maker" is short for market maker; the surcharge is the maker's spread.
- **Taker** — a user in the rip role. Pays the live Rip price, receives a randomly drawn Pack, earns a share of the participation pot. (The ripping action is a "Rip"; a Taker is the counterparty to a Maker.)
- **House** — operator of selection/scheduling infrastructure, and in V1 the **seed Maker** that deposits and tops up Packs to hold the target composition. As operator it can affect liveness but can never alter custody it does not own, change price, odds, or block a holder's exit; as seed Maker it funds its own Packs like any user, with no privileged custody.

## Game loop

1. A **Maker** creates and fully funds a Pack with an approved basket of tokenized-stock ERC-20s (USD NAV within `[minPackNav, poolMax]`). The protocol records the immutable basket accounting and publishes contents, oracle NAV, and redemption terms.
2. The Pack rests in the **global pool**, eligible while it passes objective checks — approved assets, full funding, fresh oracle NAV within the band, non-frozen assets.
3. While resting, the Maker accrues an **equal-rate share of the Acquisition Fee** (stablecoin) and **Maker Emissions** (token).
4. A **Taker** rips **up to `maxBatchSize` Packs in one transaction**. The Rip price is computed **live** off the eligible set at transaction start: `rip_price = harmonic_mean × (1 + surcharge)`, paid per Pack. The protocol draws that many **distinct** Packs with probability `∝ 1/NAV^α` (without replacement).
5. Each drawn Pack and its full basket transfer to the Taker's wallet; that Pack stops accruing. The Rip payment is split — a **protocol cut taken from the surcharge only** — and the remainder (the full base plus the rest of the surcharge) is socialized equally across the still-resting Packs.
6. The Taker earns a share of the **daily participation pot** for confirmed Rips.
7. The Taker holds each Pack as an ERC-721 and can **unwrap or redeem** the full recorded basket at any time, with zero protocol fee.
8. Emissions accrue **continuously** (hard-capped), claimable at any time via per-epoch merkle Claim Roots. There is no Season; the game runs open-ended, and redemption is always available.

## Selection and pricing

Let the eligible set at the moment of a Rip be Packs `1..n` with fresh USD NAVs `N_i`.

**Selection weight and odds**

```
weight_i = SCALE / N_i^alpha          // SCALE a fixed large constant, e.g. 1e36
odds_i   = weight_i / Σ_j weight_j
```

`alpha` (default `1.0` — straight inverse NAV) is the selection curve; `alpha > 1` favors cheap Packs harder, `alpha = 0` is uniform. Frozen assets and Packs failing any check are excluded from both numerator and denominator.

**Rip price (dynamic, live)**

```
harmonic_mean = (Σ_i N_i) / (Σ_i 1/N_i)      // over eligible Packs
rip_price     = harmonic_mean × (1 + surcharge)
```

`surcharge` (default `10%`) is the maker–taker spread. Pricing is evaluated live at Rip time; a batch of up to `maxBatchSize` Packs is priced off a single snapshot at transaction start and drawn without replacement. There are no windows.

**Worked example** (illustrative live prices; equal inventory)

| Ticker | NAV     | weight ∝ 1/NAV | draw share |
| ------ | ------- | -------------- | ---------- |
| GME    | $22.16  | 0.0451         | ~84%       |
| NVDA   | $196.74 | 0.0051         | ~10%       |
| TSLA   | $307.35 | 0.0033         | ~6%        |

Harmonic mean ≈ $56 (vs $175 arithmetic). Rip price ≈ **$62**. A Taker usually draws a ~$22 GME basket and hits the ~$307 TSLA jackpot ~6% of the time.

**Price floor and bounds.** The harmonic mean always lies between the smallest and largest eligible NAV, and NAV is constrained to the band, so the price is structurally clamped to `[minPackNav, poolMax] × (1 + surcharge)`. The floor **`minPackNav` is an owner-settable contract parameter and is load-bearing**, because the harmonic mean is dominated by its smallest members: one dust-NAV Pack would both crater the price and, via `1/NAV`, monopolize the draws. `minPackNav` is the price floor **and** the dust / draw-monopolization guard in one number. A Pack whose fresh NAV falls below it leaves the eligible set fail-closed; an **empty eligible set executes no Rip**; and settlement clamps the price into `[minPackNav, poolMax] × (1 + surcharge)` even if a feed slips. The launch band is **$20 → $300** (~$22 Rips, up to ~14× jackpots).

## Settlement (Model A) and the maker–taker spread

When a Pack is drawn, its basket goes to the Taker and the Maker receives **no special payout**. Instead the full Rip payment is socialized:

```
surcharge_$   = rip_price − harmonic_mean
protocol_cut  = surcharge_$ × protocolShareOfSurcharge        // from the surcharge ONLY
crown_cut     = surcharge_$ × crownShareOfSurcharge           // from the surcharge ONLY (if crown enabled)
to_makers     = rip_price − protocol_cut − crown_cut          // base + remaining surcharge
```

`to_makers` is distributed **equally per resting Pack** (the Acquisition Fee). Three properties fall out:

- **Make-whole by construction.** A Pack's expected loss rate is `draw-weight × NAV ∝ N^(1−α)`, which at `α = 1` is _constant for every Pack_. So equal-rate fees make every Pack whole regardless of NAV. A valuable Pack earns proportionally more only through **dwell time** — it's drawn rarely, so it rests ~`∝ NAV` longer and collects the equal rate that many more times. Lifetime earnings come out `∝ NAV` automatically; paying a higher _rate_ by NAV would make it `∝ NAV²` and flood the pool with expensive Packs. (If `α ≠ 1`, generalize the fee weight to `∝ N^(1−α)`.)
- **The base is never touched by any cut.** Both the protocol cut and the crown cut come only from the surcharge, so Makers always get at least the full harmonic-mean base back regardless of how the surcharge is carved. At `protocolShareOfSurcharge + crownShareOfSurcharge = 0` Makers keep the whole spread; at `1.0` combined the surcharge is fully carved and Makers are still exactly whole.
- **The surcharge splits three ways:** protocol / Crown / resting Makers (equal).

Conservation, per Rip: the Taker pays `rip_price` and receives a basket worth `N_drawn` (E = `harmonic_mean`, so Taker E = `−surcharge`); the protocol earns `protocol_cut`, the Crowned Maker earns `crown_cut`, and resting Makers collectively earn `to_makers`, which exceeds the `harmonic_mean` of basket value leaving the pool by the Makers' remaining share of the surcharge.

**The Crown (owner-toggleable).** An optional king-of-the-hill status carve-out for suppliers, since Model A otherwise leaves Makers indifferent to size. The **Crowned Maker** — the single Maker with the largest **total resting Pack NAV** (summed across their Packs, since `poolMax` caps any one Pack) — receives `crown_cut` on every Rip, on top of their equal share. To **take the crown you must beat the standing leader's total by ≥ `crownBeatMargin` (default 10%)**, which prevents crown-flicker gas wars. The crown mildly incentivizes whale concentration, so it is **off by default** (`crownEnabled = false`) until real Maker supply exists; when enabled, `crownShareOfSurcharge = 0.10` of the surcharge (≈1% of the rip price, matching StockRip's "extra 1%"), carved from the Maker share so the split moves 25/0/75 → 25/10/65 with protocol unchanged.

## Game token (V1: plumbing only)

The game token compensates _steering_, not survival — Makers are already made whole in stablecoin. V1 ships the **plumbing** and defers the controller.

**Emission is a funded Distributor, not a mint.** The GameToken is a plain fixed-supply ERC-20, **fully minted at deploy to the treasury — there is no ongoing emission-mint authority.** The owner **funds a Distributor contract by transferring tokens into it** and sets the stream rates on-chain; it pays out only tokens it holds. This makes **the Distributor's balance the hard cap by construction**: a bad Claim Root can misallocate _within_ the funded balance but can never inflate supply, because there is no mint path to inflate.

- **Maker Emissions** — a continuous stream from the Distributor to Makers, **equal per resting Pack per epoch** (epoch = 1 day) in V1, at an **owner-settable rate** (`makerRatePerEpoch`). The gap-weighted **restock controller** (`∝ gap^convexity ÷ inventory`, per-asset `target_inventory`, `gain ≈ 8`, `convexity = 2`) that steers composition is a **post-V1** mechanism — no economic pull while the token is transfer-locked and the House manages composition.
- **Participation Rewards (Buyer Rebate shape)** — a **fixed daily token pot** (`takerPotPerEpoch`) split among the day's Rips **pro-rata by the surcharge each Taker paid**. Because the pot is fixed, a quieter epoch (fewer Rips) automatically returns a larger rebate per Rip — the "quieter pool → bigger rebate" property emerges for free, no activity metric needed. A per-Rip cap (`rebatePerRipCap`, default 10% of the pot) stops a single dead-day Rip from scooping the pot; unspent tokens roll forward. Paid in game token, entirely separate from the stablecoin surcharge flow, so Model A is untouched (the surcharge still splits protocol/Crown/Makers); the rebate simply softens the Taker's −EV in token.
- **Claims** — both streams are computed off-chain from confirmed on-chain records by a published, reproducible algorithm and claimed against the Distributor's held balance via per-epoch **merkle Claim Roots**; anyone can recompute any epoch.
- **Posture** — fixed maximum supply, all minted at deploy. **Transfer-locked user↔user at launch** (Distributor→claimant transfers are exempt so earning works), behind a one-way, irreversible, time-delayed transfer-enable switch exercisable only as a separately approved post-V1 decision. The token carries no selection weight, cadence benefit, redemption right, staking yield, or revenue share.

**Recommended V1 funding (starting points, all owner-adjustable):** `1,000,000,000` max supply; fund the Distributor with **~30% (≈300M)** for V1, reserving the rest for the post-V1 controller and future use; weight the split **~60/40 toward Takers** (the token is a Taker's only upside since Rips are −EV, whereas Makers are already made whole by fees and, in V1, House-seeded). Set `makerRatePerEpoch` / `takerPotPerEpoch` so the funded balance streams over the intended test horizon; adjust or top up by transfer as activity dictates.

## Asset Registry — owner-controlled, curated

- The owner maintains the whitelist. Per asset: token address, a price feed (TWAP source, per Robinhood Chain oracle guidance), a staleness bound, a status, and live inventory.
- **Status enum:** `Active`, `Frozen` (manual halt for a trading halt), `Delisting` (deposits closed; existing Packs remain drawable so inventory drains), `Unlisted`.
- **`addAsset`** registers a ticker + feed + staleness bound; **`setStatus`** freezes/unfreezes or begins a delist; **`removeAsset`** succeeds only at zero inventory (drain-then-delete).
- **Freeze semantics:** a frozen asset drops out of the selection weight set **and** the harmonic-mean price basket; deposits and Rips against it are blocked, but unwrap (reclaiming one's own basket) stays open. It rejoins both sets on unfreeze.
- **Oracle staleness is an always-on circuit breaker** independent of status: deposit and settlement both require `now − updatedAt ≤ staleAfter`, failing closed on a feed gap.

## Oracle and peg

The oracle values only the **volatile side — the tokenized stocks** — to compute a Pack's NAV. **The stablecoin peg is trusted at par (1 token = $1):** no feed is read for the stablecoin leg and no depeg check is performed. All USD-denominated constants (`minPackNav`, `poolMax`, fees) and the stablecoin leg are par by definition. The only fail-closed trust dependency is a stale or invalid stock feed.

## Owner control panel

Every lever is versioned, evented configuration:

| Lever                                              | Meaning                                                                                                                                | Illustrative default                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `alpha`                                            | Selection curve `weight ∝ 1/NAV^alpha`                                                                                                 | `1.0`                                            |
| `surcharge`                                        | Maker–taker spread on the harmonic-mean Rip price                                                                                      | `0.10`                                           |
| `protocolShareOfSurcharge`                         | Fraction of the surcharge the protocol keeps                                                                                           | `0.25`                                           |
| `crownShareOfSurcharge` / `crownEnabled`           | Fraction of the surcharge to the Crowned Maker (from the Maker share); toggle                                                          | `0.10` when on; `crownEnabled=false` in early V1 |
| `crownBeatMargin`                                  | % a challenger must beat the standing leader total NAV by to take the crown                                                            | `0.10`                                           |
| `rebatePerRipCap`                                  | Buyer-Rebate per-Rip cap as a share of the daily `takerPotPerEpoch` pot (pot splits pro-rata by surcharge paid; unspent rolls forward) | `0.10`                                           |
| `minPackNav`                                       | **Min Pack NAV** — eligibility floor, price floor, dust guard                                                                          | `$20`, required `>0`                             |
| `poolMax`                                          | Max Pack NAV — caps the upper price bound / jackpot multiple                                                                           | `$300`                                           |
| `maxBatchSize`                                     | Max Packs a Taker may rip per transaction                                                                                              | `5`                                              |
| Asset status                                       | `addAsset` / `removeAsset` / freeze / delist                                                                                           | per ticker                                       |
| `staleAfter`                                       | Per-ticker oracle staleness bound (circuit breaker)                                                                                    | per feed                                         |
| `makerRatePerEpoch` / `takerPotPerEpoch`           | Distributor stream rates, owner-settable; funded by transferring tokens in                                                             | TBD                                              |
| _post-V1_: `target_inventory`, `gain`, `convexity` | Restock-controller tuning (no V1 effect)                                                                                               | —                                                |

## Safety and accounting invariants

- Every active Pack is fully backed by its recorded raw-token basket; fee and protocol-owned assets are never counted as backing.
- Pack baskets only grow before a Rip: top-ups are Maker-only additions; no path removes assets except full delist-and-redeem or the holder's post-Rip unwrap.
- A Pack is drawn at most once and its Rip settles at most once; failure/retry paths reconcile the same intent.
- Odds are exactly `weight_i / Σ weight_j` with `weight_i = SCALE / N_i^alpha` over the eligible set at Rip time; a frozen ticker contributes zero weight and zero price basket. A batch of up to `maxBatchSize` is priced off one snapshot and drawn without replacement. In V1 the draw is a disclosed House operation; eligible set, outcome, and settlements are on-chain and auditable.
- The Rip price is bounded to `[minPackNav, poolMax] × (1 + surcharge)`; a below-floor Pack is excluded fail-closed, an empty eligible set executes no Rip, and settlement clamps into the band.
- Settlement conserves the full payment: `protocol_cut` and `crown_cut` from the surcharge only, remainder socialized equally across resting Packs; the base is never touched by any cut, so make-whole holds for every `protocolShareOfSurcharge + crownShareOfSurcharge ≤ 1`. The Crown pays the Maker with the largest total resting NAV and only changes hands when a challenger beats the leader by ≥ `crownBeatMargin`. The drawn Pack and its full basket transfer to the Taker.
- Redemption releases a Pack's full recorded raw-token basket with zero protocol fee. Stale/invalid stock-oracle data fails NAV-dependent eligibility and pricing closed; oracle or scheduler failure cannot rewrite custody or block the defined exit.
- Game-token payouts can never exceed the Distributor's funded balance — it pays only tokens it holds and there is no emission-mint authority, so a bad Claim Root can misallocate within that balance but can never inflate supply. All entitlements are reproducible from confirmed records.
- The transfer-lock applies to the **GameToken only**: user↔user GameToken transfers fail closed (Distributor→claimant claims exempt) until the one-way, irreversible, time-delayed, evented transfer-enable switch is exercised (post-V1 only). Stock Tokens, the stablecoin, and Packs are freely transferable and redeemable throughout.
- The stablecoin peg is trusted at par; no depeg check. Testnet assets and the game token are visibly labelled valueless test assets. V1 makes no mainnet, yield, appreciation, or guaranteed-profit claim.

## Reference simulation

`contracts/sim/stockrip-sim.js` (no dependencies; `node contracts/sim/stockrip-sim.js`) models the pool as inventory dynamics — outflow `∝ 1/NAV` per draw, inflow from emission-driven restocking — with owner levers exposed at the top. It demonstrates composition drift under neutral rewards, the post-V1 restock controller holding a target draw share, and a freeze rerouting draws and repricing. Re-run after changing the asset set before committing `RipEngine` constants.

## V1 acceptance path

On Robinhood Chain testnet, independent users can create and fund Packs, inspect backing and NAV, rip Packs, and observe without hidden operator edits:

- selection comes from the live eligible set with odds `∝ 1/NAV^alpha`, and `rip_price = harmonic_mean × (1 + surcharge)` over that set;
- a Pack below `minPackNav` is excluded, and the Rip price never settles outside `[minPackNav, poolMax] × (1 + surcharge)`;
- a Taker can rip up to `maxBatchSize` distinct Packs in one tx; each drawn Pack and payment settle exactly once with the fee split recorded, and the base is fully socialized to resting Packs;
- Maker-emission and participation-pot accounting are reproducible from confirmed records and stay within their capped allocations;
- freezing an asset removes it from odds and price and reroutes draws; unfreezing restores it;
- insufficient funds and stale stock-oracle data fail closed; the peg is trusted at par with no depeg path;
- holders can unwrap/redeem the full basket directly; redemption is always available.

## V1 launch configuration

- **No Season.** The game runs open-ended; emissions are a continuous capped stream. "When to evaluate / go mainnet" is an off-chain decision.
- **Stablecoin:** the protocol's own mock USD stablecoin (MockUSD, in `contracts/`), visibly labelled valueless; peg trusted at par. Mainnet stablecoin (USDG) is verified fresh only at a separately approved mainnet deployment.
- **Approved Stock Token whitelist (owner-configurable):** **GME, NVDA, TSLA** — a small, deep-liquidity set so oracle manipulation is uneconomic and the NAV spread yields a legible jackpot curve. Canonical addresses resolve from Robinhood's [Token Contracts](https://docs.robinhood.com/chain/contracts/) registry; feeds follow the [oracle guidance](https://docs.robinhood.com/chain/oracles-and-price-feeds/). Missing testnet coverage is covered by labelled Test Assets + controlled feed doubles.
- **Starter Grant:** a new wallet receives a one-time mock-stablecoin grant to play, plus a rate-limited refill (versioned configuration).
- **House seeding:** the House seeds and tops up Packs to hold the target composition and guarantee the spread while permissionless Maker supply builds.

## Open decisions before implementation planning

- Token supply/funding have recommended starting points (1B supply, ~30% funded to the Distributor, ~60/40 Taker-weighted); still open are the exact `makerRatePerEpoch` / `takerPotPerEpoch` and the intended stream horizon. _(Surcharge split, Crown values, and the Buyer-Rebate shape are now pinned — see the owner control panel.)_
- **Emission epoch details** (daily assumed): integer-rounding and empty-epoch treatment.
- **Batch pricing detail:** confirm snapshot-at-tx-start (vs. reprice per draw within a batch) for `maxBatchSize > 1`.
- **Oracle/TWAP window and `staleAfter` per feed**, and the keeper wiring that drives `setStatus(Frozen)` on a real trading halt.
- **`CLAUDE.md` reconciliation** — it still describes the AI-agent trading game; update it to the Maker/Taker rip model.
- Regulatory and consumer-protection review is waived by the owner for testnet and remains a gate for any mainnet decision.

## Relationship to mainnet

Mainnet remains outside V1. If separately approved, it is a fresh deployment of the same reviewed contract logic with separately verified production configuration (canonical addresses, USDG, feed map and freshness limits, whitelist, fees, roles) plus the waived regulatory review. No testnet state migrates. Mainnet also revisits the V1 trust decisions: verifiable randomness replaces the House draw when available, and any transferable-token reward path is identity-gated at claim time while play stays permissionless.
