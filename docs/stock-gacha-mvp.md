# Stock Gacha MVP on Base

> **Status: product plan, not implemented.** This document proposes the first simple Margin Call game. It intentionally ships before the larger shared-inventory protocol described in [Proposed Margin Call Protocol Overview](./margin-call-protocol-overview.md).

## Decision summary

Build a simplified version of [StockRip](https://stockrip.com/docs) on Base:

- use an intentional four-stock launch subset of the Coinbase-issued B20 inventory on Base;
- let Makers deposit fractional stock positions as lots;
- fix each lot's grade from an oracle price read once at deposit, so selection weights never move;
- let Rippers pay USDC for a randomly selected lot, with many rips in flight at once;
- pay the selected Maker the lot's value at the price read when that rip was purchased;
- deliver the actual B20 stock to the recipient bound by the Ripper at purchase;
- make settlement pure bookkeeping, so no issuer policy can stall it, and let both sides claim on their own schedule;
- allow bounded refunds only while no randomness has landed, and none once a lot is selected;
- launch $CALL through Bankr on Base and distribute it to Makers from a separately funded, multi-token rewards vault;
- allow additional standard ERC-20 rewards such as $BNKR after an admin explicitly whitelists them; and
- do not block this game on the generalized Margin Call protocol.

The MVP should prove one loop:

**Deposit a real stock lot → grade it once → pay USDC and request randomness → select one immutable result → credit the Maker and the recipient → let each claim → accrue Maker fees and rewards.**

## What we borrow from StockRip

- user-supplied tokenized-stock inventory;
- inverse-grade selection weighting, so high-grade lots are rarer;
- a pool-derived rip price based on the harmonic mean of active grades;
- a randomness fee itemized separately from the house surcharge;
- immutable grades fixed at deposit, which is what makes concurrent draws possible;
- a weighted tree walk for selection;
- bounded refunds as the liveness mechanism, not as a weakening of fairness;
- a share of every rip fee paid to depositors while their inventory rests in the pool;
- actual tokenized-stock delivery; and
- pre-funded token rewards that bootstrap stock supply.

## What we change from StockRip

StockRip's grade is an amount of ETH the depositor escrows, which both sets the selection weight and funds a standing bid to buy the position back. That escrow is load-bearing: because grading high costs the depositor their own capital, grade inflation is self-limiting, and because the grade is a funded bid rather than a valuation, it needs no oracle and carries no basis risk.

This MVP asks Makers for one asset instead of two, so it cannot borrow that mechanism. The substitutions are deliberate and each one has a cost:

| StockRip                        | This MVP                          | Cost of the change                                        |
| ------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Depositor-committed ETH grade   | Oracle NAV locked at deposit      | Needs a price feed; grades go stale between refreshes     |
| Depositor-escrowed standing bid | House Reserve funds the shortfall | The protocol carries variance the depositor used to carry |
| ETH denomination                | USDC denomination                 | None; USDC matches the unit the feeds already price in    |
| Depositor sets their own odds   | Odds follow from measured NAV     | Makers lose a dial, and gain a much simpler deposit       |

We also drop, for the MVP only: NFT baskets and token-bound accounts; multi-stock lots; keep-as-NFT, sell-back, and relist settlement choices; card staking; crowned-depositor mechanics; batched multi-draw transactions; and any dependency on the future shared Margin Call protocol.

## Supported assets

As of August 31, 2026, the [official Base B20 integration documentation](https://docs.base.org/base-chain/specs/reference/b20/tokenized-stocks-on-base) lists 13 Coinbase Tokenized Stocks and their Chainlink total-return feeds. The MVP intentionally launches with the following four-stock subset:

| Stock    | Symbol | B20 address                                | Chainlink total-return feed                |
| -------- | ------ | ------------------------------------------ | ------------------------------------------ |
| NVIDIA   | NVDAc  | 0xb20000000000000000000078ee7ce2fE4908108C | 0x04689a41629776563E6822F76f2e57D148d28513 |
| Meta     | METAc  | 0xb2000000000000000000008bC8786B856E61707C | 0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D |
| Apple    | AAPLc  | 0xb200000000000000000000C2e324d24d7eEcd1fb | 0x787f13dEa48Db0897CbCDD985de77809D837F988 |
| Alphabet | GOOGLc | 0xb2000000000000000000002D0BA3164cc74f58B7 | 0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2 |

The four are an intentional launch subset chosen for verified token and oracle addresses, acceptable launch inventory and liquidity, and a deliberately constrained operational scope. The address pairs above are verified against the official Base page; inventory and liquidity must be re-evaluated immediately before deployment. Contracts identify assets by address, never by mutable ticker metadata.

Note that the feeds are listed by underlying ticker, not by the `c`-suffixed token symbol: the NVDAc feed's `description()` returns `Coinbase NVDA`.

Two supporting addresses the game also depends on:

- **Coinbase onchain oracle registry** `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD` — returns the corporate-action multiplier and the pause flag for a token. The pause flag is **not** on the aggregator. Its ABI is not documented on the Base page and must be read from the deployed contract.
- **B20 PolicyRegistry precompile** `0x8453000000000000000000000000000000000002` — resolves transfer policies.

The payment asset is **native USDC on Base**, `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals. Not bridged USDbC. The registry stores token decimals, feed decimals, maximum price age, minimum grade, maximum grade, and enabled/paused status per asset.

Decimals differ at every layer and must be normalized explicitly: USDC 6, Chainlink feeds 8, B20 tokens 18.

### B20 transfer policies

The B20 policy model is a **blocklist, not an allowlist**, and this shapes several decisions below. All four tokens resolve both `TRANSFER_SENDER_POLICY` and `TRANSFER_RECEIVER_POLICY` to policy ID `5`, whose type byte is `0x00` = BLOCKLIST. Base's documentation states plainly that "holding and trading on the secondary market is permissionless," and KYC applies only to the mint and redeem flows taken by Authorized Participants.

Consequences the implementation must respect:

- Any address is authorized unless it has been listed. A smart contract can hold and receive B20 freely; a Uniswap router is confirmed authorized under policy 5.
- The pre-flight check is `PolicyRegistry.isAuthorized(uint64 policyId, address account)`, reached by first reading `token.policyId(TRANSFER_RECEIVER_POLICY)`. It never reverts. **This is not ERC-1404** — there is no `detectTransferRestriction`, `canReceive`, or `isAllowed`.
- A blocked transfer reverts with `PolicyForbids`.
- `approve` is **not** policy-gated. A successful approval says nothing about whether the later `transferFrom` will land.
- `permit` is EOA-only. ERC-1271 contract signatures are not accepted, so the game must call `approve` directly rather than relying on signed approvals.
- B20 tokens are **precompiles with no bytecode**. Any `EXTCODESIZE`-based contract detection will misidentify them.

The policies are mutable with no protocol-level delay. See [Threat-model consequences](#threat-model-consequences) for what that means for custody.

## Product vocabulary

**Maker** — a user who deposits a supported B20 stock lot. This document does not use the term "LP."

**Lot** — one quantity of one supported B20 stock deposited by one Maker. A lot is a contract record, not an NFT.

**Grade** — the lot's USDC-denominated NAV, read from the oracle once at deposit and fixed until the lot is refreshed or withdrawn. The grade sets the lot's selection weight and its odds. It is not what the Maker is paid.

**Payout** — what the selected Maker actually receives: the lot's value at the price read when that rip was purchased. Distinct from the grade, and the distinction is deliberate.

**Ripper** — a buyer who pays USDC for a random active lot and binds one delivery recipient at purchase.

**Rip** — one USDC purchase and atomic VRF request, followed by a verifiably random selection and a settlement that credits both sides.

**Rip Price** — the pool's inverse-grade-weighted expected value, plus the house surcharge, plus the randomness fee.

**Randomness Fee** — the itemized pass-through cost of one VRF request. Quoted separately from the surcharge and retained on refund.

**Drift Bound** — the maximum the pool's expected value may fall between a rip's purchase and its randomness landing, before that rip refunds instead of drawing. Set by the Ripper within contract limits.

**House Reserve** — USDC held by the game contract to cover the difference when a selected lot pays out more than its rip price.

**Treasury** — the off-chain wallet or Safe that funds the House Reserve and receives creator allocations. Distinct from the House Reserve, which is on-chain contract state.

**Rewards Vault** — a separately funded contract that holds whitelisted ERC-20 incentives and additively credits claimable balances to Makers. $CALL is the primary launch reward; additional tokens such as $BNKR can be enabled without changing the game.

## Roles

Five distinct authorities. What each one **cannot** do matters as much as what it can.

| Role                 | Can                                                                                               | Cannot                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Game admin**       | Enable/disable assets, set surcharge and bounds within hard caps, pause new deposits and new rips | Cancel or block settlement of an accepted rip, alter a selected result, touch Maker principal, redirect a recipient |
| **Rewards admin**    | Whitelist and de-whitelist reward tokens, pause new publications                                  | Reduce an accrued claimable balance, block an existing claim, touch stock principal or House Reserve                |
| **Reward publisher** | Credit funded $CALL and other reward balances in capped batches                                   | Credit more than the vault's funded balance, reduce a prior credit, affect odds, prices, or settlement              |
| **Keeper**           | Call the permissionless entry points: settle, refresh, refund-on-timeout                          | Anything a random caller cannot also do; the keeper holds no privilege                                              |
| **Treasury**         | Fund the House Reserve, fund the Rewards Vault, withdraw surplus reserve                          | Reach reserved coverage, Maker proceeds, or claimable balances                                                      |

The keeper row is the important one: every operational path in this design is permissionless, so the keeper is a liveness convenience, never a trust assumption.

## Lot grading

At deposit the contract reads a fresh price and fixes the lot's grade:

- `amount_i` is the deposited raw B20 amount;
- `price_i` is the Chainlink total-return price for that stock at deposit time;
- `grade_i` is the USDC value after normalizing token and feed decimals; and
- `weight_i = SCALE / grade_i`, fixed for the life of the lot.

Coinbase's Chainlink feeds already include the B20 corporate-action multiplier. **The implementation must not apply the multiplier a second time.** Doing so squares it, which is nearly invisible while multipliers sit near 1.0 and produces a roughly 100x error after a 10:1 split. Test against a synthetic multiplier well away from 1.0. For token-unit-to-share conversions, use the token's own `scaledBalanceOf`, `toScaledBalance`, and `toRawBalance` helpers rather than reading the multiplier and doing the arithmetic by hand.

A deposit is accepted only when the asset is enabled, the feed answer is positive, the registry pause flag is clear, the price is fresh, and the resulting grade is within the configured range. The starting proposal is a $20 minimum and $300 maximum grade. These are risk controls, not permanent product promises.

### Keeping grades honest

A fixed grade is what makes concurrent rips possible, but a grade fixed forever would drift arbitrarily far from market. Two bounds keep it honest:

- Anyone may call `refresh(lotId)`, which re-reads the oracle and re-locks the grade and weight. It is an O(log n) tree update.
- A lot whose grade is older than **seven days** is excluded from the active pool until someone refreshes it.

The keeper refreshes routinely; the exclusion is what enforces it when the keeper is down. Because the payout uses a live price and the coverage is sized against the grade, this bound also caps how far the two can diverge — see [USDC economics](#usdc-economics).

### Market hours

The feeds cover US equities 24/5, update on a **0.5% price deviation or a 24-hour heartbeat**, and freeze off-hours: `updatedAt` stops advancing while the contract stays callable, holding the last value. Base's own guidance is to "never settle or liquidate against a frozen feed."

The MVP therefore is a **market-hours-only game**. Deposits, refreshes, and rip purchases all require fresh prices and fail closed outside them. This is a scheduled closed state, not an error, and the interface should present it that way.

`maxPriceAge` must be set per asset from observed inter-update intervals during market hours, and will land in hours rather than minutes. A 24-hour heartbeat means any bound much tighter than that will reject a quiet stock that simply has not moved 0.5%.

Two gaps to carry knowingly: Base documents corporate-action pauses and off-hours but is **silent on intraday exchange halts**, so do not assume the registry pause flag covers a LULD or circuit breaker; and a corporate-action freeze has no documented maximum duration, because the feed resumes only once both the price and the multiplier reflect the new values.

## Odds and Rip Price

A lot's selection weight is inversely proportional to its grade:

```
weight_i      = SCALE / grade_i
probability_i = weight_i / totalWeight
```

High-grade lots therefore appear less frequently than low-grade lots.

Because grades are fixed, `totalWeight` and `activeLotCount` are running aggregates maintained incrementally on deposit, withdrawal, refresh, and selection. The pool's expected value is an O(1) read with no iteration and no snapshot:

```
expectedNAV = activeLotCount * SCALE / totalWeight

ripPrice    = expectedNAV * (1 + surchargeBps / 10,000) + randomnessFee
```

`expectedNAV` is the harmonic mean of active grades, which is the correct expected value under inverse-grade weighting and sits below the arithmetic mean.

The starting surcharge proposal is **6%**, configurable within a hard onchain maximum. For reference, StockRip currently runs 5.5% plus a standing-bid payout of 95% of grade. The **randomness fee is quoted and charged separately** so that VRF cost changes — Base charges a 60% premium paying in ETH, 50% in LINK — pass through without moving the number players judge the game on, and so a refund has an unambiguous shape.

Before purchase, the interface displays the current Rip Price with the surcharge and randomness fee itemized, expected NAV, each active lot's grade and probability, the minimum and maximum possible outcome, and price age.

The Ripper supplies `maxPrice`, a purchase deadline, and a drift tolerance. All are checked before payment, and the purchase reverts rather than silently accepting a worse quote.

## Parallel rips

There is no global lock and no pool snapshot. Many rips may be in flight at once.

Selection walks a weighted tree over active lot weights: `word % totalWeight` indexes into the tree, and the walk removes the selected lot's weight in the same O(log n) operation. Two concurrent rips therefore cannot select the same lot by construction, without any reservation bookkeeping. Deposits, withdrawals, and refreshes stay open at all times; only a lot already selected by a resolved rip is locked.

What a Ripper is exposed to instead of a lock is **drift**: Makers may deposit or withdraw between their purchase and their draw, moving the pool's expected value. The drift bound in the next section is the answer to that, and it is why a snapshot is unnecessary.

## USDC economics

The Ripper pays the quoted Rip Price. The selected Maker receives the lot's value at the price read when that rip was purchased — not the grade, and not a price read at settlement.

This split is the point of the design. The grade is fixed so that weights never move, which is what buys concurrency. The payout is live so that Makers are indifferent to when they are selected, which is what prevents them from withdrawing whenever their stock rallies and leaving the pool systematically overvalued. Pricing and paying with one number would force a choice between concurrency and honest odds.

The House Reserve absorbs per-rip variance:

- if the payout exceeds the Rip Price, reserve USDC covers the difference;
- if the payout is lower, the remainder stays in the reserve; and
- in expectation the reserve earns the surcharge, net of the Maker fee share and operating expenses.

At purchase the contract reserves enough USDC to settle the most expensive possible result:

```
maxPayout        = maxGrade * PAYOUT_CAP_MULTIPLE
requiredCoverage = max(0, maxPayout - ripPrice)
```

`PAYOUT_CAP_MULTIPLE` is **1.5**, and the Maker payout is hard-capped at the same multiple of the lot's grade. The seven-day refresh bound makes a lot rallying more than 50% between refreshes very unlikely, and a Maker who wants to re-lock higher can withdraw and redeposit. Coverage is a per-rip constant, so it composes cleanly across concurrent rips: a rip cannot begin unless its coverage is available, and that amount is unwithdrawable until the rip resolves.

The treasury must seed the House Reserve before rips open. The seed should be chosen from a simulation of the initial grade range, pool size, and expected concurrency.

### Maker earnings

Makers earn from two separate sources:

1. **A share of every rip's surcharge**, accruing while their lot rests in the active pool, pro-rata by time-weighted grade. This is compensation for capital at risk, so it tracks capital linearly. It is a standard on-chain accumulator (`accFeePerWeight`), needing no indexer, no publisher, and no address cap.
2. **Whitelisted reward tokens** from the separately funded Rewards Vault, weighted by the square root of time-weighted grade. Square-root weighting is right for bootstrapping breadth; it is deliberately a different curve from the fee share, because it is doing a different job.

The Maker's payout for a selected lot is entirely separate from both. Adding the fee share is a change from the earlier draft, which withheld it: $CALL emissions are finite and speculative, and the fee share is what still pays a Maker in month six. StockRip pays its depositors a share of every acquisition fee for the same reason.

## Randomness, refunds, and settlement

Use [Chainlink VRF v2.5 on Base](https://docs.chain.link/vrf/v2-5/supported-networks). Coordinator `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`, two gas lanes only (2 gwei and 30 gwei), max callback gas 2,500,000, confirmations 0–200. Inherit `VRFConsumerBaseV2Plus` so `setCoordinator` is available for a future migration without redeploying.

Note that StockRip does not use VRF: it runs a keeper-revealed reverse hash chain mixed with a future blockhash, behind a VRF-v2.5-shaped interface. We are paying Chainlink for a guarantee they built themselves, which is a defensible trade on Base where a canonical VRF exists.

### What irrevocability means here

Irrevocability attaches to the **result**, not to the payment. Once a lot is selected, that outcome and its recipient are immutable forever. Before a result exists there is nothing to discard, so a refund is not a redraw — it is a purchase that did not happen.

A refund is permitted only when both hold:

1. no randomness has landed for that rip; and
2. the trigger is independent of any outcome.

Both conditions are testable, which the earlier "a paid rip is irrevocable" framing was not. The latch is a one-way flag set when the VRF word is stored. **It must key on the word, not on whether selection has been computed** — because selection is a deterministic function of public data, anyone could compute their lot off-chain and then choose to refund, which is exactly the randomness-grinding vector Chainlink warns against.

### Purchase

One atomic transaction:

1. Read `expectedNAV` from the running aggregates; compute the Rip Price; check `maxPrice` and the deadline.
2. Read a fresh price for every supported asset; revert if any is stale, paused, or non-positive.
3. Check the bound recipient is not currently blocked, via `isAuthorized` for each asset.
4. Collect the Rip Price in USDC.
5. Reserve House coverage.
6. Record the buyer, recipient, per-asset prices, `expectedNAV` at purchase, and drift tolerance.
7. Request one VRF word.

If any step fails the whole transaction reverts and no paid rip exists.

### Callback

The callback stores the word and evaluates the drift bound. Nothing else. Chainlink is explicit that `fulfillRandomWords` **must not revert**, so it also must not guard by reverting:

1. If the rip already refunded on timeout, store the word and return.
2. Store the word and set the one-way `wordStored` flag.
3. Recompute `expectedNAV` from the O(1) aggregates; if it has fallen by more than the rip's drift tolerance, set `driftBreached`.

Selection deliberately does **not** happen here. Weighted tree walks have gas proportional to pool size, and a callback that runs out of gas is charged for and never retried. Moving selection out removes that failure mode entirely rather than building a recovery path for it.

The drift check is evaluated in the same transaction the word lands in, so no one gets a window to compute their lot and then choose a refund.

### Resolution and settlement

`settle(ripId)` is permissionless and idempotent. The Ripper, the keeper, and any other caller are ordinary callers with no exclusive authority.

- If `driftBreached`, the rip refunds: principal and surcharge are credited to the buyer, the randomness fee is retained, and coverage is released.
- Otherwise the contract computes `selectedLotId` from the stored word and the weighted tree, persists it, **credits** the Maker's USDC payout and the recipient's B20 amount to internal claimable balances, releases unused coverage, and marks the rip settled.

Settlement moves no external tokens. It is pure bookkeeping and cannot fail on any issuer's policy. This is the central reason it can be permissionless and unstoppable: a game-admin pause may stop new deposits and new rips, but it can never block resolution of an accepted rip.

### Claims

Two independent pull paths, each permissionless for its own claimant:

- `claimUSDC()` — the Maker withdraws accumulated payouts, fee share, and any refunds.
- `claimStock(asset)` — the recipient withdraws delivered B20, guarded by `isAuthorized` and `isPaused` at the moment of transfer.

Pull on **both** legs, not just the stock. USDC on Base carries a Circle blacklist structurally just like B20's blocklist, so a push-based Maker payment could revert for exactly the same reason a push-based delivery could. If a claimant is blocked, only that claimant's balance sits waiting; nobody else's rip, lot, or claim is affected.

### Timeout refund

Chainlink offers no fulfillment SLA — their own material notes that the one thing a node can do is not respond — and their documentation does not say whether an in-flight request survives a subscription running dry.

If no word has landed **one hour** after purchase, anyone may call `refundExpired(ripId)`. It credits principal and surcharge to the buyer, retains the randomness fee, releases coverage, and marks the rip refunded. One hour is far beyond normal fulfillment, so it should never become an ordinary UX path.

A late fulfillment can race the refund. The refund guards on `wordStored`; the callback handles the reverse case by storing the word and returning without effect, because it must never revert.

Fund the VRF subscription well above the minimum. It is the one input to this design with no on-chain remedy.

## $CALL launch and multi-token rewards

$CALL launches through [Bankr](https://docs.bankr.bot/token-launching/overview/) explicitly on Base. This matters: Bankr's chat, social, and API deploys **default to Robinhood Chain**, and only the CLI and web launch form default to Base.

Bankr's standard launch creates a fixed, non-mintable 100 billion token supply with 85% seeding immediate liquidity and 15% vesting over one year with a 30-day cliff inside that year. Three qualifications:

- the 15% vests to the **fee recipient**, which may be a third party, and is immutable once set;
- vesting is optional, and partner/org-key launches sell 100% into the pool with no allocation at all; and
- these are external launch rules, not game-contract assumptions, and must be rechecked before launch.

The game does not receive mint authority and does not depend on Bankr for reward accounting. $CALL is an ordinary ERC-20 input to a separate, token-agnostic rewards vault.

### Funding the vault

```
fundRewards(token, amount):
    require rewardTokenWhitelist[token]
    balanceBefore = balanceOf(token, rewardsVault)
    transferFrom(msg.sender, rewardsVault, amount)
    received = balanceOf(token, rewardsVault) - balanceBefore
    creditAvailable(token, received)
    emit RewardsFunded(token, msg.sender, received)
```

Anyone may approve and deposit any whitelisted reward token. Funding grants no admin rights, changes no odds, and creates no withdrawal claim. Accounting uses the amount actually received, so a non-standard token cannot create an unfunded balance.

Recommended launch flow:

1. Launch $CALL on Base through Bankr, passing the chain explicitly.
2. Set the creator allocation and fee recipient to the Treasury wallet or Safe, not the game contract.
3. Wait out the anti-snipe window. It is a **fee decay from 80% to the normal fee over roughly 10 seconds**, not a trading block — a contract buying inside it succeeds and silently pays up to 80%.
4. Respect the separate **five-minute 2%-of-supply balance cap**, which does revert. A treasury acquiring more than 2% of supply cannot do so in the first five minutes.
5. Acquire the first reward budget on the open market, approve the vault, and call `fundRewards`.
6. As the creator allocation vests, claim to the Treasury and deposit further rewards.
7. Optionally use Bankr creator fees to replenish the House Reserve or acquire more $CALL. Note only part of the creator take is claimable cash; the liquidity portion compounds inside the pool and cannot be withdrawn.

The Bankr liquidity pair and the game's payment asset are separate concerns. Rips use USDC even if $CALL trades against WETH.

### Reward-token whitelist

Only the rewards admin can whitelist a token, after review as a non-rebasing ERC-20 with safe transfer behavior. Removing a token stops new funding and new publications but never blocks accrued claims. Whitelisting cannot change stock eligibility, Rip Price, odds, House Reserve accounting, stock principal, or game administration.

### Reward accounting

The Maker fee share is an on-chain accumulator and needs none of the machinery below. This section applies only to the square-root-weighted reward tokens, which cannot be computed on-chain.

An offchain indexer calculates each closed publication period's allocations using the square root of time-weighted active grade. Eligibility is **recomputed every period**: the top 64 Makers by time-weighted grade for that period. There is no persistent admin-curated set and no first-come membership, so anyone can join by depositing and anyone can verify the result from public events.

```
MAX_REWARD_BATCH = 64

publishRewards(token, publicationId, makers[], amounts[]):
    require msg.sender == rewardPublisher
    require rewardTokenWhitelist[token]
    require 0 < makers.length <= MAX_REWARD_BATCH
    require makers.length == amounts.length
    require !published[publicationId]
    total = sum(amounts)
    require available[token] >= total
    published[publicationId] = true
    available[token] -= total
    outstandingClaimable[token] += total
    for each (maker, amount):
        require maker != address(0)
        claimable[token][maker] += amount
    emit RewardsPublished(token, publicationId, total, makers.length)
```

Publication is monotonic. The publisher and admins may only increase a claimable balance, never replace a distribution, reduce a prior credit, or claw back accrued rewards. Only a Maker's own successful claim consumes their balance; a failed transfer reverts and leaves it claimable. Funding must already be in the vault before a batch is credited.

No reward token is required to deposit or rip, and holding $CALL or $BNKR does not improve odds or payouts. Ripper token incentives are outside this MVP.

## Suggested contract boundary

### StockGacha

Owns the four-asset registry; B20 custody and lot state; Chainlink price validation and the registry pause read; fixed grades and the weighted selection tree; USDC escrow, House Reserve, and per-rip coverage; atomic paid-rip and VRF request creation; the immutable word, selected lot, and bound recipient; bookkeeping settlement; the fee-share accumulator; pull-based USDC and B20 claims; bounded refunds; and pause and parameter controls that cannot block resolution of an accepted rip.

### RewardsVault

Owns an admin-managed reward-token whitelist; permissionless deposits of whitelisted ERC-20s; per-token available and outstanding-claimable balances; one authorized publisher; replay-protected publication IDs; additive per-Maker claimable balances in batches of at most 64; Maker claims; and reward-specific pause controls.

Keeping reward accounting separate prevents a reward-token bug from touching stock custody, USDC settlement, or odds.

### Offchain services

Convex and the application indexer may provide lot and rip history, pool analytics and odds previews, pending VRF status, keeper calls for settlement, refresh, and timeout refunds, reward-period calculation and batch submission, and notifications. Every keeper path is permissionless; contracts remain authoritative for custody, prices, randomness, settlement, and claims.

## MVP surfaces

**Rip** — itemized Rip Price, concurrent rip status, reveal animation, bound recipient, drift tolerance control, claim action, received stock and value, pool distribution, and verifiable transaction and randomness links.

**Deposit** — supported-stock balances, amount and grade preview, odds and estimated earnings, active lots, grade age with refresh action, and withdraw action.

**Portfolio** — stocks won and claimable, active lots, USDC earned and claimable, fee share accrued, claimable reward tokens, and personal history.

**Activity** — deposits, refreshes, rip purchases, random results, settlements, refunds, claims, withdrawals, and reward funding.

**Closed** — a scheduled market-hours-closed state, presented as a schedule rather than an error.

## Required invariants

1. Only the four configured B20 addresses can enter custody.
2. The contract never records more B20 than it received and never releases more than it recorded. It cannot guarantee the recorded amount is still held, because the issuer can seize or burn it; see the threat model.
3. A lot is active, excluded as stale, selected by a resolved rip, or withdrawn — never more than one at once.
4. USDC collection, coverage reservation, and the VRF request either all succeed in one purchase transaction or all revert.
5. A rip may refund only while no VRF word is stored for it, and only on a pre-declared, outcome-independent trigger.
6. Once a lot is selected, the outcome and its recipient are immutable. No user or admin can redraw, substitute, redirect, or refund it.
7. The VRF callback stores the word and evaluates the drift bound only. It performs no selection, no transfer, and never reverts.
8. Selection is a deterministic function of the stored word and the weighted tree, and removes the selected lot's weight atomically, so no lot can be selected twice.
9. `settle(ripId)` is permissionless and idempotent. Later calls cannot duplicate a payout or a delivery.
10. Settlement transfers no external tokens; it only credits internal balances, so no issuer policy can stall it.
11. Claims are pull-based on both the USDC and B20 legs, and one blocked claimant cannot affect another.
12. The corporate-action multiplier affects a grade exactly once.
13. No deposit, refresh, or rip uses a missing, paused, non-positive, or stale price.
14. No lot with a grade older than the staleness bound is in the active pool.
15. A paid rip is never undercollateralized against the capped maximum payout.
16. House Reserve, in-flight rip coverage, Maker proceeds, fee share, and withdrawable treasury USDC are accounted separately.
17. Each reward publication is authorized, replay-protected, drawn from the period's recomputed top-64, and cannot exceed the vault's funded balance.
18. Publisher and admin actions can only increase accrued claimable rewards. Only a Maker's own claim consumes their balance.
19. Reward accounting cannot touch stock principal, selected lots, House Reserve USDC, Maker proceeds, or settlement.
20. A game-admin pause may stop new deposits and new rips but cannot block resolution or claiming of an accepted rip.

## Threat-model consequences

**Issuer authority over custodied stock is an unmitigated external dependency.** B20 admin operations execute immediately; the standard has no built-in timelock, and the `Announcement` events are public notice rather than an enforced delay. The policy admin can blocklist any address in one transaction, and the token admin can swap the blocklist for an allowlist that excludes the game. On the currently-live Beryl surface `burnBlocked` lets an issuer blocklist a holder and then destroy their balance, and `seizeWithMemo` transfers a balance while skipping allowance and transfer policies. Transfers can also be globally paused. If the game contract itself is blocked, Makers cannot withdraw. This is why invariant 2 is scoped to the contract's own accounting: Coinbase can falsify the stronger claim unilaterally, from an address whose governance is not publicly documented. Monitor `pausedFeatures()` and blocklist events for the game contract and every active Maker, and publish this dependency where Makers can see it before depositing.

**VRF non-response is the one failure with no on-chain remedy.** The timeout refund bounds the Ripper's exposure to one hour, and the drift bound protects them from pool movement in the meantime. Neither helps if the subscription is underfunded, which is an operational obligation, not a contract guarantee.

**A malicious settlement caller gains nothing.** Selection is a pure function of data already committed, and idempotency prevents duplicate credits. Permissionless settlement is a liveness property, not an authority.

**A compromised reward publisher can misallocate only already-funded reward tokens** within one period's recomputed set. It cannot over-credit the vault, reduce an accrued balance, touch stock principal or game USDC, or interfere with settlement.

**Oracle latency is an arbitrage surface the fail-closed policy contains.** The feed is driven by traditional market data, not by on-chain trading, so a B20's DEX price and its feed price can diverge — especially off-hours, when the feed is frozen and the pool is not. Requiring fresh prices for deposits, refreshes, and rips is what keeps that divergence out of the game.

**Reward-admin and publisher key governance remains an operational risk to define before implementation.** The MVP adds no admin recovery key for rips, because after a result exists there is nothing a recovery key could legitimately do.

## Explicit non-goals

The generalized Margin Call shared-inventory protocol; permissionless asset listing; legal or geographic access controls; NFT packs; ETH grades or depositor-escrowed standing bids; stock baskets; cash redemption of won stocks; lending idle stocks; reward-token governance, staking, or fee sharing; batched multi-draw transactions; gas sponsorship; mobile-native applications; and a 24/7 fallback oracle.

## Implementation phases

### Phase 1: simulation and contract specification

Model pool composition, inverse-grade odds, reserve variance, drift frequency, and surcharge. Choose the grade range, staleness bound, payout cap multiple, drift defaults, initial reserve, and pool caps. Define the B20 unit adapter and per-asset freshness policy. Specify every state transition, reserved-balance rule, and refund condition. Convert the invariants above into Foundry tests.

### Phase 2: Base fork and testnet prototype

Implement StockGacha with mocked B20s, USDC, feeds, and VRF, plus the multi-token RewardsVault. Test the multiplier applied exactly once and with a synthetic multiplier far from 1.0; stale and paused feeds; atomic purchase failure; concurrent rips selecting distinct lots; a callback that cannot revert; the refund/fulfillment race in both orders; drift breach and refund; timeout refund; blocked USDC and blocked B20 claimants; idempotent settlement; grade staleness exclusion and refresh; the payout cap; the fee accumulator; capped additive publications; monotonic balances; and per-token reward exhaustion. Build the Rip, Deposit, Portfolio, Activity, and Closed surfaces and prove the loop with reproducible transactions.

### Phase 3: constrained Base launch

Verify the four B20 addresses, feeds, and the registry address. Deploy and fund the House Reserve and the VRF subscription. Launch $CALL through Bankr on Base. Acquire and deposit the first reward budget. Whitelist any additional launch reward. Cap active lots, grade range, and concurrency. Monitor solvency, refund rate, drift-breach rate, settlement latency, feed freshness, issuer policy events, and reward spend. Expand limits only after observed behavior matches the simulation.

## Decisions still required before implementation

- final minimum and maximum grade;
- surcharge and its hard maximum, plus the randomness fee formula;
- Maker share of the surcharge;
- maximum active lot count and concurrent rip cap;
- initial House Reserve size and VRF subscription funding floor;
- confirmation of the seven-day staleness bound and 1.5x payout cap against simulated volatility;
- drift tolerance default and floor;
- per-asset `maxPriceAge` from observed update intervals;
- the onchain registry ABI, read from the deployed contract;
- intraday halt handling, which Base does not document;
- reward publication period and first $CALL and $BNKR budgets;
- reward-token whitelist, publisher authorization, and admin process;
- treasury and admin addresses and their governance; and
- whether the MVP launches directly on Base mainnet or first uses mocked B20 assets on Base Sepolia.

## Success criteria

The MVP succeeds when an external observer can verify that:

1. a Maker deposited one of the four real Coinbase B20 stocks and it was graded from the approved feed;
2. several Rippers paid USDC concurrently against a public price and odds, with the surcharge and randomness fee itemized;
3. Chainlink VRF selected a distinct lot for each, verifiably and immutably;
4. each selected Maker was credited the lot's value at their rip's purchase price, and each bound recipient was credited the actual stock;
5. both sides claimed independently, and a blocked claimant would have delayed nobody else;
6. a rip that lost its randomness or breached its drift bound refunded cleanly, and no rip refunded after a lot was selected;
7. Makers earned a share of rip fees on-chain and could claim additive, pre-funded rewards from whitelisted tokens; and
8. no generalized Margin Call protocol was required to complete the loop.
