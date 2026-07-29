# Margin Call: NAV-Weighted Pack Rip

- **Status:** Draft for review
- **Version:** 1.0
- **Target:** Robinhood Chain testnet
- **Date:** July 29, 2026
- **Supersedes:** the uniform-odds token PRD (`prd-margin-call-token.md`, v0.5) and the dual-pile Pack-backing spec (`spec-margin-call-pack-backing.md`), both removed. The custody, whitelist, additions-only, and zero-fee-exit invariants from those documents carry forward; their selection, pricing, and backing models do not. The seven ADRs previously in `docs/adr/` are removed and the decisions still in force are folded into this document.

Domain terms are defined in the repo glossary, [`CONTEXT.md`](../CONTEXT.md), which is being reconciled to this model in the same change.

## Product decision

Margin Call is a Pack-ripping game where the **value inside a Pack is the only thing the game reads**. A Creator deposits a basket of approved tokenized-stock ERC-20s into a Pack; the Pack's USD NAV drives how often it is drawn, what a Rip costs, and how the game token is emitted. There is no separate ETH or single-stock "backing" pile — the earlier design paired every deposit with committed collateral, and this version removes it. Collapsing value and collateral into one number (NAV) closes the gap that let Creators deposit thin Packs: contents now set both the odds and the price.

Selection is **inversely weighted by NAV**: lightly-valued Packs are drawn often, richly-valued Packs are drawn rarely. A Rip costs the **expected value of the draw** — the harmonic mean of the eligible Packs' NAVs, plus a fixed surcharge — so the price tracks what a ripper actually receives on average and the game is a fair gamble minus a disclosed house edge. The draw itself is a disclosed trusted House operation in V1: the eligible set, the outcome, and every settlement are on-chain and auditable, but the randomness is an operator promise, not a cryptographic proof. Verifiable randomness replaces the House draw on any mainnet deployment when available on Robinhood Chain.

Depositing is an inventory-provider role, not a per-Pack sale. When a Pack is drawn its basket transfers to the ripping Trader; the Creator's return is the game-token emissions they earn while inventory rests, plus a pro-rata share of acquisition fees — **not** a direct payment for the drawn Pack. This is what lets the game token do real work: emissions are shaped as a **restock controller** that steers which assets get replenished, holding the pool's composition — and therefore the draw distribution — near an owner-set target. Rips are disclosed negative-expected-value entertainment; the product makes no promise that the token appreciates or that any participant profits.

The asset set is **curated and owner-controlled**. Only whitelisted, liquid tickers can be deposited, which is the single highest-leverage defense against oracle manipulation: moving the real market price of a deep-liquidity name enough to game a Pack costs far more than any Pack is worth. The contract owner can add assets, remove assets, and freeze an asset (for a trading halt or a stale feed); a frozen asset drops out of both the selection weight set and the price basket until unfrozen.

## Why this shape (design rationale)

Three properties of the mechanics were validated by simulation (`contracts/sim/` — see "Reference simulation"):

1. **Inverse-NAV selection + harmonic-mean pricing is EV-fair by construction.** The harmonic mean of the eligible NAVs _is_ the expected value of the inverse-NAV-weighted draw, so a Rip priced at `harmonic_mean × (1 + surcharge)` is a fair bet plus the surcharge as the only edge. With an illustrative pool of GME (≈$22), NVDA (≈$197), TSLA (≈$307) at equal inventory, a ripper usually draws the cheap name and occasionally hits the expensive one — a legible jackpot curve that falls straight out of the price spread.

2. **Without steering, the pool drifts.** Because cheap Packs are drawn ~14× more often than expensive ones, uncontrolled inventory bleeds its cheap assets, the harmonic mean climbs, and the game degrades into "pay a lot, usually get the expensive name." The cheap-and-frequent character that makes it fun decays away.

3. **Token emission arrests the drift.** Routing deposit emissions toward the depletion gap — paying the most to restock whatever the pool is bleeding — holds the draw distribution at its target across the season. The controller is robust: a wide range of gains all hold the target, so this is a parameter to set sensibly, not a knob to balance on a knife-edge.

## V1 game loop

1. A Creator mints and fully funds a Pack with an approved basket of tokenized-stock ERC-20s. The protocol records the immutable basket accounting and publishes contents, oracle NAV, and redemption terms.
2. The Pack enters a named Pool and stays selection-eligible while it satisfies objective asset, funding, oracle-freshness, and Pool NAV-bound rules at each checkpoint.
3. A Desk Manager funds a Trader with the configured USD stablecoin, reviews the Pool's published statistics (eligible count, NAV distribution, current Rip price, harmonic-mean NAV), chooses one eligible Pool, and enables the Trader's schedule.
4. Once per hourly window, an enabled and funded Trader may pay exactly one Rip price. It cannot Rip more often, exceed its balance, or choose among eligible Packs.
5. At the window boundary the eligible set is frozen. The protocol draws one Pack with probability proportional to `1 / NAV^α`, using fresh oracle NAV. The draw immediately completes the Rip: the Pack and its full recorded basket transfer to the Trader, and the payment settles.
6. The Rip payment is split into a bounded protocol cut and a pro-rata acquisition-fee distribution across the resting eligible Packs. The drawn Pack stops earning emissions; other Creators' resting Packs continue to accrue.
7. Game-token emissions stream to Creators each epoch, weighted by the restock controller so replenishment flows to the assets the pool is depleting. Entitlements are computed off-chain from confirmed on-chain records by a published, reproducible algorithm and paid through per-epoch merkle Claim Roots posted on-chain.
8. When the Season ends, selection and emissions stop. Unripped Packs remain redeemable by their Creators, ripped Packs remain redeemable by their holders, and earned claims remain open.

If a Trader is unfunded, paused, ineligible, or the Pool cannot safely execute, it does nothing that window. Missed windows do not accumulate and cannot be replayed as a burst.

## Selection and pricing

Let the eligible set (frozen at the window boundary) be Packs `1..n` with fresh USD NAVs `N_i`.

**Selection weight and odds**

```
weight_i = SCALE / N_i^alpha          // SCALE a fixed large constant, e.g. 1e36
odds_i   = weight_i / Σ_j weight_j
```

`alpha` is the selection curve (default `1.0` — straight inverse NAV). `alpha > 1` favors cheap Packs harder; `alpha = 0` is uniform. Odds are recomputed each window over the frozen set. Frozen assets and Packs failing any checkpoint are excluded from both the numerator and the denominator.

**Rip price (dynamic)**

```
harmonic_mean = (Σ_i N_i) / (Σ_i 1/N_i)      // over eligible Packs
rip_price      = harmonic_mean × (1 + surcharge)
```

`surcharge` is the house edge (default `10%`). Because `harmonic_mean` equals the expected NAV of the inverse-NAV-weighted draw, `rip_price` is the fair EV plus the edge. A fixed-price Pool remains a valid configuration (set a constant `rip_price`), but the default V1 Pool prices dynamically.

**Worked example** (illustrative live prices; equal inventory)

| Ticker | NAV     | weight ∝ 1/NAV | draw share |
| ------ | ------- | -------------- | ---------- |
| GME    | $22.16  | 0.0451         | ~84%       |
| NVDA   | $196.74 | 0.0051         | ~10%       |
| TSLA   | $307.35 | 0.0033         | ~6%        |

Harmonic mean ≈ $56 (vs $175 arithmetic). Rip price ≈ $56 × 1.10 ≈ **$62**. A ripper usually draws a ~$22 GME basket and hits the ~$307 TSLA jackpot ~6% of the time.

## Game token: the restock controller

The game token compensates Creators for providing inventory and, in doing so, steers the pool. Ticker is an open branding decision (candidates include `$RIP` / `$BLOW`); this document uses "the game token."

**Emission shape.** Each epoch a fixed, published budget of tokens is emitted to Creators. The budget is split across whitelisted tickers by the depletion gap, then per-Pack within a ticker by inverse inventory:

```
gap_t          = max(1, target_inventory_t − inventory_t) ^ convexity
ticker_share_t = emission_epoch × gap_t / Σ_u gap_u
reward_per_pack(t) = ticker_share_t / inventory_t
```

Defaults from the reference simulation: `convexity = 2`, and depositor capital chases the highest per-dollar yield with a controller **gain ≈ 8** (the sensitivity of restock flow to yield differences). `target_inventory_t` is owner configuration and sets the desired draw distribution (equal inventories reproduce the 84/10/6 example). The equilibrium lives in inventory **ratios**, not absolute levels: the controller's only job is holding the tickers in proportion.

**Direction matters.** Emission must scale with draw-out pressure — pay the most to restock the _depleting_ (cheap, high-churn) asset. A value-proportional or `√(value)` shape (as in prior designs) rewards the expensive, slow-draining asset and _accelerates_ drift; the reference sim shows the target draw share decaying instead of holding.

**Supply, caps, and claims.** The token has a fixed maximum supply with a bounded Season allocation for emissions; the token contract hard-caps the allocation independently of any posted Claim Root, so an incorrect root can never inflate supply. Emission and reward accounting is reproducible by anyone from confirmed on-chain records under the published algorithm. At launch the token is earned-only and transfer-locked for the entire Season, behind a one-way, irreversible, time-delayed transfer-enable switch exercisable only as a separately approved post-V1 decision. The token carries no selection weight, no cadence benefit, no redemption right, and no staking yield or revenue share.

## Architecture and roles

Contracts build on the [LazerForge](https://github.com/LazerTechnologies/LazerForge) Foundry template in `contracts/`.

### Pack — the immediate object

- A transferable ERC-721 backed by a single recorded basket of approved tokenized-stock ERC-20s, held in protocol custody. There is no separate backing pile.
- Transferring the Pack transfers the right to its recorded basket. The current holder can unwrap or redeem the full recorded basket with no protocol deduction.
- Top-ups are additions only: the Creator, and only the Creator, may add whitelisted Stock Tokens to an unripped Pack; each top-up triggers a checkpoint effective at the next window boundary. There are no partial withdrawals — assets leave a Pack only via full delist-and-redeem or the holder's post-Rip unwrap. Published NAV can rise between checkpoints but can never be hollowed out.
- Contents and NAV are public before selection and after transfer. Custody accounting uses raw token units; displayed NAV never replaces the recorded basket.

### Asset Registry — owner-controlled, curated

- The owner maintains the whitelist. Per asset: the token address, a price feed (a TWAP source, following Robinhood Chain's oracle guidance), a staleness bound, a status, and live inventory.
- **Status enum:** `Active` (normal), `Frozen` (manual halt — owner or keeper, for a trading halt), `Delisting` (deposits closed; existing Packs remain drawable so inventory drains), `Unlisted`.
- **`addAsset`** registers a new ticker with its feed and staleness bound. **`setStatus`** freezes/unfreezes or begins a delist. **`removeAsset`** succeeds only at zero inventory — removal is a drain-then-delete, never a hard delete that would strand assets.
- **Freeze semantics:** a frozen asset drops out of the selection weight set **and** the harmonic-mean price basket. Deposits and Rips against it are blocked; unwrap (reclaiming one's own basket) stays open because it is not price-dependent. On unfreeze it rejoins both sets.
- **Oracle staleness is an always-on circuit breaker** independent of status: deposit and settlement both require `now − updatedAt ≤ staleAfter`, so a feed gap fails closed even without a manual freeze.

### Trader — the persistent desk

- A transferable ERC-721 identity. Its stablecoin budget and received Packs are protocol custody keyed to the token, so transferring the Trader carries its portfolio and public history. V1 ships without ERC-6551 token-bound accounts; they arrive with the autonomous-agent V2.
- In V1 the Trader is clockwork automation: its only scheduled choice — made by the Desk Manager — is to Rip one Pack from one named Pool when the window opens and hard eligibility checks pass. It cannot change its own Pool, cadence, budget, or permissions.
- Enable, pause, and Pool changes take effect at the next window boundary; a Trader committed at a boundary completes that window's Rip, so a pause bounds further exposure to at most one Rip price. Ownership changes leave the Trader paused until the new owner re-enables it.

### Creator — permissionless inventory supply

- Any participant may create and fully fund as many Packs as they can support; no allowlist, no per-Creator caps. Eligibility follows objective published rules for approved assets, complete funding, oracle freshness, and public contents/NAV.
- A Creator's return is game-token emissions earned while inventory rests, plus a pro-rata share of acquisition fees — never a direct payment for a drawn Pack. Copy must disclose that a drawn Pack's basket is forfeit to the ripper and must not describe emissions or token price as a return promise.

### Pool and protocol

- Each Pool has a stable public name, one configured USD stablecoin, a pricing rule (dynamic harmonic-mean + surcharge by default, or a fixed price), the approved Stock Token rules, fees, and published USD NAV bounds. NAV and bounds are USD; the Rip price and fees settle in the stablecoin.
- Rip settlement: the Trader pays the current Rip price; the payment splits into a bounded protocol cut and a pro-rata acquisition-fee distribution across resting eligible Packs. The drawn Pack and its full basket transfer to the Trader and its emissions stop. Unwrap/redemption carries no protocol fee.
- NAV bounds and freshness are enforced at hourly-epoch checkpoints and at every Rip, top-up, and claim; calculations normalize token and feed decimals and fail closed on invalid, paused, missing, or stale data. Bound and parameter changes (`alpha`, `surcharge`, targets, gain, fees, bounds) are versioned, evented configuration applied prospectively — they never silently rewrite terms governing existing active Packs.
- Each Pool publishes live statistics — eligible count, harmonic-mean NAV, current Rip price, and the NAV distribution — so Desk Managers can judge expected value before and while their Traders participate.
- The House operates selection and scheduling and executes the V1 draw. It can affect liveness and, because the draw is trusted, V1 discloses that selection fairness rests on the House. The House cannot create an unfunded Pack, alter a drawn basket, charge a different price, reuse a Rip, bypass the on-chain per-window limit, mint outside the capped allocation, or block a holder's disclosed exit.

## Owner control panel

Every game lever is versioned, evented configuration:

| Lever                | Meaning                                                 | Illustrative default      |
| -------------------- | ------------------------------------------------------- | ------------------------- |
| `alpha`              | Selection curve `weight ∝ 1/NAV^alpha`                  | `1.0`                     |
| `surcharge`          | House edge on the harmonic-mean Rip price               | `0.10`                    |
| `emission_epoch`     | Game-token budget streamed to Creators per epoch        | published schedule        |
| `convexity`          | Restock reward `∝ gap^convexity`                        | `2`                       |
| controller `gain`    | Sensitivity of restock flow to yield differences        | `~8`                      |
| `target_inventory_t` | Per-ticker inventory target — sets the desired draw mix | equal (→ 84/10/6 example) |
| `B_min` / dust guard | Optional floor to cap any single Pack's draw weight     | versioned                 |
| Asset status         | `addAsset` / `removeAsset` / freeze / delist            | per ticker                |
| `staleAfter`         | Per-ticker oracle staleness bound (circuit breaker)     | per feed                  |

## Safety and accounting invariants

- Every active Pack is fully backed by its recorded raw-token basket; fee and protocol-owned assets are never counted as Pack backing.
- Pack baskets only grow before a Rip: top-ups are Creator-only additions with an immediate checkpoint; no path removes assets except full delist-and-redeem or the holder's post-Rip unwrap.
- A Pack is drawn at most once and its Rip settles at most once. Failure and retry paths reconcile the same intent and never create a second Rip.
- Each funded, eligible Trader completes at most one Rip per hourly window, enforced on-chain. Pause, insufficient balance, ineligibility, and ownership transfer fail closed.
- Participation and eligibility state commits at window boundaries: Trader enable/pause/Pool changes and Pack listings/top-ups apply to the next window; mid-window checks remove Packs fail-closed but never add them.
- Odds are exactly `weight_i / Σ weight_j` with `weight_i = SCALE / N_i^alpha` over the frozen eligible set; a frozen ticker contributes zero weight and zero price basket. In V1 the draw is a disclosed House operation; the eligible set, outcome, and settlements are on-chain and auditable.
- Rip settlement conserves the full payment: a bounded protocol cut plus a pro-rata acquisition-fee distribution to resting eligible Packs, with the drawn Pack and its full basket transferring to the Trader.
- Redemption releases a Pack's full recorded raw-token basket with zero protocol fee. Stale or unavailable oracle data makes NAV-dependent eligibility and pricing fail closed; oracle or scheduler failure cannot rewrite custody or permanently block the defined exit — including after the Season ends.
- Game-token emission can never exceed its capped Season allocation, enforced in the token contract independently of any posted Claim Root. All entitlements are reproducible by third parties from confirmed records.
- Ordinary external token transfers fail closed for the entire Season; the transfer-enable switch is one-way, irreversible, time-delayed, evented, and exercisable only post-V1.
- Testnet assets and the game token are visibly labelled valueless test assets. V1 makes no mainnet, yield, appreciation, or guaranteed-profit claim.

## Reference simulation

`contracts/sim/stockrip-sim.js` (no dependencies; `node stockrip-sim.js`) models the pool as inventory dynamics: outflow `∝ 1/NAV` per draw, inflow from emission-driven restocking, with owner levers (`lambda`, `surcharge`, `alpha`, `emission`, `gain`, `convexity`, per-ticker targets, freeze) exposed at the top. It demonstrates the drift under neutral rewards, the restock controller holding the target draw share, and the freeze rerouting draws and repricing the pool. Re-run after changing the asset set or lambda before committing `RipEngine` constants.

## V1 acceptance path

On Robinhood Chain testnet, independent participants can create and fund eligible Packs, inspect backing and NAV, review Pool statistics, create/fund Traders, and observe without hidden operator edits:

- an enabled Trader completes no more than one Rip per hourly window;
- selection comes from the published eligible set with odds `∝ 1/NAV^alpha`, and the Rip price equals `harmonic_mean × (1 + surcharge)` over that set;
- the drawn Pack and payment settle exactly once, with the fee split recorded;
- emission accounting is reproducible from confirmed records and stays within the capped allocation;
- freezing an asset removes it from odds and price and reroutes draws; unfreezing restores it;
- pause, insufficient funds, stale oracle data, and ownership transfer fail closed;
- holders can exercise transfer and redemption directly in the app; and
- when the Season ends, selection and emissions stop while redemption and claims remain open.

## V1 launch configuration

- **Season:** one finite Season on Robinhood Chain testnet. Start date and exact epoch timestamps are open configuration.
- **Stablecoin:** the protocol deploys its own mock USD stablecoin (MockUSD, already in `contracts/`), visibly labelled valueless. The mainnet stablecoin (USDG) is verified fresh only at a separately approved mainnet deployment.
- **Approved Stock Token whitelist (illustrative, owner-configurable):** GME, NVDA, TSLA — a small, deep-liquidity set chosen so oracle manipulation is uneconomic and the NAV spread produces a legible jackpot curve. Canonical addresses resolve from Robinhood's [Token Contracts](https://docs.robinhood.com/chain/contracts/) registry; feeds follow the [oracle guidance](https://docs.robinhood.com/chain/oracles-and-price-feeds/). Where canonical testnet coverage is missing, clearly labelled Test Assets and controlled feed doubles validate the same accounting and failure semantics.
- **Desk Grant:** every new account receives a one-time mock-stablecoin deposit at desk creation plus a rate-limited in-app refill (versioned configuration).

## Open decisions before implementation planning

- **Settlement/fee split precision.** The pro-rata acquisition-fee distribution vs. any direct payment to the drawn Creator, and the exact protocol-cut fraction, are the least-pinned economics. The default here (emissions + fee-share as the Creator's return; no per-Pack sale payment) is what makes the controller direction correct and should be validated on the reference sim before contract constants are frozen.
- **Dynamic vs. fixed Rip price for the launch Pool**, and whether a dust-backing floor (`B_min`) is needed for the chosen asset set.
- **Controller tuning for the live asset set**: `target_inventory`, `gain`, `convexity`, and `emission_epoch` calibrated on the sim once the final whitelist and expected `lambda` are known.
- **Game-token ticker and exact allocation split.**
- **Oracle/TWAP window and `staleAfter` per feed**, and halt-detection wiring for the keeper that drives `setStatus(Frozen)`.
- **Season start date and epoch timestamps**; integer-rounding and empty-epoch treatment for emissions.
- Regulatory and consumer-protection review is waived by the owner for the testnet Season and remains a gate for any mainnet decision.

## Relationship to mainnet

Mainnet remains outside V1. If separately approved, it is a fresh deployment of the same reviewed contract logic with separately verified production configuration (canonical addresses, USDG, feed map and freshness limits, whitelist, fees, roles) plus the waived regulatory review. No testnet Pack, Trader, token, or other state migrates. Mainnet also revisits the V1 trust decisions: verifiable randomness replaces the House draw when available, and any transferable-token reward path is identity-gated at claim time while play itself stays permissionless.
