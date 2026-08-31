# Stock Gacha MVP on Base

> **Status: product plan, not implemented.** This document proposes the first simple Margin Call game. It intentionally ships before the larger shared-inventory protocol described in [Proposed Margin Call Protocol Overview](./margin-call-protocol-overview.md).

## Decision summary

Build a simplified version of [StockRip](https://stockrip.com/docs) on Base:

- use an intentional four-stock launch subset of the Coinbase-issued B20 inventory on Base;
- let users deposit fractional stock positions as lots;
- grade each lot by its current USDC net asset value rather than ETH backing;
- let buyers pay USDC to rip one randomly selected lot;
- transfer the actual B20 stock directly to the recipient bound by the buyer at purchase;
- settle the selected depositor at the lot's locked USDC value;
- launch $CALL through Bankr on Base and distribute it to stock LPs from a separately funded, multi-token rewards vault;
- allow additional standard ERC-20 rewards such as $BNKR after an admin explicitly whitelists them; and
- do not block this game on the generalized Margin Call protocol.

The MVP should prove one loop:

**Deposit a real stock lot → price the pool → atomically pay USDC and request randomness → select one immutable result → settle the depositor → deliver the stock → accrue LP rewards.**

## What we borrow from StockRip

- user-supplied tokenized-stock inventory;
- inverse-value selection weighting, so high-value lots are rarer;
- a pool-derived rip price based on expected value;
- verifiable randomness;
- actual tokenized-stock delivery; and
- pre-funded token rewards that bootstrap stock supply.

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

A paid rip is irrevocable and has one outcome: its bound recipient eventually receives the selected stock lot. It cannot be cancelled, refunded by choice, redrawn, or redirected after purchase.

## Supported assets

As of August 31, 2026, the [official Base B20 integration documentation](https://docs.base.org/base-chain/specs/reference/b20/tokenized-stocks-on-base) lists 13 Coinbase Tokenized Stocks and their Chainlink total-return feeds. The MVP intentionally launches with the following four-stock subset:

| Stock    | Symbol | B20 address                                | Chainlink total-return feed                |
| -------- | ------ | ------------------------------------------ | ------------------------------------------ |
| NVIDIA   | NVDAc  | 0xb20000000000000000000078ee7ce2fE4908108C | 0x04689a41629776563E6822F76f2e57D148d28513 |
| Meta     | METAc  | 0xb2000000000000000000008bC8786B856E61707C | 0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D |
| Apple    | AAPLc  | 0xb200000000000000000000C2e324d24d7eEcd1fb | 0x787f13dEa48Db0897CbCDD985de77809D837F988 |
| Alphabet | GOOGLc | 0xb2000000000000000000002D0BA3164cc74f58B7 | 0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2 |

The four are an intentional MVP launch subset chosen under four criteria: verified token and oracle addresses, acceptable launch inventory and liquidity, compatibility with the game's recipient-policy checks, and a deliberately constrained operational scope. The address pairs above are verified against the official Base page; inventory, liquidity, and recipient-policy compatibility must be re-evaluated immediately before deployment. Contracts identify assets by address, never by mutable ticker metadata.

The registry also stores token decimals, feed decimals, maximum price age, minimum lot value, maximum lot value, and enabled/paused status.

## Product vocabulary

**Maker** — a user who deposits a supported B20 stock lot.

**Lot** — one quantity of one supported B20 stock deposited by one Maker. A lot is a contract record, not an NFT.

**Grade** — the lot's current oracle-valued NAV in USDC terms. It is not separately funded backing.

**Ripper** — a buyer who pays USDC for a random active lot and binds one eligible delivery recipient at purchase.

**Rip** — one irrevocable USDC purchase and atomic VRF request followed by a verifiably random, immutable lot selection and retryable settlement to the bound recipient.

**Rip Price** — the pool's inverse-NAV-weighted expected lot value plus a surcharge.

**House Reserve** — USDC supplied by the game treasury to cover the difference when a selected lot is worth more than that rip's purchase price.

**Rewards Vault** — a separately funded contract that holds whitelisted ERC-20 incentives and additively credits claimable balances to stock LPs. $CALL is the primary launch reward; additional tokens such as $BNKR can be enabled without changing the game.

## User experience

### Maker journey

1. Connect a wallet.
2. Choose NVDAc, METAc, AAPLc, or GOOGLc.
3. Enter a fractional token amount.
4. Preview the live grade, estimated selection odds, and current reward rates.
5. Approve the B20 token and create the lot.
6. The game transfers the tokens into custody and activates the lot if its grade is within the allowed range.
7. While active, the Maker accrues claimable rewards through authorized, pre-funded reward batches.
8. If the lot is ripped, the Maker receives its locked NAV in USDC.
9. If the lot has not been ripped, the Maker may withdraw it whenever no rip is pending.

One deposit creates one single-asset lot. Supporting baskets later should not complicate the first contract.

### Ripper journey

1. See the current Rip Price, active lots, value distribution, and exact odds.
2. Approve USDC.
3. Choose one eligible recipient and submit one rip with a maximum acceptable price and purchase deadline.
4. In one transaction, the game validates the recipient, collects the quoted USDC, reserves House coverage, snapshots the pool, and requests Chainlink VRF. If the VRF request fails, the entire purchase reverts and no payment is accepted.
5. The interface shows a pending-randomness state. The payment cannot be cancelled or refunded after acceptance.
6. The VRF callback selects and records exactly one lot, reserves that inventory, and marks the rip fulfilled without transferring USDC or B20 tokens.
7. The Ripper, backend, keeper, or any other caller invokes `settle(ripId)`.
8. The selected lot's B20 tokens transfer to the bound recipient and the selected Maker receives the lot's locked NAV in USDC in one atomic settlement.
9. A failed settlement remains fulfilled, pending settlement, and retryable. The backend or keeper keeps submitting the same permissionless settlement until delivery succeeds; the Ripper or any other caller may also submit it. A successful settlement is permanent and subsequent settlement calls have no effect.

There is no mystery credit or internal stock balance. The bound recipient of a settled rip owns the actual B20 tokens.

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

```
weight_i = 1 / NAV_i
probability_i = weight_i / sum(all active weights)
```

High-value lots therefore appear less frequently than low-value lots.

Using the same weights, the expected value of one selected lot is the harmonic mean:

```
expectedNAV = sum(weight_i * NAV_i) / sum(weight_i)
            = activeLotCount / sum(1 / NAV_i)

ripPrice = expectedNAV * (1 + surchargeBps / 10,000)
```

The starting surcharge proposal is 10%. It must be configurable within a hard onchain maximum.

Before purchase, the interface displays:

- current Rip Price;
- expected NAV;
- surcharge;
- each active lot's grade and probability;
- minimum and maximum possible outcome; and
- price age.

The Ripper supplies `maxPrice` and a purchase deadline. Both are checked before payment, and the purchase reverts rather than silently accepting a worse quote. The purchase deadline is only a stale-transaction guard; it does not create a post-payment cancellation or refund right.

### Price snapshot

V1 permits only one unsettled rip at a time. When a rip is purchased, the game snapshots the active lots, grades, weights, Rip Price, and maximum possible selected NAV. Deposits and withdrawals pause until that rip settles. Once VRF fulfills the request, the selected lot is reserved for that rip and cannot be withdrawn, selected again, or redirected.

This global lock deliberately trades throughput for a much smaller and safer first contract. Parallel requests and a weighted tree can follow after the loop is proven.

## USDC economics

The Ripper pays the quoted Rip Price. The selected Maker receives the selected lot's full locked NAV.

The House Reserve absorbs per-rip variance:

- if the selected NAV is greater than the Rip Price, reserve USDC covers the difference;
- if the selected NAV is lower than the Rip Price, the remainder stays in the reserve; and
- in expectation, the reserve earns the surcharge before randomness costs, token incentives, and operating expenses.

At request time, the contract reserves enough USDC to settle the most expensive possible result from that snapshot:

```
requiredCoverage = max(0, maxSelectedNAV - ripPrice)
```

A rip cannot begin unless that coverage is available. The reserved amount cannot be withdrawn until the rip settles.

For the MVP, Makers receive:

- the locked NAV when their lot is selected; and
- separately budgeted whitelisted-token rewards while their lot is active.

They do not also receive a share of the surcharge. That separation keeps principal settlement, game margin, and token incentives understandable.

The treasury must seed the House Reserve before rips open. The exact seed should be chosen from a simulation of the initial lot range, pool size, and expected volume.

## Randomness and settlement

Use [Chainlink VRF v2.5 on Base](https://docs.chain.link/vrf/v2-5/supported-networks) for the production selection source.

The request flow is intentionally asynchronous but creates one irrevocable obligation:

1. The buyer supplies one recipient. Before accepting payment, the contract validates that recipient against the receive policies for every supported asset represented in the snapshot.
2. One purchase transaction collects the Ripper's USDC, snapshots the eligible pool, reserves worst-case settlement coverage, and requests one VRF word. These actions are atomic: if any step fails, the transaction reverts and no paid rip exists.
3. The VRF callback maps the word into the snapshot's total weight, selects exactly one lot, records the immutable `selectedLotId`, reserves that lot for the bound recipient, and marks the rip fulfilled.
4. The callback performs no B20 transfer, USDC transfer, Maker payment, refund, or other external settlement action.
5. After fulfillment, anyone may call the permissionless `settle(ripId)` function. The Ripper, backend, and keeper are all ordinary callers with no exclusive settlement authority.
6. Settlement transfers the complete selected B20 lot to the bound recipient, pays the selected Maker its locked NAV, releases unused House coverage, and marks the rip settled in one transaction.
7. If any B20 or USDC transfer fails, the entire settlement transaction reverts. The rip remains fulfilled and pending settlement, the selected inventory and USDC remain reserved, and any caller may retry the same settlement later. The backend or keeper continues retrying until delivery succeeds.
8. If the rip is already settled, `settle(ripId)` returns without transferring or paying again. Before fulfillment it reverts because no result exists yet.

The selected lot, VRF result, and recipient are immutable after fulfillment. A policy or pause change may delay delivery, but it cannot discard the randomness, select another lot, redirect the delivery, or create a refund choice. The MVP has no ordinary timeout cancellation, admin recovery, alternate-recipient path, or post-payment refund path. VRF delay and repeated settlement failure are liveness conditions to monitor and retry, not reasons to rewrite the outcome.

## $CALL launch and multi-token rewards

$CALL launches through [Bankr](https://docs.bankr.bot/token-launching/overview/) explicitly on Base.

Bankr's current standard launch creates a fixed, non-mintable 100 billion token supply:

- 85% seeds immediate liquidity; and
- 15% vests to the launch recipient over one year with a 30-day cliff.

These are external launch rules, not game-contract assumptions, and must be rechecked before launch.

The game does not receive mint authority and does not depend on Bankr for reward accounting. $CALL is an ordinary ERC-20 input to a separate, token-agnostic rewards vault. $CALL is the primary launch reward, but the same vault may distribute $BNKR or another standard ERC-20 after that token is explicitly whitelisted.

### Funding the game contract

The rewards vault exposes a permissionless funding path:

```
fundRewards(token, amount):
    require rewardTokenWhitelist[token]
    balanceBefore = balanceOf(token, rewardsVault)
    transferFrom(msg.sender, rewardsVault, amount)
    received = balanceOf(token, rewardsVault) - balanceBefore
    creditAvailable(token, received)
    emit RewardsFunded(token, msg.sender, received)
```

Anyone can therefore approve and deposit any whitelisted reward token into the game. Funding does not grant admin rights, change odds, or create a withdrawal claim. Accounting uses the amount actually received so a non-standard token cannot create an unfunded balance.

Recommended launch flow:

1. Launch $CALL on Base through Bankr.
2. Set the creator allocation and creator-fee recipient to a treasury wallet or Safe, not the game contract.
3. Wait through Bankr's launch anti-snipe period.
4. Acquire the $CALL required for the first reward publication periods on the open market.
5. Approve the rewards vault and call fundRewards.
6. As the creator allocation vests, claim unlocked $CALL to the treasury and deposit additional rewards.
7. Optionally use Bankr creator fees to replenish the House Reserve or acquire more $CALL.

The Bankr liquidity pair and the game's payment asset are separate concerns. Game rips use USDC even if $CALL trades against WETH or another Bankr-supported quote token.

### Reward-token whitelist

Only the rewards admin can add a token to the whitelist. A candidate must be reviewed as a non-rebasing ERC-20 with safe transfer behavior before it is enabled. Removing a token stops new funding and new reward publications but never blocks already accrued claims. Whitelisting a reward token cannot change stock eligibility, Rip Price, selection odds, House Reserve accounting, stock principal, or game administration.

### Reward accounting

The MVP rewards stock LPs only and caps the rewarded LP set at 64 addresses. An offchain indexer calculates each closed publication period's LP allocations using the square root of time-weighted active NAV. Square-root weighting rewards more supplied value without allowing the largest lots to capture rewards linearly; minimum lot NAV, one-lot accounting, and the capped LP set limit dust farming.

An authorized reward publisher submits the calculated allocations directly to the vault in additive onchain batches:

```
MAX_REWARDED_LPS = 64
MAX_REWARD_BATCH = 64

publishRewards(token, publicationId, lps[], amounts[]):
    require msg.sender == rewardPublisher
    require rewardTokenWhitelist[token]
    require 0 < lps.length <= MAX_REWARD_BATCH
    require lps.length == amounts.length
    require !published[publicationId]
    require every lp is in the capped rewarded-LP set
    total = sum(amounts)
    require available[token] >= total
    published[publicationId] = true
    available[token] -= total
    outstandingClaimable[token] += total
    for each (lp, amount):
        require lp != address(0)
        claimable[token][lp] += amount
    emit RewardsPublished(token, publicationId, total, lps.length)
```

The rewarded-LP set and each transaction are both hard-capped at 64 addresses for the MVP. A publication period may be split into smaller batches with distinct publication IDs, but every credited address must be in that capped set and a publication ID can never be replayed. Funding must already be in the vault before a batch is credited; the publisher cannot create an unfunded claim.

Publication is monotonic. The publisher and admins may only increase an LP's claimable balance and can never replace a distribution, reduce a prior credit, or claw back accrued rewards. Each LP may call `claim(token)` whenever it wants to receive its full accumulated balance. Only that LP's successful claim consumes its claimable balance; a failed reward-token transfer reverts and leaves the balance claimable.

The reward publisher may affect only pre-funded reward tokens in the RewardsVault. It has no authority over LP-deposited B20 stock principal, House Reserve USDC, Maker proceeds, Rip Price, odds, or settlement. Pausing new reward publications must not block claims already credited.

No reward token is required to deposit or rip, and holding $CALL, $BNKR, or another reward token does not improve odds or stock payouts in the MVP. Ripper token incentives are outside this capped LP-reward MVP.

## Suggested contract boundary

### StockGacha

Owns:

- the four-asset registry;
- B20 custody and lot state;
- Chainlink price validation;
- pool snapshots and inverse-NAV weights;
- USDC escrow and House Reserve accounting;
- atomic paid-rip and VRF request creation;
- the immutable VRF result, selected lot, and bound recipient;
- Maker settlement;
- permissionless, idempotent, retryable B20 delivery; and
- pause and bounded parameter controls that cannot cancel or block settlement of an accepted rip.

### RewardsVault

Owns:

- an admin-managed reward-token whitelist;
- permissionless deposits of whitelisted ERC-20s;
- per-token available and outstanding-claimable balances;
- one authorized reward publisher;
- one capped set of at most 64 rewarded LP addresses;
- additive publications of at most 64 LP addresses per batch;
- replay-protected publication IDs and per-LP claimable balances;
- LP claims; and
- reward-specific pause controls.

Keeping all reward accounting separate prevents a reward-token bug from touching stock custody, USDC settlement, or game odds.

### Offchain services

Convex and the application indexer may provide:

- lot and rip history;
- pool analytics and odds previews;
- pending VRF status;
- permissionless settlement retries;
- LP reward-period calculation and bounded batch submission; and
- notifications.

Contracts remain authoritative for custody, prices accepted at request time, randomness, settlement, and claims.

## MVP surfaces

### Rip

- live Rip Price and expected NAV;
- one-rip purchase action;
- reveal animation;
- bound delivery recipient and settlement status;
- permissionless settle/retry action;
- received stock and value;
- current pool distribution; and
- verifiable transaction and randomness links.

### Deposit

- supported-stock balances;
- amount and grade preview;
- odds and estimated reward-token earnings;
- active lots; and
- withdraw action.

### Portfolio

- stocks won;
- lots currently active;
- USDC earned;
- claimable $CALL, $BNKR, and other enabled rewards; and
- personal rip/deposit history.

### Activity

- deposits;
- rip requests;
- random results;
- settlements;
- failed and retried settlement attempts;
- lot withdrawals; and
- reward funding and claims.

## Required invariants

1. Only the four configured MVP-launch B20 addresses can enter custody.
2. Every active or selected lot is fully backed by the exact B20 amount recorded.
3. A lot can be active, locked in the pending snapshot, reserved for one fulfilled rip, withdrawn, or settled—never more than one state at once.
4. USDC payment, pool snapshot, House coverage reservation, and the VRF request either all succeed in one purchase transaction or all revert.
5. Once payment is accepted, no user or admin can cancel the rip, refund it, redraw randomness, change its recipient, or substitute its selected lot.
6. The VRF callback derives exactly one selected lot from only the public snapshot and VRF word, records the immutable result, reserves the lot, and performs no external asset transfer.
7. One recipient is bound and policy-validated at purchase; it cannot be replaced after payment or fulfillment.
8. `settle(ripId)` is permissionless and idempotent. A successful rip settles only once, and later calls cannot duplicate stock delivery or Maker payment.
9. A failed B20 or USDC transfer reverts the whole settlement while the fulfilled rip, selected inventory, bound recipient, and reserved USDC remain unchanged and retryable.
10. Successful settlement atomically delivers the complete selected B20 amount to the bound recipient and the complete locked NAV to the selected Maker.
11. The corporate-action multiplier affects NAV exactly once.
12. No new rip uses a missing, paused, non-positive, or stale price.
13. A paid rip cannot be undercollateralized against its maximum possible selected NAV.
14. House Reserve, paid-rip USDC, Maker proceeds, and withdrawable treasury USDC are accounted separately.
15. The MVP rewarded-LP set contains at most 64 addresses; each reward publication contains at most 64 addresses from that set, is authorized and replay-protected, and cannot credit more than the vault's funded available balance.
16. Publisher and admin actions can only increase accrued LP claimable rewards. Only the LP's own successful claim consumes its balance.
17. Reward accounting and authority cannot touch LP-deposited B20 stock principal, selected lots, House Reserve USDC, Maker proceeds, or rip settlement.
18. A game-admin pause may stop new deposits or rips but cannot cancel or block permissionless settlement of an accepted rip.

## Threat-model consequences

- A delayed VRF response or a B20 policy/pause failure is a liveness incident, not a cancellation path. Before fulfillment, payment and House coverage stay reserved and the pending snapshot stays locked. After fulfillment, the selected lot and USDC stay reserved while the backend or keeper repeatedly calls permissionless settlement until delivery succeeds, without changing the result or recipient.
- An arbitrary or malicious settlement caller gains no discretion: it can only attempt the immutable fulfilled rip, and idempotency prevents duplicate delivery or Maker payment.
- A compromised reward publisher can misallocate only already funded reward tokens within the capped LP set. It cannot over-credit the vault, reduce an accrued balance, touch LP stock principal or game USDC, or interfere with rip settlement.
- Reward-admin and publisher key governance remains an operational risk to define before implementation. The MVP deliberately adds no rip admin-recovery key because such a path would weaken irrevocability.

## Explicit non-goals

- the generalized Margin Call shared-inventory protocol;
- permissionless asset listing;
- legal or geographic access controls;
- NFT packs;
- ETH backing or buybacks;
- stock baskets;
- cash redemption of won stocks;
- lending idle stocks;
- reward-token governance, staking, or fee sharing;
- multiple simultaneous rips;
- gas sponsorship;
- mobile-native applications; and
- a 24/7 fallback oracle.

## Implementation phases

### Phase 1: simulation and contract specification

- model pool composition, inverse-NAV odds, reserve variance, and surcharge;
- choose minimum and maximum grades, initial reserve, and pool caps;
- define the B20 unit adapter and feed freshness policy;
- specify every state transition, reserved-balance rule, and liveness retry condition; and
- convert the invariants above into Foundry tests.

### Phase 2: Base fork and testnet prototype

- implement StockGacha with mocked B20s, USDC, feeds, and VRF;
- implement the multi-token RewardsVault;
- test multiplier changes, stale feeds, atomic purchase/VRF-request failure, delayed fulfillment, failed B20 and USDC settlement retries, idempotent settlement, immutable recipients and outcomes, the absence of post-payment refund paths, token whitelisting, capped additive publications, monotonic LP balances, and per-token reward exhaustion;
- build the Rip, Deposit, Portfolio, and Activity surfaces; and
- prove the entire loop with reproducible transactions.

### Phase 3: constrained Base launch

- verify the four canonical B20 addresses and feeds;
- deploy and fund the House Reserve;
- launch $CALL through Bankr on Base;
- acquire and deposit the first $CALL reward budget;
- whitelist and deposit any additional launch reward such as $BNKR;
- cap active lots, lot value, and one-rip throughput;
- monitor solvency, settlement latency, feed freshness, and reward spend; and
- expand limits only after observed behavior matches the simulation.

## Decisions still required before implementation

- final minimum and maximum lot grade;
- surcharge and maximum allowed surcharge;
- maximum active lot count;
- initial House Reserve size;
- VRF-delay and settlement-retry monitoring thresholds, which do not create cancellation or refund rights;
- exact feed freshness policy outside market hours;
- Base mainnet USDC address and transfer behavior;
- reward publication period, first $CALL budget, and any initial $BNKR budget;
- reward-token whitelist, capped LP-set administration, publisher authorization, and admin process;
- treasury and emergency-admin addresses; and
- whether the MVP launches directly on Base mainnet or first uses mocked B20 assets on Base Sepolia.

## Success criteria

The MVP succeeds when an external observer can verify that:

1. a user deposited one of the four real Coinbase B20 stocks;
2. the game valued the lot from the approved feed;
3. another user paid USDC against a public price and odds snapshot;
4. Chainlink VRF selected the lot;
5. the depositor received the locked USDC NAV;
6. the recipient bound by the buyer at purchase received the actual B20 stock;
7. stock LPs could claim only additive, pre-funded rewards from explicitly whitelisted tokens; and
8. no generalized Margin Call protocol was required to complete the loop.
