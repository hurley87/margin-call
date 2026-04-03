# Trader Fuel Token

> Future feature exploration for adding a single ERC-20 token that players earn from successful deals, stake for lower fees, and burn to revive wiped-out traders.

## Summary

The game already has two strong assets:

- `USDC` for bankroll, escrow, deal pots, and payouts
- Trader NFTs for identity, ownership, and reputation

This feature adds a third asset with a very narrow purpose:

- win deals to earn the token
- stake the token to reduce rake
- burn the token to revive dead traders

The token should be treated as desk fuel, not settlement currency. It powers progression and survival around the core PvP loop without replacing `USDC` as the unit of account.

---

## Why This Fits The Game

The core fantasy is not passive holding. It is running a dangerous desk:

- funding traders
- surviving wipeouts
- squeezing more profit out of each win
- keeping a strong trader alive long enough to build a record

A fuel token supports that fantasy cleanly:

- winning produces fuel
- fuel improves desk economics
- fuel can save a trader from permanent death

That is much easier to explain than governance, voting, or abstract roadmap utility.

---

## Recommended Product Shape

### 1. Earn on successful deals

When a trader wins a deal, the desk manager earns token rewards alongside the `USDC` outcome.

The simplest useful version is a fixed reward table based on the significance of the win rather than a complicated emissions formula.

Example:

- small win: `+5`
- medium win: `+15`
- large win: `+40`

The reward can be determined from one or more of:

- realized `USDC` profit
- deal pot size
- entry cost tier
- deal risk band

Keep the first version intentionally legible. Players should be able to predict roughly what they are earning.

### 2. Burn to revive a wiped trader

This should be the primary sink.

When a trader is wiped out, the desk manager can burn tokens to revive that trader instead of minting a brand-new one immediately.

Recommended rules:

- revival restores the trader to an active state
- revival does not mint new `USDC`
- the trader returns with `0` bankroll and must be funded again
- reputation history remains intact

To prevent immortality, revival cost should increase with each revival.

Example:

- first revive: `250`
- second revive: `500`
- third revive: `1000`

An escalating cost preserves the drama of death while still giving players a meaningful recovery path.

### 3. Stake for lower fees

Desk managers can stake tokens at the wallet level to reduce rake on winnings.

Recommended principles:

- stake per desk manager wallet, not per trader
- make discounts meaningful but bounded
- do not reduce rake to zero

Example:

- no stake: `10.0%` rake
- `10,000` staked: `9.5%`
- `50,000` staked: `9.0%`
- `150,000` staked: `8.0%`

This creates a clean reason to hold the token without turning it into direct pay-to-win.

---

## Design Principles

### 1. Keep `USDC` as the settlement asset

The token should not replace `USDC` for:

- deal creation
- trader funding
- escrow balances
- payouts

`USDC` keeps the risk loop readable and stable. The token sits around that loop as fuel.

### 2. Do not make the token affect win odds directly

Holding or staking more token should improve economics, not outcomes.

Good:

- lower rake
- survival utility
- future progression utility

Bad:

- better LLM outcome odds
- higher extraction caps
- direct combat advantage

This preserves competitive integrity and avoids obvious pay-to-win complaints.

### 3. Keep the loop narrow

The strongest version of this feature is intentionally small:

- earn
- stake
- burn

Avoid adding governance, bonding, voting, or seasonal systems in the first implementation.

### 4. Revival should preserve consequences

Death must still matter.

A revived trader should return with:

- the same identity
- the same track record
- no new bankroll

That keeps revival from acting like a free reset button.

---

## Gameplay Impact

This feature strengthens several existing loops:

### Stronger post-win progression

Winning does more than increase `USDC` bankroll. It also powers future desk optimization.

### Meaningful recovery after wipeouts

Players get a second-chance mechanic that is tied to performance, not pure spending.

### More desk-level strategy

Managers can choose between:

- staking for better long-term margins
- holding liquid token for emergency revives

That tradeoff is intuitive and should create good tension.

---

## Suggested Contract / System Shape

The cleanest implementation is to keep the token logic mostly adjacent to the escrow contract, not merged into every settlement path.

High-level components:

- `FuelToken` ERC-20 contract
- `FuelStaking` contract for rake tiers
- revival logic in the game contract or an authorized token sink
- reward minting or distribution hook triggered after validated winning outcomes

### Settlement interaction

At a high level:

1. deal resolves in `USDC`
2. escrow settles balances as it does today
3. if the outcome is a valid win, the system awards token rewards
4. if the trader is wiped out later, the desk manager may burn tokens to revive

This keeps the money flow and the fuel flow conceptually separate.

### Rake tier lookup

The escrow or settlement path should read a simple fee tier for the desk manager's wallet.

Example interface:

```solidity
interface IFuelStaking {
  function getRakeBps(address account) external view returns (uint16);
}
```

### Revival hook

Revival should be explicit and auditable:

```solidity
function reviveTrader(uint256 traderId) external;
```

Expected checks:

- caller owns the trader NFT
- trader is currently wiped out
- required token amount is burned
- revival count increments
- trader status changes back to active

---

## Anti-Abuse Rules

This feature is easy to understand, but it still needs guardrails.

### Reward farming

Without protections, a player could try to create low-quality or self-serving loops that emit token rewards too cheaply.

Suggested controls:

- no rewards for obviously invalid or zero-value outcomes
- minimum deal size before rewards apply
- no rewards for self-dealing patterns if detectable
- optional daily cap per trader or desk

### Stake hopping

Players should not be able to stake immediately before a win and unstake immediately after settlement with no tradeoff.

Suggested controls:

- unstake cooldown
- minimum warm-up period before discounts apply
- or snapshot-based tiering

### Infinite revive loop

If revival is too cheap, death loses meaning.

Suggested controls:

- escalating revival cost
- optional hard cap on revives
- revived traders return unfunded

### Oversupply

If rewards are too generous relative to staking demand and revival burns, the token will feel inflated quickly.

Suggested controls:

- conservative win rewards at launch
- meaningful revive costs
- shallow but attractive staking tiers

---

## Rollout Path

### Phase 1

Add token rewards on successful deal outcomes and surface token balance in the desk UI.

### Phase 2

Add staking with simple rake discount tiers.

### Phase 3

Add trader revival using token burn with escalating cost.

### Phase 4

If needed later, add one more sink such as rerolling or retraining a trader. This should only happen if the first three mechanics do not create enough demand.

---

## Naming Note

The role of the token is clearer than its final name.

Strong candidates so far:

- `JUICE`
- `POWDER`
- `RUSH`

`COCAINE` is the most aggressive and memorable option, but it likely creates more friction with partners, platforms, and distribution than the alternatives.

`JUICE` currently feels like the strongest balance of:

- thematic fit
- ease of use in product copy
- lower branding risk

Example copy:

- win deals, earn `JUICE`
- stake `JUICE` for lower fees
- burn `JUICE` to revive a trader

---

## Open Questions

Questions worth revisiting before implementation:

1. Should rewards be minted directly on each win, or emitted from a fixed treasury?
2. Should revival cost depend only on prior revives, or also on trader reputation / level?
3. Should a revived trader keep every historical stat, or should some metrics mark the revive event visibly?
4. How much of a fee discount is enough to matter without making staking mandatory?
5. Is one additional future sink needed, or are earn plus stake plus revive enough on their own?
