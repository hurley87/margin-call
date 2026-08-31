# Stock Gacha MVP on Base

> **Status: product plan, not implemented.** This document proposes the first simple Margin Call game. It intentionally ships before the larger shared-inventory protocol described in [Proposed Margin Call Protocol Overview](./margin-call-protocol-overview.md).

## Decision summary

Build a simplified version of [StockRip](https://stockrip.com/docs) on Base:

- use the four Coinbase-issued B20 stocks available at launch;
- let users deposit fractional stock positions as lots;
- grade each lot by its current USDC net asset value rather than ETH backing;
- let buyers pay USDC to rip one randomly selected lot;
- transfer the actual B20 stock directly to the buyer;
- settle the selected depositor at the lot's locked USDC value;
- launch $CALL through Bankr on Base and distribute it from a separately funded rewards vault; and
- do not block this game on the generalized Margin Call protocol.

The MVP should prove one loop:

**Deposit a real stock lot → price the pool → pay USDC → select a lot fairly → settle the depositor → deliver the stock → accrue $CALL rewards.**

## What we borrow from StockRip

- user-supplied tokenized-stock inventory;
- inverse-value selection weighting, so high-value lots are rarer;
- a pool-derived rip price based on expected value;
- verifiable randomness;
- actual tokenized-stock delivery; and
- a native reward token that bootstraps both supply and demand.

## What we remove for the MVP

- ETH grades or ETH backing;
- depositor-funded standing buybacks;
- NFT baskets and token-bound accounts;
- multi-stock lots;
- keep-as-NFT, sell-back, and relist settlement choices;
- card staking;
- crowned-depositor mechanics;
- complex fee sharing;
- concurrent or batched rips; and
- dependency on the future shared Margin Call protocol.

A successful rip has one outcome: the buyer receives the selected stock lot.

## Supported assets

The launch registry contains exactly the four Coinbase Tokenized Stocks currently listed on Base:

| Stock | Symbol | B20 address | Chainlink total-return feed |
| --- | --- | --- | --- |
| NVIDIA | NVDAc | 0xb20000000000000000000078ee7ce2fE4908108C | 0x04689a41629776563E6822F76f2e57D148d28513 |
| Meta | METAc | 0xb2000000000000000000008bC8786B856E61707C | 0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D |
| Apple | AAPLc | 0xb200000000000000000000C2e324d24d7eEcd1fb | 0x787f13dEa48Db0897CbCDD985de77809D837F988 |
| Alphabet | GOOGLc | 0xb2000000000000000000002D0BA3164cc74f58B7 | 0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2 |

Addresses must be checked against the [official Base B20 integration documentation](https://docs.base.org/base-chain/specs/reference/b20/tokenized-stocks-on-base) immediately before deployment. Contracts identify assets by address, never by mutable ticker metadata.

The registry also stores token decimals, feed decimals, maximum price age, minimum lot value, maximum lot value, and enabled/paused status.

## Product vocabulary

**Maker** — a user who deposits a supported B20 stock lot.

**Lot** — one quantity of one supported B20 stock deposited by one Maker. A lot is a contract record, not an NFT.

**Grade** — the lot's current oracle-valued NAV in USDC terms. It is not separately funded backing.

**Ripper** — a buyer who pays USDC for a random active lot.

**Rip** — one USDC purchase followed by a verifiably random lot selection and settlement.

**Rip Price** — the pool's inverse-NAV-weighted expected lot value plus a surcharge.

**House Reserve** — USDC supplied by the game treasury to cover the difference when a selected lot is worth more than that rip's purchase price.

**$CALL Rewards Vault** — a separately funded contract that holds fixed-supply $CALL and pays budgeted Maker and Ripper rewards.

## User experience

### Maker journey

1. Connect a wallet.
2. Choose NVDAc, METAc, AAPLc, or GOOGLc.
3. Enter a fractional token amount.
4. Preview the live grade, estimated selection odds, and current $CALL reward rate.
5. Approve the B20 token and create the lot.
6. The game transfers the tokens into custody and activates the lot if its grade is within the allowed range.
7. While active, the Maker accrues $CALL rewards.
8. If the lot is ripped, the Maker receives its locked NAV in USDC.
9. If the lot has not been ripped, the Maker may withdraw it whenever no rip is pending.

One deposit creates one single-asset lot. Supporting baskets later should not complicate the first contract.

### Ripper journey

1. See the current Rip Price, active lots, value distribution, and exact odds.
2. Approve USDC.
3. Submit one rip with a maximum acceptable price and deadline.
4. The game escrows the quoted USDC and requests Chainlink VRF.
5. The interface shows a pending reveal.
6. Anyone may finalize after randomness arrives.
7. The selected lot's B20 tokens transfer directly to the Ripper.
8. The selected Maker receives the lot's locked NAV in USDC.
9. The completed rip becomes eligible for a $CALL reward.

There is no mystery credit or internal stock balance. A settled Ripper owns the actual B20 tokens.

## Lot grading

For each active lot i:

- amount_i is the deposited raw B20 amount;
- price_i is the fresh Chainlink total-return price for that Coinbase stock; and
- NAV_i is the USDC value of the lot after normalizing token and feed decimals.

Coinbase's Chainlink feeds already include the B20 multiplier. The implementation must not apply the corporate-action multiplier a second time.

The alternative equivalent calculation is scaled B20 balance multiplied by the underlying equity price. The contract must choose one method and test it against the other; it must never mix both methods.

A lot is eligible only when:

- the asset is enabled;
- its feed answer is positive;
- its feed is not paused;
- its price is fresh;
- its grade is at or above the minimum;
- its grade is at or below the maximum; and
- the B20 amount is still fully held by the game.

The starting proposal is a $20 minimum and $300 maximum lot grade. These are risk controls, not permanent product promises.

Because the official feeds update 24/5 and hold their last value when closed or paused, the simple MVP fails closed: new deposits and rips pause when any price needed for the active pool is stale. A later design may add a carefully bounded 24/7 market-price adapter.

## Odds and Rip Price

A lot's selection weight is inversely proportional to its grade:

~~~
weight_i = 1 / NAV_i
probability_i = weight_i / sum(all active weights)
~~~

High-value lots therefore appear less frequently than low-value lots.

Using the same weights, the expected value of one selected lot is the harmonic mean:

~~~
expectedNAV = sum(weight_i * NAV_i) / sum(weight_i)
            = activeLotCount / sum(1 / NAV_i)

ripPrice = expectedNAV * (1 + surchargeBps / 10,000)
~~~

The starting surcharge proposal is 10%. It must be configurable within a hard onchain maximum.

Before purchase, the interface displays:

- current Rip Price;
- expected NAV;
- surcharge;
- each active lot's grade and probability;
- minimum and maximum possible outcome; and
- price age.

The Ripper supplies maxPrice and deadline. The request reverts rather than silently accepting a worse quote.

### Price snapshot

V1 permits only one pending rip at a time. When a rip is requested, the game snapshots the active lots, grades, weights, Rip Price, and maximum possible selected NAV. Deposits and withdrawals pause until that rip settles or refunds.

This global lock deliberately trades throughput for a much smaller and safer first contract. Parallel requests and a weighted tree can follow after the loop is proven.

## USDC economics

The Ripper pays the quoted Rip Price. The selected Maker receives the selected lot's full locked NAV.

The House Reserve absorbs per-rip variance:

- if the selected NAV is greater than the Rip Price, reserve USDC covers the difference;
- if the selected NAV is lower than the Rip Price, the remainder stays in the reserve; and
- in expectation, the reserve earns the surcharge before randomness costs, $CALL incentives, and operating expenses.

At request time, the contract reserves enough USDC to settle the most expensive possible result from that snapshot:

~~~
requiredCoverage = max(0, maxSelectedNAV - ripPrice)
~~~

A rip cannot begin unless that coverage is available. The reserved amount cannot be withdrawn until the rip settles or refunds.

For the MVP, Makers receive:

- the locked NAV when their lot is selected; and
- separately budgeted $CALL rewards while their lot is active.

They do not also receive a share of the surcharge. That separation keeps principal settlement, game margin, and token incentives understandable.

The treasury must seed the House Reserve before rips open. The exact seed should be chosen from a simulation of the initial lot range, pool size, and expected volume.

## Randomness and settlement

Use [Chainlink VRF v2.5 on Base](https://docs.chain.link/vrf/v2-5/supported-networks) for the production selection source.

The request flow is intentionally asynchronous:

1. Escrow the Ripper's USDC.
2. Snapshot the eligible pool and reserve worst-case settlement coverage.
3. Request one VRF word.
4. Record the returned word without transferring assets inside the VRF callback.
5. Let any caller execute settlement.
6. Map the word into the snapshot's total weight.
7. Select exactly one lot.
8. Pay the selected Maker its locked NAV.
9. Transfer the complete B20 lot to the Ripper.
10. Release unused reserve and mark the rip complete.

The VRF callback should never attempt complex token transfers. It only records randomness so a B20 or USDC transfer failure cannot permanently break callback delivery.

If settlement cannot complete because an asset becomes paused or a B20 policy rejects a transfer:

- the selected lot is disabled;
- the Ripper receives a full USDC refund;
- the Maker retains the lot claim;
- reserved House USDC is released; and
- the failed selection remains visible in history.

A timeout path must allow the Ripper to refund if randomness or settlement does not complete within the configured deadline.

## $CALL launch and rewards

$CALL launches through [Bankr](https://docs.bankr.bot/token-launching/overview/) explicitly on Base.

Bankr's current standard launch creates a fixed, non-mintable 100 billion token supply:

- 85% seeds immediate liquidity; and
- 15% vests to the launch recipient over one year with a 30-day cliff.

These are external launch rules, not game-contract assumptions, and must be rechecked before launch.

The game does not receive mint authority and does not depend on Bankr for reward accounting. $CALL is an ordinary ERC-20 input to a separate rewards vault.

### Funding the game contract

The rewards vault exposes a permissionless funding path:

~~~
fundRewards(amount):
    transferFrom(msg.sender, rewardsVault, amount)
    emit RewardsFunded(msg.sender, amount)
~~~

Anyone can therefore approve and deposit $CALL into the game. Funding does not grant admin rights, change odds, or create a withdrawal claim.

Recommended launch flow:

1. Launch $CALL on Base through Bankr.
2. Set the creator allocation and creator-fee recipient to a treasury wallet or Safe, not the game contract.
3. Wait through Bankr's launch anti-snipe period.
4. Acquire the $CALL required for the first reward epochs on the open market.
5. Approve the rewards vault and call fundRewards.
6. As the creator allocation vests, claim unlocked $CALL to the treasury and deposit additional rewards.
7. Optionally use Bankr creator fees to replenish the House Reserve or acquire more $CALL.

The Bankr liquidity pair and the game's payment asset are separate concerns. Game rips use USDC even if $CALL trades against WETH or another Bankr-supported quote token.

### Reward accounting

Use fixed, pre-funded epochs. An epoch cannot promise more $CALL than the uncommitted vault balance.

Starting distribution proposal:

- 70% to Makers, weighted by the square root of time-weighted active NAV; and
- 30% to Rippers, weighted by completed rips.

Square-root Maker weighting rewards more supplied value without allowing the largest lots to capture rewards linearly. Minimum lot NAV and one-lot accounting limit dust farming.

For the first implementation, an offchain indexer calculates epoch allocations and the owner publishes a Merkle root with the exact funded total. Users claim onchain. The vault enforces:

- cumulative epoch allocations never exceed deposited $CALL;
- each leaf can be claimed once;
- committed rewards cannot be withdrawn;
- a replaced root can only reduce no user's already claimed amount; and
- an emergency pause stops new epochs but not valid claims.

$CALL is not required to deposit or rip, and holding it does not improve odds or stock payouts in the MVP.

## Suggested contract boundary

### StockGacha

Owns:

- the four-asset registry;
- B20 custody and lot state;
- Chainlink price validation;
- pool snapshots and inverse-NAV weights;
- USDC escrow and House Reserve accounting;
- VRF request and result state;
- Maker settlement;
- B20 delivery and refunds; and
- pause and bounded parameter controls.

### CallRewardsVault

Owns:

- permissionless $CALL deposits;
- available versus committed reward balances;
- epoch roots and totals;
- claims; and
- reward-specific pause controls.

Keeping $CALL accounting separate prevents a reward bug from touching stock custody or USDC settlement.

### Offchain services

Convex and the application indexer may provide:

- lot and rip history;
- pool analytics and odds previews;
- pending VRF status;
- reward-epoch calculation;
- Merkle proofs; and
- notifications.

Contracts remain authoritative for custody, prices accepted at request time, randomness, settlement, and claims.

## MVP surfaces

### Rip

- live Rip Price and expected NAV;
- one-rip purchase action;
- reveal animation;
- received stock and value;
- current pool distribution; and
- verifiable transaction and randomness links.

### Deposit

- supported-stock balances;
- amount and grade preview;
- odds and estimated $CALL rewards;
- active lots; and
- withdraw action.

### Portfolio

- stocks won;
- lots currently active;
- USDC earned;
- claimable $CALL; and
- personal rip/deposit history.

### Activity

- deposits;
- rip requests;
- random results;
- settlements;
- refunds;
- lot withdrawals; and
- reward funding and claims.

## Required invariants

1. Only the four configured Coinbase B20 addresses can enter custody.
2. Every active lot is fully backed by the exact B20 amount recorded.
3. A lot can be active, locked, selected, withdrawn, or failed—never more than one state at once.
4. A selected lot can settle only once.
5. The buyer receives the complete selected B20 amount or receives a full refund.
6. The selected Maker receives the complete locked NAV or keeps the lot claim.
7. The corporate-action multiplier affects NAV exactly once.
8. No new rip uses a missing, paused, non-positive, or stale price.
9. Selection probability is derived only from the public snapshot and VRF word.
10. A pending rip cannot be undercollateralized against its maximum possible selected NAV.
11. House Reserve, pending USDC, Maker proceeds, and withdrawable treasury USDC are accounted separately.
12. Committed $CALL rewards never exceed deposited $CALL.
13. No admin path can seize Maker stock, Ripper stock, Maker proceeds, or committed $CALL rewards.

## Explicit non-goals

- the generalized Margin Call shared-inventory protocol;
- permissionless asset listing;
- legal or geographic access controls;
- NFT packs;
- ETH backing or buybacks;
- stock baskets;
- cash redemption of won stocks;
- lending idle stocks;
- $CALL governance, staking, or fee sharing;
- multiple simultaneous rips;
- gas sponsorship;
- mobile-native applications; and
- a 24/7 fallback oracle.

## Implementation phases

### Phase 1: simulation and contract specification

- model pool composition, inverse-NAV odds, reserve variance, and surcharge;
- choose minimum and maximum grades, initial reserve, and pool caps;
- define the B20 unit adapter and feed freshness policy;
- specify every state transition and timeout; and
- convert the invariants above into Foundry tests.

### Phase 2: Base fork and testnet prototype

- implement StockGacha with mocked B20s, USDC, feeds, and VRF;
- implement CallRewardsVault;
- test multiplier changes, stale feeds, failed B20 transfers, refunds, and reward exhaustion;
- build the Rip, Deposit, Portfolio, and Activity surfaces; and
- prove the entire loop with reproducible transactions.

### Phase 3: constrained Base launch

- verify the four canonical B20 addresses and feeds;
- deploy and fund the House Reserve;
- launch $CALL through Bankr on Base;
- acquire and deposit the first $CALL reward budget;
- cap active lots, lot value, and one-rip throughput;
- monitor solvency, settlement latency, feed freshness, and reward spend; and
- expand limits only after observed behavior matches the simulation.

## Decisions still required before implementation

- final minimum and maximum lot grade;
- surcharge and maximum allowed surcharge;
- maximum active lot count;
- initial House Reserve size;
- maximum VRF and settlement timeout;
- exact feed freshness policy outside market hours;
- Base mainnet USDC address and transfer behavior;
- reward epoch length and first $CALL budget;
- final Maker/Ripper reward split;
- treasury and emergency-admin addresses; and
- whether the MVP launches directly on Base mainnet or first uses mocked B20 assets on Base Sepolia.

## Success criteria

The MVP succeeds when an external observer can verify that:

1. a user deposited one of the four real Coinbase B20 stocks;
2. the game valued the lot from the approved feed;
3. another user paid USDC against a public price and odds snapshot;
4. Chainlink VRF selected the lot;
5. the depositor received the locked USDC NAV;
6. the buyer received the actual B20 stock;
7. both users could claim only pre-funded $CALL rewards; and
8. no generalized Margin Call protocol was required to complete the loop.
