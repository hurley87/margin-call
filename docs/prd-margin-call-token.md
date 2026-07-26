# Margin Call: The Game Token and Pack Economy

- **Status:** Draft for review
- **Target:** Robinhood Chain testnet
- **Version:** 0.2
- **Date:** July 26, 2026

## Product decision

Margin Call V1 is a fixed-price Pack-ripping game operated through persistent Trader identities. Packs are the immediate game object; Traders are the long game.

Creators permissionlessly fund auditable Packs of approved tokenized-stock ERC-20s. A Desk Manager funds a Trader with the configured rip-payment asset and assigns it to a named pool or tier. Every funded, eligible Trader may Rip exactly one Pack in each hourly window at that pool's fixed price. The protocol selects uniformly at random: every eligible Pack has an equal chance regardless of oracle NAV, game-token balance, creator identity, or any other Pack attribute. Selection immediately completes the Rip and delivers the Pack to the Trader. There is no discretionary buy, hold-unripped, resell, or market-timing decision in V1.

The game token's primary active V1 incentive at launch is bounded creator emissions. A future ripper participation-reward configuration exists but is disabled with a value of zero at launch. The token is not the rip-payment asset, does not change Pack selection odds, and does not buy faster Trader cadence in V1. The product makes no promise that the token will appreciate or that any participant will earn a profit.

Rips are disclosed negative-expected-value entertainment: creators fund possible above-price outcomes, receive the fixed Rip proceeds when selected, and farm a pro rata share of bounded emissions while eligible inventory remains active, without any return promise.

## V1 game loop

1. A creator mints and fully funds a Pack with an approved basket of tokenized-stock ERC-20s.
2. The protocol records the Pack's immutable basket accounting and publishes its contents, oracle NAV, fees, and redemption terms.
3. The Pack enters and remains in a named fixed-price pool or tier only while satisfying objective asset, funding, freshness, anti-spam, and current pool NAV-bound rules.
4. A Desk Manager funds a Trader's ERC-6551 account with the configured rip-payment asset, chooses one eligible pool, and enables its deterministic schedule.
5. Once per hourly window, an enabled Trader with sufficient funds may spend exactly one fixed Rip Price. It cannot spend more often, exceed its balance, or choose among eligible Packs.
6. The protocol selects uniformly at random from the eligible set, giving every eligible Pack an equal chance. Selection immediately completes the Rip and delivers the Pack to the Trader; V1 does not create an unopened-Pack decision point.
7. The confirmed Rip, payment, selected Pack, basket, NAV snapshot, fees, and Trader history are publicly auditable. The manager may later refill or pause the Trader.

If a Trader is unfunded, paused, ineligible, or the pool cannot safely execute, it does nothing for that window. Missed windows do not accumulate and cannot be replayed as a burst.

## Architecture and roles

### Pack: the immediate object

- A Pack is a transferable ERC-721 backed by a recorded basket of approved ERC-20 tokenized stocks.
- A TokenPacks-style custody contract directly holds and accounts for every Pack's basket. A Pack is not an ERC-6551 token-bound account.
- Transferring the Pack transfers the right to its recorded basket. The current holder can ultimately unwrap or redeem that basket subject to disclosed protocol rules and fees.
- Pack contents and oracle NAV are public and auditable before selection and after transfer. The whitelist resolves canonical addresses from Robinhood's [Token Contracts](https://docs.robinhood.com/chain/contracts/) page and may reconcile metadata through the [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/). Custody accounting uses raw token units; displayed NAV never replaces the recorded basket.
- Pack NAV and creator-emission eligibility use the approved onchain Chainlink feed for each whitelisted Stock Token, following Robinhood Chain's [oracle and price-feed guidance](https://docs.robinhood.com/chain/oracles-and-price-feeds/). Calculations normalize token and feed decimals and fail closed on invalid, paused, missing, or stale data. When canonical testnet token or feed coverage is unavailable, clearly labelled Test Assets and controlled feed doubles validate the same accounting and failure semantics.

### Trader: the persistent desk

- A Trader is a transferable ERC-721 identity with an ERC-6551 token-bound account; transferring it carries its portfolio and public history.
- In V1 the Trader is clockwork automation, not an autonomous market agent. Its only scheduled choice is already made by the manager: rip one Pack from one named pool when the hourly window opens and hard eligibility checks pass.
- The Desk Manager can fund, refill, configure the named pool, enable, and pause the Trader. The Trader cannot change its own pool, cadence, budget, or permissions.
- Ownership changes revoke prior automation authority and leave the Trader paused until the new owner claims and re-enables it.

### Creator: permissionless supply

- Any participant may create and list as many fully funded Packs as they can support.
- Creation and active-pool eligibility do not depend on a creator allowlist. Eligibility follows objective published rules for approved assets, complete funding, oracle freshness, public contents and NAV, protocol fees or bonds, and anti-spam limits.
- A creator receives the fixed Rip proceeds when their Pack is selected, less disclosed fees, even when the Pack's NAV is higher than the Rip Price.
- A creator farms a pro rata share of bounded emissions based on verified Pack NAV and active eligibility time. Accrual stops when the Pack is selected, redeemed, delisted, or becomes ineligible.
- Creator copy must disclose maximum immediate downside and must not describe emissions, token price, or pool participation as a return promise.

### Pool and protocol

- Each pool or tier has a stable public name, one rip-payment asset, one fixed Rip Price, approved asset rules, fees, and published minimum and maximum oracle NAV bounds.
- The initial `$25` pool's starting hypothesis is a `$15` minimum NAV and `$100` maximum NAV. These are versioned, evented pool configuration, not immutable universal constants.
- NAV bounds are continuously enforced for active eligibility, and the maximum protects pool risk rather than serving only as a listing-time check. A Pack outside either bound leaves the eligible selection set and stops creator emissions until price movement or a permitted top-up returns it within bounds; its redemption right remains intact.
- Bound changes apply prospectively to new listings or a new pool version and never silently rewrite the bounds governing existing active Packs.
- Selection within a pool is uniform: oracle NAV, game-token balance, creator identity, and all other Pack attributes have zero selection weight.
- V1 may launch with one pool. Additional fixed-price pools are configuration expansions, not variable pricing within a pool.
- The protocol validates funding and eligibility, enforces one Rip per Trader per hourly window, selects the Pack, settles the fixed payment, and records finality exactly once.
- The House may operate the selection and scheduling infrastructure and can affect liveness. It cannot create an unfunded Pack, alter a selected basket, charge a different price, reuse a Rip, bypass frequency limits, or block the Pack holder's disclosed exit.

## Game-token role in V1

The game token is a fixed-maximum-supply ERC-20 whose primary active V1 use at launch is:

- **Creator emissions:** eligible creators farm a pro rata share of a capped allocation based on verified Pack NAV and active eligibility time. Selection, redemption, delisting, or loss of eligibility stops accrual.

The contract retains a future ripper participation-reward configuration set to zero at launch. The owner may later set it only within an immutable deployment-time maximum and a bounded published budget; every configuration change is evented and auditable. It is a participation reward, never a return, yield, appreciation, or guarantee.

At V1 launch, the token is earned-only and transfer-restricted. Normal external wallet-to-wallet `transfer` and `transferFrom` are disabled; user balances are earned only through eligible creator emissions and, if later enabled, the bounded participation reward. Protocol mints, burns, and strictly required internal movements remain allowed.

The contract retains a separately approved path to enable ordinary ERC-20 transfers through an explicit, evented, time-delayed, preferably irreversible switch. Enabling transfers does not itself create external buying; a market or liquidity venue requires a separate decision. Mainnet and external-market opening remain outside V1, with no price, return, availability, or transfer-enablement promise.

The token is not required to Rip, create, or redeem a Pack. It does not affect Pack contents, NAV, unwrap output, selection odds, Trader cadence, or the fixed Rip Price.

Ongoing emissions are gated by prior realized protocol fees: a zero-revenue period creates no new ongoing emission budget, and unused budget does not accumulate for later release. A finite bootstrap allocation, if approved, must be published separately and cannot be represented as revenue-backed. Exact allocations, vesting, emission rates, and any mainnet token launch remain approval-gated decisions.

Creator emissions stop when inventory leaves eligible supply. All creator-emission totals, Pack eligibility inputs, and claims must be reproducible from confirmed records. The token pays no staking yield, fee share, revenue distribution, APY, or guaranteed benefit.

## Safety and accounting invariants

- Every active Pack is fully backed by its recorded basket; fee assets and protocol-owned assets are never counted as Pack backing.
- A Pack can be selected at most once and its fixed Rip payment settles at most once. Failure and retry paths reconcile the same intent and never create a second Rip.
- Every funded, eligible Trader can complete at most one Rip in an hourly window. Ownership transfer, pause, insufficient balance, or ineligibility fails closed.
- Pack selection is uniform across the published eligible set. Every eligible Pack has equal odds; oracle NAV, game-token holdings or stake, creator identity, and Pack attributes never add selection weight.
- Pool NAV bounds are continuously enforced. An out-of-bounds Pack leaves selection and creator-emission eligibility until it returns within bounds, without losing its redemption right; versioned bound changes apply prospectively rather than rewriting active-Pack terms.
- The fixed Rip Price, selected Pack, basket, NAV snapshot, payment, fees, and terminal state are preserved in confirmed audit records.
- Redemption releases only the selected Pack's recorded raw-token basket less disclosed fees. Stale or unavailable oracle data makes NAV-dependent eligibility fail closed; oracle or scheduler failure cannot rewrite custody or permanently block the defined exit.
- Creator emissions come only from a bounded published budget and are never described as offsetting creator loss or promising a return.
- A nonzero ripper participation reward applies only after one confirmed, settled Rip, excludes same-Desk Rips, and remains below the disclosed game cost. Failed, pending, or retried intents never qualify.
- Ordinary external token transfers fail closed at launch. Any later transfer-enablement transition is separately approved, evented, time-delayed, bounded to enabling transferability rather than promising a market, and preferably irreversible.
- Testnet assets and tokens are visibly labelled as valueless test assets. V1 makes no mainnet, yield, appreciation, or guaranteed-profit claim.

## V1 acceptance path

On Robinhood Chain testnet, independent participants can create and fully fund eligible Packs, inspect their backing and NAV, create or acquire Traders, fund those Traders with the configured rip-payment asset, and observe the following without hidden operator edits:

- an enabled Trader completes no more than one fixed-price Rip in an hourly window;
- selection comes from the published eligible Pack set;
- the selected Pack and fixed proceeds settle exactly once;
- confirmed history and creator-emission accounting reflect the same event;
- pause, insufficient funds, stale eligibility data, and ownership transfer fail closed; and
- the current Pack holder can exercise the disclosed transfer and redemption rights.

## Open decisions before implementation planning

- The V1 pool name, fixed rip-payment asset, approved Stock Token set, fee schedule, oracle freshness limits, objective anti-spam eligibility rules, and whether the `$25` / `$15` / `$100` starting hypotheses become launch configuration.
- The random-selection mechanism, audit evidence, outage behavior, and required consumer disclosures.
- The fixed token cap, bootstrap allocation if any, ongoing creator-emission budget, vesting and claim rules, and the immutable ripper-reward maximum and published budget.
- Permitted Pack top-up rules, exact pool-version transition behavior, the transfer-enablement delay, whether that switch is strictly irreversible, and any separately approved external venue or liquidity plan.
- The exact Pack redemption rules and fees, including whether V1 exposes manual redemption in the application or only preserves the protocol right.
- Regulatory and consumer-protection review for paid random selection backed by tokenized financial assets.

## Relationship to existing Floor documents

Mainnet launch remains outside V1. If separately approved, it is a fresh deployment of the same reviewed contract logic with separately verified production configuration: canonical token addresses, Chainlink feed map and freshness limits, whitelist, fees, and roles. No testnet Pack, Trader, game-token, or other state migrates.

This PRD supersedes conflicting Pack-supply, Supplier-allowlist, secondary-market, and autonomous-Trader assumptions in [`docs/prd-margin-call-floor.md`](./prd-margin-call-floor.md) for this proposal. The Floor documents remain useful for the Robinhood-only network boundary, confirmed-intent finality, custody conservation, pause-and-exit asymmetry, event-derived Wire facts, and testnet labelling.
