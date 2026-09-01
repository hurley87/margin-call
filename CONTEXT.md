# Margin Call

Margin Call is between product versions. The Crash game has been retired.

The next product is proposed, not implemented. The immediate product is the standalone Stock Gacha MVP; the generalized Margin Call protocol remains a later proposal. This file is a glossary and nothing else: it fixes canonical product language so specifications, contracts, and UI copy stay aligned. Mechanics belong in [the design docs](./docs/), not here.

## Stock Gacha language

**Stock Gacha MVP**:
The first game proposed for Base, in which users deposit real tokenized stocks and buyers pay USDC for a random one.
_Avoid_: the game, gacha, Stock Rip

**Maker**:
A user who deposits a supported stock lot.
_Avoid_: LP, liquidity provider, depositor, provider

**Lot**:
One quantity of one supported stock deposited by one Maker.
_Avoid_: position, listing, basket, pack

**Grade**:
A lot's fixed USDC valuation, which determines its selection odds.
_Avoid_: NAV, backing, value, price

**Payout**:
What a selected Maker receives for their lot. It is a different number from the grade.
_Avoid_: settlement amount, proceeds, principal

**Ripper**:
A buyer who pays for one random lot and names the wallet that will receive it.
_Avoid_: player, purchaser, winner

**Recipient**:
The wallet a Ripper names at purchase to receive the stock. It need not be the Ripper's own.
_Avoid_: winner, beneficiary

**Rip**:
One purchase of one randomly selected lot.
_Avoid_: draw, pull, roll, spin, acquisition

**Rip Price**:
What a Ripper pays for one rip.
_Avoid_: entry price, ticket price, cost

**Randomness Fee**:
The pass-through cost of one randomness request, quoted separately from the house surcharge.
_Avoid_: VRF fee, oracle fee

**Drift Bound**:
The limit a Ripper sets on how far the pool's value may move before their rip refunds instead of drawing.
_Avoid_: slippage, tolerance

**House Reserve**:
The game's own USDC, held on-chain to cover a payout larger than its rip price.
_Avoid_: bankroll, float, treasury, house money

**Treasury**:
The off-chain wallet that funds the House Reserve and receives token allocations. Never a synonym for the House Reserve.
_Avoid_: house, ops wallet

**Reward token**:
A standard ERC-20 explicitly whitelisted for pre-funded Maker rewards.
_Avoid_: emission, incentive token, points

**Rewards Vault**:
The separate contract holding whitelisted reward tokens and each Maker's claimable balance.
_Avoid_: distributor, emissions contract

## Proposed protocol language

**Margin Call**:
The proposed shared protocol that holds and accounts for approved real financial inventory for use by permissionless applications.

**Inventory contributor**:
A wallet or application whose deposited inventory stays attributable to them for earnings, withdrawal, and audit.
_Avoid_: supplier, LP

**Approved asset**:
An asset accepted under the V1 operator's public asset registry.
_Avoid_: listed asset, supported token

**Available inventory**:
Approved deposited units currently free for an application to reserve or allocate.
_Avoid_: shared pool, liquidity

**Reserved inventory**:
Inventory locked for one pending application obligation.
_Avoid_: held, escrowed

**Ownership claim**:
A vested, non-expiring record of user ownership backed by locked protocol inventory.
_Avoid_: receipt, voucher, IOU

**Protocol-quoted value**:
The USDC value an asset's registry-approved price adapter returns. Applications never supply it.
_Avoid_: price, valuation, mark

**Inventory principal**:
The locked protocol-quoted value an application settles to the contributor. Separate from the allocation fee.
_Avoid_: cost, purchase price

**Allocation fee**:
The application-access fee charged as a percentage of locked protocol-quoted value.
_Avoid_: commission, spread, rake

**Allocation**:
The atomic transition in which an application settles principal and fee, and a funded user ownership claim is created.
_Avoid_: purchase, mint, redemption

**Stock Gacha**:
The future protocol-backed form of the game, distinct from the standalone MVP that owns its own custody.
