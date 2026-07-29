# Margin Call

A Pack-ripping game on Robinhood Chain with one global pool. Makers permissionlessly fund Packs of tokenized stocks; Takers rip Packs (up to a batch cap) at a price that tracks the expected value of the draw. Packs are drawn with probability inversely weighted by NAV. There are no windows, Seasons, or automated trader agents — a user acts directly as Maker and/or Taker.

## Language

**Pack**:
A transferable ERC-721 backed by a recorded basket of approved Stock Tokens, held in protocol custody until unwrapped.
_Avoid_: box, crate, bundle, loot box

**Rip**:
The single, settled act of a Taker paying the Rip Price and receiving one Pack drawn from the eligible set with odds inversely weighted by NAV (`weight ∝ 1/NAV^alpha`). A Taker may rip up to `maxBatchSize` Packs in one transaction. A Rip settles exactly once.
_Avoid_: open, buy, pull

**Rip Price**:
The stablecoin price a Taker pays per Rip. Dynamic, computed live at Rip time: `harmonic_mean(eligible NAVs) × (1 + surcharge)` — the expected value of the draw plus the maker–taker spread. Bounded to `[minPackNav, poolMax] × (1 + surcharge)`, where `minPackNav` is the owner-set NAV floor (`setMinPackNav`) that serves as both price floor and dust guard. Every Rip is −surcharge in expectation.
_Avoid_: entry fee, ticket price

**Maker**:
A user in the create role: funds a Pack with an approved stock basket and provides it as inventory. Short for market maker — provides liquidity and earns the surcharge (the maker's spread) via the Acquisition Fee, plus Maker Emissions. Made whole in stablecoin regardless of what the Pack holds.
_Avoid_: creator, supplier, issuer

**Taker**:
A user in the rip role: pays the Rip Price, receives a randomly drawn Pack, and earns a share of the Participation Rewards pot. The counterparty to a Maker; removes liquidity and pays the spread.
_Avoid_: player, buyer, ripper (informal only)

**Pool**:
The single global set of eligible Packs. Selection and pricing operate over one pool; band, asset set, surcharge, and fees are global protocol config. Multiple pools are a possible post-V1 expansion.
_Avoid_: tier, market

**Eligible Set**:
The Packs that pass all objective checks (funding, asset rules, oracle freshness, NAV within `[minPackNav, poolMax]`, non-frozen asset) at the moment of a Rip and can therefore be drawn. Draw odds are inversely weighted by NAV. A batch of up to `maxBatchSize` is priced off one snapshot at transaction start and drawn without replacement.
_Avoid_: inventory, supply

**Asset Registry**:
The owner-controlled whitelist of approved Stock Tokens. Per asset: token address, TWAP price feed, staleness bound, status (Active/Frozen/Delisting), and live inventory. The owner can add assets, remove them (only at zero inventory), and freeze them; a frozen asset leaves both the selection weight set and the price basket until unfrozen.
_Avoid_: allowlist (as a standalone term)

**Acquisition Fee**:
The Rip payment (minus the protocol cut) socialized across all resting eligible Packs at an equal rate per Pack, rather than paid to the drawn Pack's Maker (settlement Model A). A Maker's make-whole return for providing inventory. Because a Pack's expected loss rate is constant across NAV at α=1, equal-rate fees make every Pack whole; a valuable Pack earns proportionally more only through its longer dwell time in the pool.
_Avoid_: sale proceeds, payout

**Surcharge**:
The maker–taker spread added to the harmonic-mean base (`rip_price = harmonic_mean × (1 + surcharge)`). Paid by the Taker, split between the protocol (a configurable share of the surcharge only) and resting Makers. The base is never touched by the protocol cut, so Makers are always made at least whole.
_Avoid_: house edge (informal only), fee (unqualified)

**Maker Emissions**:
A capped game-token allocation streamed to Makers for providing inventory. Not the make-whole return — that is the stablecoin Acquisition Fee; emissions are an extra steering layer. Post-V1 they are gap-weighted (the restock controller: `∝ gap^convexity ÷ inventory`) to hold the draw distribution near the owner's target. In V1 the controller is deferred and emissions ship as a simple equal-per-resting-Pack-per-epoch dress-rehearsal, because composition is House-managed and the token is transfer-locked. Never a return promise.
_Avoid_: yield, creator emissions

**Participation Rewards**:
A game-token allocation for Takers: a daily pot split among that epoch's confirmed Rips, so a Taker sees tokens earned. Bounded by the pot (never an uncapped per-Rip mint). Transfer-locked in V1; earned-only.
_Avoid_: cashback, rebate

**Game Token**:
The fixed-supply ERC-20 earned through Maker Emissions and Participation Rewards. Transfer-locked at launch; carries no selection weight, cadence benefit, or redemption right. The gap-weighted restock controller that steers composition via emissions is a post-V1 mechanism; V1 ships only the emissions plumbing (continuous capped stream + merkle claims + capped mint). Ticker is an open branding decision.
_Avoid_: points, currency

**NAV**:
The USD value of a Pack's recorded basket computed from approved TWAP feeds at a checkpoint. Display/eligibility/pricing input only — custody accounting is raw token units. The oracle values only the stock basket; USD constants and the stablecoin are par by definition (the peg is trusted).
_Avoid_: price, value (unqualified)

**Stock Token**:
A Robinhood-issued tokenized-stock ERC-20 on the approved whitelist, resolved from Robinhood's canonical contract registry.
_Avoid_: stock, equity, asset (unqualified)

**Checkpoint**:
A point where fresh oracle data re-evaluates a Pack's eligibility and NAV — every Rip, top-up, and claim, plus periodic re-checks. Stale or invalid stock-feed data fails closed.
_Avoid_: refresh, sync

**Claim Root**:
The per-epoch merkle root of off-chain-computed emission and reward entitlements, posted on-chain and reproducible by anyone from confirmed records. The token contract hard-caps each allocation independently of any posted root.
_Avoid_: payout snapshot

**Starter Grant**:
The one-time mock-stablecoin grant a new wallet receives so it can play, plus a rate-limited refill. Testnet-only onboarding, not a game reward.
_Avoid_: airdrop, faucet (reserve "faucet" for Robinhood's official Stock Token faucet)

**Pool Statistics**:
The live published stats of the pool's Eligible Set (Pack count, harmonic-mean NAV, current Rip price, NAV distribution) so users can judge expected value before ripping.
_Avoid_: pool health, pool quality

**House**:
The operator of selection and scheduling infrastructure, and — in V1 — the seed Maker that deposits and tops up Packs to maintain the target composition. As operator it can affect liveness but can never alter custody it does not own, change price, odds, or block the disclosed exit; as seed Maker it funds its own Packs exactly like any other user, with no privileged custody.
_Avoid_: admin, protocol (when meaning the operator)
