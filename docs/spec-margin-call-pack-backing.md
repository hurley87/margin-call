# Spec: Pack, Backing, and the Rip Floor

- **Status:** Draft data-model spec (economics pressure-tested, July 28 2026)
- **Supersedes for the Pack economy:** the uniform-odds / fixed-value model in `prd-margin-call-token.md` (v0.5)
- **Target:** Robinhood Chain testnet
- **Date:** July 28, 2026

This spec defines the StockRip-inspired backing model the game is being rebuilt around. It replaces v0.5's uniform selection and no-backing assumptions; the custody, whitelist, additions-only, and zero-fee-exit invariants from v0.5 carry forward unchanged.

## 1. What a Pack is

A Pack is a transferable ERC-721 that escrows **two independent piles** of whitelisted tokenized stocks:

- **Deliverable** — a multi-asset basket of stocks. This is the prize a ripper wins. Its **total USD NAV** is what matters mechanically; its composition is flavor.
- **Backing** — a _single_ stock the creator chooses. Locked alongside the deliverable and never handed out as the prize. It drives the pack's odds, rarity tier, and floor.

Both piles are chosen from the same approved Stock Token whitelist. The deliverable may hold many tickers; the backing is exactly one, and it may be the same as or different from any deliverable ticker.

## 2. What the backing does — three jobs

The single backing number (its USD value, `B`) is the only backing input the game reads. It drives:

1. **Draw odds** — inversely. More backing → drawn less often.
2. **Rarity tier** — a band on `B` (Common → Legendary).
3. **The floor** — the escrowed backing funds a guaranteed minimum payout to whoever rips the pack.

Backing USD value floats with its stock's price (via the Chainlink feed already used for NAV), so odds, tier, and floor all move with the market in real time.

## 3. Odds

Backing values are normalized to USD so different backing tickers are comparable.

```
weight_i = SCALE / backingUSD_i          // SCALE is a fixed large constant, e.g. 1e36
odds_i   = weight_i / Σ_j weight_j        // over the eligible set frozen at the window boundary
```

A pack backed with $40 is drawn ~2.5× as often as one backed with $100. Odds are recomputed each hourly window over the frozen eligible set.

**Curve locked at `1/B` (linear inverse), not `1/√B`.** The economics pressure-test showed this is the only curve where the game is sustainable: under `1/B` the ripper's EV equals `0.9 × harmonic-mean(backing)`, which stays anchored near the rip price no matter how many whales list (baseline EV `$24.59` against a `$25` rip). `1/√B` swings ripper EV to `$43` (+73%) and drains creators. Legendaries being rare (~1 in 900 rips) is the intended jackpot behaviour, not a knob to tune away — visibility comes from volume and the browsable pool, not from individual draw odds.

## 4. Rarity tiers

Tiers are display/EV bands on `B` (USD), monotonic with odds. Bands are versioned, evented configuration — not constants. Illustrative launch bands:

| Tier      | Backing USD (`B`) | Relative draw rate |
| --------- | ----------------- | ------------------ |
| Common    | `< $25`           | highest            |
| Uncommon  | `$25 – $60`       | high               |
| Rare      | `$60 – $150`      | medium             |
| Epic      | `$150 – $500`     | low                |
| Legendary | `≥ $500`          | lowest             |

Tier is computed **live** from current backing USD (a pack can be promoted/demoted as its backing stock moves). The card renders tier as a color + label.

## 5. The floor (standing bid)

When a Pack is ripped, the winner receives the better of the two piles:

```
winnerReceives = max( deliverableNAV , 0.85 × B )
```

The `0.85 × B` option is payable by construction because the backing is already escrowed in the contract at mint — no promise, no external capital. The `0.85` haircut (15% retained) is versioned pool configuration.

**The floor is deliverable-price-drop insurance.** A sane creator lists with `deliverableNAV ≥ 0.85 × B`, so rippers take the deliverable and the backing is never touched. The floor only triggers if the deliverable basket **falls below** `0.85 × B` after listing — then the ripper falls back to the backing, draining it from the creator.

## 6. Rip settlement

Rip price is a flat `$25` in the configured stablecoin (10% protocol fee).

1. Trader pays `$25`. Protocol retains `$2.50`; creator receives `$22.50`.
2. The Pack and both escrow piles transfer to the trader.
3. Trader settles to the better pile (auto-resolved to `max(deliverableNAV, 0.85×B)` by default — traders are automation, so no manual step is required):
   - **Keep deliverable:** trader receives the deliverable basket; **backing is released back to the creator**.
   - **Take floor:** trader receives `0.85 × B` of the backing stock; the **deliverable returns to the creator**, who also keeps the remaining `0.15 × B`.

### Conservation

Both outcomes conserve every asset (escrow `deliverable + backing`, plus the `$25` cash leg):

|               | Keep deliverable   | Take floor                        |
| ------------- | ------------------ | --------------------------------- |
| Trader gets   | `deliverable`      | `0.85 × B`                        |
| Creator gets  | `$22.50 + backing` | `$22.50 + deliverable + 0.15 × B` |
| Protocol gets | `$2.50`            | `$2.50`                           |

## 7. Pool bounds and economic invariants

Flat pricing is only fair while the pool's backing distribution stays near the rip price, and the pressure-test found it can be pushed away _on purpose_. Three rules hold the economy in place; the first two are protocol-enforced, the third is creator-side guidance.

### 7.1 Wash-trade guard (protocol-enforced) — `deliverableNAV ≥ rip proceeds ($22.50, locked)`

A pack may not be listed or stay selection-eligible unless its deliverable NAV is at least the creator's proceeds (`$22.50` at the `$25` / 10% config). This is the single load-bearing guardrail.

_Why:_ a creator's net when their pack is drawn is `proceeds − deliverableNAV`. Below proceeds that is **positive** — the creator profits by handing the ripper less than they collect. Because odds ∝ `1/B`, cheap packs also grab most of the draws, so without this bound rational creators are _incentivised_ to flood cheap packs: the pressure-test showed +1,000 such packs take 60% of draws, drop ripper EV to −28%, and flip creators to +$4.56/rip — an adverse-selection spiral that robs rippers and kills demand.

**This bound is the _floor_ of the emission gate; the gate itself is locked at `$25`** (the rip price), so `$BLOW` rewards only packs that give rippers their money's worth. A pack between `$22.50` (selectable) and `$25` (earning) is selectable-but-not-accruing. The selection floor / wash-guard stays locked at `$22.50`.

### 7.2 Dust-backing floor (protocol-enforced) — `B ≥ B_min`

A minimum backing value caps any single pack's draw weight. Without it, a pack backed at `$0.01` grabs ~69% of all draws via `1/B`. This is griefing (draw-monopolisation), not robbery — pool EV is unaffected — but the floor keeps the draw distribution sane. `B_min` is versioned config.

### 7.3 Creator sanity rule (guidance) — `deliverableNAV ≥ 0.85 × B`

Keep the deliverable at or above the floor so rippers take the deliverable and backing is returned intact — backing then only ever buys lower odds + a higher tier, with the deliverable as the only realized loss when ripped. Over-backing relative to the deliverable means rippers drain the backing via the floor.

### Pool health

The pool's **harmonic-mean backing** is the health metric to watch: flat pricing stays fair only while it sits near the rip price. Monitor it; if 7.1/7.2 can't hold it near `$25`, dynamic harmonic-mean pricing (StockRip's approach — one running aggregate) is the v2 escape hatch.

## 8. Worked example — a "Rare" pack

Illustrative prices: AMZN $200, TSLA $340, AMD $160.

- **Deliverable:** 0.15 AMZN ($30) + 0.03 TSLA ($10) → **$40 NAV**
- **Backing:** 0.25 AMD → **$40** → floor `$34`
- **Tier:** Rare · **Rip price:** $25 · check: `$40 ≥ $34` ✓

Ripper: pays $25, wins a $40 basket (worst case $34 off the AMD floor).
Creator if not ripped: farms $BLOW, AMD may appreciate in escrow, can delist to reclaim all $80.
Creator if ripped: `+$22.50 − $40 deliverable + $40 backing = −$17.50` on that pull, plus $BLOW already farmed.

**Bad pack (violates the rule):** $40 deliverable, $200 AMD backing → floor $170 > $40 → every ripper takes the floor → creator nets `−$147.50`. Never over-back the deliverable.

## 9. $BLOW reward token

- `$BLOW` is a **custom ERC-20 the protocol deploys and controls** — not a bankr launch. For the V1 testnet Season it is **earn-only and transfer-restricted**: external `transfer`/`transferFrom` are disabled, and it is acquired **only through gameplay** (creator emissions + rip participation rewards). There is no in-app purchase in V1. The contract still ships with an **owner-gated, evented, one-way switch to enable external transferability later** — the hook for a post-testnet token launch, unexercised during the Season. It is not the backing asset and not the rip-payment asset.
- **Emissions:** creators farm `$BLOW` while a pack is listed **and above the emission gate** (`deliverableNAV ≥ $25`, locked — the rip price), weighted by **deliverable NAV × eligible time** ("more valuable pack → more $BLOW"). A pack between the `$22.50`selection floor and the`$25` gate stays selectable but earns nothing. Traders earn `$BLOW` per confirmed rip.
- **Rip payment:** stablecoin. `$BLOW` is not spent to rip in V1 and has no in-app buy — it is purely earned. Its value model, any purchase, and external transferability are all deferred to the post-testnet **token-launch strategy** (§11). Backing is never `$BLOW`.

**Load-bearing assumption.** Under §7.1, a pack at the gate is wash-neutral and every pack _above_ it hands the ripper more value than the creator collects — so above-gate inventory is a **net stock loss to the creator, paid for in `$BLOW`.** The entire supply of desirable (high-value, high-tier) packs therefore rests on `$BLOW` being worth enough to make creators list at a stock loss. If `$BLOW` value collapses, above-gate inventory dries up and the pool decays toward gate-value packs. This is the core economic risk of the design and must be disclosed in creator-facing copy.

## 10. Data model

### Per-pack state (extends `PackCustody.sol`)

`PackCustody` today records only the deliverable basket, `creatorOf`, and the `_unlisted` latch. The backing model adds:

```solidity
struct Backing { address asset; uint256 amount; }   // single-asset
mapping(uint256 tokenId => Backing) public backingOf;
```

- `mint(deliverableAssets[], deliverableAmounts[], backingAsset, backingAmount)` escrows both piles in one tx. Backing asset must be whitelisted; backing amount > 0.
- Existing deliverable basket = the current `_basketAssets` / `_basketAmounts` (unchanged; additions-only top-ups still apply to the deliverable).
- `delistAndRedeem` / `unwrap` release **both** piles (deliverable + backing) to the caller at zero fee.

### Off-chain / engine-derived (not stored)

- `backingUSD`, `weight`, `odds`, `tier` — computed from `backingOf` + Chainlink feeds each window.
- `deliverableNAV` — summed from the deliverable basket + feeds.
- Eligibility (NAV within pool bounds), emission accounting, and the frozen per-window eligible set.

### New settlement authority

A rip/settle path (RipEngine or a `PackCustody` extension) must: verify the `$25` payment, transfer the Pack + piles to the trader, and execute the `max(deliverableNAV, 0.85×B)` settlement with the conservation table in §6. Odds/tier are read-only views over `backingOf`; the on-chain draw remains a disclosed House operation for V1.

## 11. Open decisions

Resolved: the odds curve is `1/B` (§3). The **selection floor / wash-guard is locked at `$22.50`** (rip proceeds — the point where a pack stops being a profitable wash-trade, §7.1). The **emission gate is locked at `$25`** (the rip price — `$BLOW` rewards only packs that beat the ripper's cost). `$BLOW` is **earn-only and transfer-restricted** in V1 (gameplay rewards only, no in-app buy); the value model, any purchase, external transferability, and enable-switch timing are deferred as a post-testnet token-launch bundle (§9).

- Launch value for `B_min` (dust-backing floor, §7.2), the rarity-band thresholds, and the `0.85` floor haircut (all versioned config).
- Emission weighting exponent on deliverable NAV (linear vs `√`) and epoch length.
- Whether settlement is always auto-resolved to the better pile, or traders may opt to take the floor even when the deliverable is worth more (relevant once traders are less clockwork).
- Chainlink feed availability per whitelisted ticker; controlled feed doubles where absent.
- **Post-testnet token-launch strategy (deferred as a bundle).** V1 ships `$BLOW` earn-only and transfer-locked. Everything about turning it into a launched token — the value model (fee-backing vs use-to-rip sink vs speculation), any in-app or external purchase and its price/supply source, and when to throw the enable-transfer switch — is decided _after_ testnet, informed by the Season's data. Keep-open guardrails so this stays free: (1) leave protocol fee revenue uncommitted (preserves fee-backing); (2) keep RipEngine's payment path able to accept a `$BLOW` cost later (preserves the sink); (3) keep the reserved mint role + one-way enable switch in the token (#283).
- **Enable-transfer switch hardening:** whether the one-way switch also carries a timelock (v0.5 used 72h). Reversibility is off the table — it is one-way.
