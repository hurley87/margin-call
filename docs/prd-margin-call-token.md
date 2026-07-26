# Margin Call: The Game Token and Pack Economy

- **Status:** Draft for review
- **Target:** Robinhood Chain testnet
- **Version:** 0.2
- **Date:** July 26, 2026

## Product decision

Margin Call V1 is a fixed-price Pack-ripping game operated through persistent Trader identities. Packs are the immediate game object; Traders are the long game.

Creators permissionlessly fund auditable Packs of approved tokenized-stock ERC-20s. A Desk Manager funds a Trader with the configured USD stablecoin and assigns it to a named pool or tier. Every funded, eligible Trader may Rip exactly one Pack in each hourly window at that pool's fixed price. The protocol selects uniformly at random: every eligible Pack has an equal chance regardless of oracle NAV, game-token balance, creator identity, or any other Pack attribute. Selection immediately completes the Rip and delivers the Pack to the Trader. There is no discretionary buy, hold-unripped, resell, or market-timing decision in V1.

The game token has a fixed maximum supply of `1,000,000,000` tokens and a finite 15-day launch-emission season. Creator emissions receive `150,000,000` tokens (15%) through published fixed hourly-epoch budgets, and confirmed-Rip participation rewards receive a separate `150,000,000` tokens (15%) through published fixed reward pots. The remaining `700,000,000` tokens (70%) are non-emitting and unallocated in V1. The launch allocations are independent of Rip-fee revenue. The token is not the Rip-payment stablecoin, does not change Pack selection odds, and does not buy faster Trader cadence. The product makes no promise that the token will appreciate or that any participant will earn a profit.

Rips are disclosed negative-expected-value entertainment: creators fund possible above-price outcomes, receive the fixed Rip proceeds when selected, and farm a pro rata share of bounded emissions while eligible inventory remains active, without any return promise.

The initial V1 configuration charges `$25` in the configured USD stablecoin per Rip: a 10% protocol fee retains `$2.50` of that stablecoin as protocol revenue, the creator receives fixed stablecoin proceeds of `$22.50`, the selected Pack transfers to the Trader with control of its full recorded basket, and unwrap or redemption carries no additional fee.

## V1 game loop

1. A creator mints and fully funds a Pack with an approved basket of tokenized-stock ERC-20s.
2. The protocol records the Pack's immutable basket accounting and publishes its contents, oracle NAV, fees, and redemption terms.
3. The Pack enters and remains in a named fixed-price pool or tier only while satisfying objective asset, funding, freshness, anti-spam, and pool NAV-bound rules at required eligibility checkpoints.
4. A Desk Manager funds a Trader's ERC-6551 account with the configured USD stablecoin, chooses one eligible pool, and enables its deterministic schedule.
5. Once per hourly window, an enabled Trader with sufficient funds may spend exactly one fixed Rip Price. It cannot spend more often, exceed its balance, or choose among eligible Packs.
6. The protocol selects uniformly at random from the eligible set, giving every eligible Pack an equal chance. Selection immediately completes the Rip, transfers the Pack and control of its full recorded basket to the Trader, settles fixed creator proceeds and the protocol fee, and stops that Pack's creator emissions; V1 does not create an unopened-Pack decision point.
7. The confirmed Rip, payment, selected Pack, basket, NAV snapshot, fees, and Trader history are publicly auditable. The manager may later refill or pause the Trader.

If a Trader is unfunded, paused, ineligible, or the pool cannot safely execute, it does nothing for that window. Missed windows do not accumulate and cannot be replayed as a burst.

## Architecture and roles

### Pack: the immediate object

- A Pack is a transferable ERC-721 backed by a recorded basket of approved ERC-20 tokenized stocks.
- A TokenPacks-style custody contract directly holds and accounts for every Pack's basket. A Pack is not an ERC-6551 token-bound account.
- Transferring the Pack transfers the right to its recorded basket. In V1 the current holder can unwrap or redeem the full recorded basket with no protocol deduction.
- Pack contents and oracle NAV are public and auditable before selection and after transfer. The whitelist resolves canonical addresses from Robinhood's [Token Contracts](https://docs.robinhood.com/chain/contracts/) page and may reconcile metadata through the [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/). Custody accounting uses raw token units; displayed NAV never replaces the recorded basket.
- Pack NAV and creator-emission eligibility use the approved onchain Chainlink feed for each whitelisted Stock Token, following Robinhood Chain's [oracle and price-feed guidance](https://docs.robinhood.com/chain/oracles-and-price-feeds/). Fresh values are checked at defined hourly-epoch boundaries and relevant Pack interactions, including Rip, top-up, and claim. Calculations normalize token and feed decimals and fail closed on invalid, paused, missing, or stale data. When canonical testnet token or feed coverage is unavailable, clearly labelled Test Assets and controlled feed doubles validate the same accounting and failure semantics.

### Trader: the persistent desk

- A Trader is a transferable ERC-721 identity with an ERC-6551 token-bound account; transferring it carries its portfolio and public history.
- In V1 the Trader is clockwork automation, not an autonomous market agent. Its only scheduled choice is already made by the manager: rip one Pack from one named pool when the hourly window opens and hard eligibility checks pass.
- The Desk Manager can fund, refill, configure the named pool, enable, and pause the Trader. The Trader cannot change its own pool, cadence, budget, or permissions.
- Ownership changes revoke prior automation authority and leave the Trader paused until the new owner claims and re-enables it.

### Creator: permissionless supply

- Any participant may create and list as many fully funded Packs as they can support.
- Creation and active-pool eligibility do not depend on a creator allowlist. Eligibility follows objective published rules for approved assets, complete funding, oracle freshness, public contents and NAV, protocol fees or bonds, and anti-spam limits.
- Under the initial `$25` configuration, a creator receives fixed proceeds of `$22.50` when their Pack is selected, even when the Pack's NAV is higher than the Rip Price.
- A creator accrues a pro rata share of each hourly epoch's published fixed emission budget, weighted by verified USD Pack NAV and eligible time established at fresh-oracle checkpoints. Rewards can be claimed at any time without changing the Pack's ongoing eligibility or accrual. Accrual stops when the Pack is selected, redeemed, delisted, or becomes ineligible.
- Creator copy must disclose maximum immediate downside and must not describe emissions, token price, or pool participation as a return promise.

### Pool and protocol

- Each pool or tier has a stable public name, one configured USD stablecoin, one fixed Rip Price, approved Stock Token rules, fees, and published minimum and maximum USD oracle NAV bounds. Pack NAV and bounds are denominated in USD; Rip Price, creator proceeds, and protocol fees are denominated and settled in that stablecoin.
- The initial V1 Rip Price is `$25`. Its 10% Rip fee retains `$2.50` as protocol revenue in the configured stablecoin and settles `$22.50` as fixed creator proceeds in that stablecoin. The fee is versioned, evented pool configuration that may be adjusted prospectively based on testnet results rather than an immutable universal constant.
- The initial `$25` pool's starting hypothesis is a `$15` minimum NAV and `$100` maximum NAV. These are versioned, evented pool configuration, not immutable universal constants.
- The V1 unwrap or redemption fee is zero. The disclosed Rip fee is the only player-facing protocol fee.
- NAV bounds are enforced for active eligibility using fresh oracle data at defined hourly-epoch boundaries and relevant Pack interactions, including Rip, top-up, and claim; the maximum protects pool risk rather than serving only as a listing-time check. A Pack outside either bound leaves the eligible selection set and stops creator emissions until a later checkpoint confirms that price movement or a permitted top-up has returned it within bounds; its redemption right remains intact.
- Bound changes apply prospectively to new listings or a new pool version and never silently rewrite the bounds governing existing active Packs.
- Selection within a pool is uniform: oracle NAV, game-token balance, creator identity, and all other Pack attributes have zero selection weight.
- V1 may launch with one pool. Additional fixed-price pools are configuration expansions, not variable pricing within a pool.
- The protocol validates funding and eligibility, enforces one Rip per Trader per hourly window, selects the Pack, settles the fixed payment, and records finality exactly once.
- The House may operate the selection and scheduling infrastructure and can affect liveness. It cannot create an unfunded Pack, alter a selected basket, charge a different price, reuse a Rip, bypass frequency limits, or block the Pack holder's disclosed exit.

## Game-token role in V1

The game token is a fixed-maximum-supply ERC-20 with `1,000,000,000` tokens allocated for V1 as follows:

- **Creator emissions — 15%:** `150,000,000` tokens are emitted over the 15-day launch season through a published fixed hourly-epoch schedule and distributed pro rata based on verified USD Pack NAV multiplied by eligible time. Selection, redemption, delisting, or loss of eligibility stops accrual.
- **Rip participation rewards — 15%:** `150,000,000` tokens are divided among published fixed daily pots of `10,000,000` tokens, or an equivalent fixed-epoch schedule with the same total cap. Each pot is shared among confirmed qualifying Rips in that epoch; the protocol never mints an uncapped fixed amount per Rip.
- **Unallocated — 70%:** `700,000,000` tokens remain non-emitting, unallocated, and unavailable for use in V1. Any future use requires separate approval and does not imply a market, liquidity, buyback, external distribution, price support, treasury access, or return guarantee.

Only confirmed, settled Rips qualify for the participation pot. Failed, pending, or retried intents and same-Desk Rips do not qualify. Multiple Traders and automated paid Rips may qualify under the same hard per-Trader cadence and settlement rules; V1 does not add a broad identity-based Sybil gate. The owner may update the participation-reward configuration only within the immutable deployment-time maximum and the `150,000,000`-token season allocation, and every change must be evented and auditable. The configured reward remains below the disclosed game cost and is never a return, yield, appreciation, or guarantee.

At V1 launch, the token is earned-only and transfer-restricted. Normal external wallet-to-wallet `transfer` and `transferFrom` are disabled; user balances are earned only through eligible creator emissions and qualifying Rip participation rewards. Protocol mints, burns, and strictly required internal movements remain allowed.

The contract retains a separately approved path to enable ordinary ERC-20 transfers through an explicit, evented, time-delayed, preferably irreversible switch. Enabling transfers does not itself create external buying; a market or liquidity venue requires a separate decision. Any stablecoin-fee-funded market buy, buyback, or liquidity program is post-V1 and separately approved; buying through an approved pool is distinct from adding two-sided liquidity, and neither creates a price target, floor, redemption right, or return promise. Mainnet and external-market opening remain outside V1, with no price, return, availability, or transfer-enablement promise.

The token is not required to Rip, create, or redeem a Pack. It does not affect Pack contents, NAV, unwrap output, selection odds, Trader cadence, or the fixed Rip Price.

Creator emissions and Rip participation rewards are minted from their separate fixed-supply allocations under the published launch schedules. Stablecoin protocol revenue neither gates nor funds either token budget and does not directly pay or mint either reward. Any mainnet token launch remains an approval-gated decision.

Creator emissions stop when inventory leaves eligible supply. All creator-emission totals, Pack eligibility inputs, and claims must be reproducible from confirmed records. The token pays no staking yield, fee share, revenue distribution, APY, or guaranteed benefit.

## Safety and accounting invariants

- Every active Pack is fully backed by its recorded basket; fee assets and protocol-owned assets are never counted as Pack backing.
- A Pack can be selected at most once and its fixed Rip payment settles at most once. Failure and retry paths reconcile the same intent and never create a second Rip.
- Every funded, eligible Trader can complete at most one Rip in an hourly window. Ownership transfer, pause, insufficient balance, or ineligibility fails closed.
- Pack selection is uniform across the published eligible set. Every eligible Pack has equal odds; oracle NAV, game-token holdings or stake, creator identity, and Pack attributes never add selection weight.
- Pool NAV bounds are enforced with fresh oracle data at defined epoch boundaries and relevant Pack interactions. An out-of-bounds Pack leaves selection and creator-emission eligibility until a later checkpoint confirms its return within bounds, without losing its redemption right; versioned bound changes apply prospectively rather than rewriting active-Pack terms.
- The fixed Rip Price, selected Pack, basket, NAV snapshot, payment, fees, and terminal state are preserved in confirmed audit records.
- Initial settlement conserves the full `$25` stablecoin payment: `$22.50` goes to the creator and `$2.50` remains protocol revenue in the configured stablecoin, while the selected Pack transfers to the Trader with control of its full recorded basket and its creator emissions stop.
- Redemption releases the selected Pack's full recorded raw-token basket with zero protocol fee. Stale or unavailable oracle data makes NAV-dependent eligibility fail closed; oracle or scheduler failure cannot rewrite custody or permanently block the defined exit.
- The fixed supply is `1,000,000,000` tokens. Creator emissions and Rip participation rewards can never exceed their separate `150,000,000`-token launch-season allocations; the remaining `700,000,000` tokens do not emit or become available in V1.
- Creator emissions follow the published fixed hourly-epoch budget, remain independent of Rip-fee revenue, and are never described as offsetting creator loss or promising a return.
- Rip-fee revenue remains in the configured USD stablecoin as protocol revenue; it does not gate, fund, directly pay, or mint either V1 token reward.
- A Rip participation pot is shared only among confirmed, settled qualifying Rips in its fixed epoch and cannot become an uncapped per-Rip mint. Same-Desk Rips and failed, pending, or retried intents never qualify, and the configured reward remains below the disclosed game cost.
- Ordinary external token transfers fail closed at launch. Any later transfer-enablement transition is separately approved, evented, time-delayed, bounded to enabling transferability rather than promising a market, and preferably irreversible.
- Testnet assets and tokens are visibly labelled as valueless test assets. V1 makes no mainnet, yield, appreciation, or guaranteed-profit claim.

## V1 acceptance path

On Robinhood Chain testnet, independent participants can create and fully fund eligible Packs, inspect their backing and USD NAV, create or acquire Traders, fund those Traders with the configured USD stablecoin, and observe the following without hidden operator edits:

- an enabled Trader completes no more than one fixed-price Rip in an hourly window;
- selection comes from the published eligible Pack set;
- the selected Pack and fixed proceeds settle exactly once;
- confirmed history, creator-emission accounting, and qualifying-Rip reward accounting reflect the same event and remain within their separate published launch allocations;
- pause, insufficient funds, stale eligibility data, and ownership transfer fail closed; and
- the current Pack holder can exercise the disclosed transfer and redemption rights.

## Open decisions before implementation planning

- The V1 pool name, exact USD stablecoin, approved Stock Token set, oracle freshness and eligibility-checkpoint rules, objective anti-spam eligibility rules, whether the `$15` / `$100` USD NAV-bound hypothesis becomes launch configuration, and the criteria for prospective changes to the initial 10% Rip fee after testnet results.
- The random-selection mechanism, audit evidence, outage behavior, and required consumer disclosures.
- The launch-season start and end boundaries, exact epoch timestamps, integer-rounding and empty-pot treatment, creator and ripper claim rules, and permitted configuration changes within the fixed allocations and immutable maximums.
- Permitted Pack top-up rules, exact pool-version transition behavior, the transfer-enablement delay, whether that switch is strictly irreversible, and any separately approved external venue or liquidity plan.
- The Pack redemption workflow, including whether V1 exposes manual redemption in the application or only preserves the protocol right.
- Regulatory and consumer-protection review for paid random selection backed by tokenized financial assets.

## Relationship to existing Floor documents

Mainnet launch remains outside V1. If separately approved, it is a fresh deployment of the same reviewed contract logic with separately verified production configuration: canonical Stock Token and USD stablecoin addresses, Chainlink feed map and freshness limits, whitelist, fees, and roles. No testnet Pack, Trader, game-token, or other state migrates.

This PRD supersedes conflicting Pack-supply, Supplier-allowlist, secondary-market, and autonomous-Trader assumptions in [`docs/prd-margin-call-floor.md`](./prd-margin-call-floor.md) for this proposal. The Floor documents remain useful for the Robinhood-only network boundary, confirmed-intent finality, custody conservation, pause-and-exit asymmetry, event-derived Wire facts, and testnet labelling.
