# Margin Call: The Game Token and Pack Economy

- **Status:** Draft for review
- **Target:** Robinhood Chain testnet
- **Version:** 0.4
- **Date:** July 27, 2026

Domain terms used here are defined in the repo glossary, [`CONTEXT.md`](../CONTEXT.md). Architectural decisions referenced as ADR-NNNN live in [`docs/adr/`](./adr/).

## Product decision

Margin Call V1 is a fixed-price Pack-ripping game operated through persistent Trader identities, run as exactly one 15-day Season on Robinhood Chain testnet. Packs are the immediate game object; Traders are the long game. V1 is a mainnet dress rehearsal: the full economic loop — custody, settlement, emissions, claims, and the disclosed trust model — runs as it would with real money, and the Season's end is the end of the V1 test.

Creators permissionlessly fund auditable Packs of approved tokenized-stock ERC-20s. A Desk Manager funds a Trader with the configured USD stablecoin and assigns it to a named pool or tier. Every funded, eligible Trader may Rip exactly one Pack in each hourly window at that pool's fixed price. Selection is uniform across the eligible set: every eligible Pack has an equal chance regardless of oracle NAV, game-token balance, creator identity, or any other Pack attribute. In V1 the draw itself is executed by the House as a disclosed trusted operation — the eligible set and outcome are on-chain and auditable; the randomness is an operator promise, not a cryptographic proof (ADR-0001). Selection immediately completes the Rip and delivers the Pack to the Trader. There is no discretionary buy, hold-unripped, resell, or market-timing decision in V1.

The game token has a fixed maximum supply of `1,000,000,000` tokens and the finite 15-day Season. Creator emissions receive `150,000,000` tokens (15%) through published fixed hourly-epoch budgets, paid only to Packs whose NAV is at or above the Rip Price (ADR-0002), and confirmed-Rip participation rewards receive a separate `150,000,000` tokens (15%) through published fixed reward pots. The remaining `700,000,000` tokens (70%) are non-emitting and unallocated in V1. The launch allocations are independent of Rip-fee revenue. The token is not the Rip-payment stablecoin, does not change Pack selection odds, and does not buy faster Trader cadence. The product makes no promise that the token will appreciate or that any participant will earn a profit.

Rips are disclosed negative-expected-value entertainment: creators fund possible above-price outcomes, receive the fixed Rip proceeds when selected, and farm a pro rata share of bounded emissions while their inventory stays emission-eligible, without any return promise. The emission gate is the explicit and only subsidy for stocking above-price outcomes; a Pack listed at the NAV floor is legal, selectable, and earns zero tokens.

The initial V1 configuration charges `$25` in the configured USD stablecoin per Rip: a 10% protocol fee retains `$2.50` of that stablecoin as protocol revenue, the creator receives fixed stablecoin proceeds of `$22.50`, the selected Pack transfers to the Trader with control of its full recorded basket, and unwrap or redemption carries no additional fee.

## V1 game loop

1. A creator mints and fully funds a Pack with an approved basket of tokenized-stock ERC-20s.
2. The protocol records the Pack's immutable basket accounting and publishes its contents, oracle NAV, fees, and redemption terms.
3. The Pack enters and remains in a named fixed-price pool while satisfying objective asset, funding, freshness, and pool NAV-bound rules at required eligibility checkpoints. Selection eligibility (NAV within pool bounds) and emission eligibility (NAV at or above the Rip Price) are distinct states checked at the same checkpoints.
4. A Desk Manager funds a Trader with the configured USD stablecoin, reviews the pool's published Pool Statistics, chooses one eligible pool, and enables its deterministic schedule.
5. Once per hourly window, an enabled Trader with sufficient funds may spend exactly one fixed Rip Price. It cannot spend more often, exceed its balance, or choose among eligible Packs.
6. The protocol selects from the eligible set with equal odds for every eligible Pack; the V1 draw is a disclosed House operation (ADR-0001). Selection immediately completes the Rip, transfers the Pack and control of its full recorded basket to the Trader, settles fixed creator proceeds and the protocol fee, and stops that Pack's creator emissions; V1 does not create an unopened-Pack decision point.
7. The confirmed Rip, payment, selected Pack, basket, NAV snapshot, fees, and Trader history are publicly auditable. The manager may later refill or pause the Trader.
8. When the Season ends, pools stop selecting and both emission streams stop. Unripped Packs remain redeemable by their creators, ripped Packs remain redeemable by their holders, and earned token claims remain open. What follows the Season is a separate, data-informed decision, not a V1 commitment.

If a Trader is unfunded, paused, ineligible, or the pool cannot safely execute, it does nothing for that window. Missed windows do not accumulate and cannot be replayed as a burst.

## Architecture and roles

Contracts are built on the [LazerForge](https://github.com/LazerTechnologies/LazerForge) Foundry template in this repo's `contracts/` directory.

### Pack: the immediate object

- A Pack is a transferable ERC-721 backed by a recorded basket of approved ERC-20 tokenized stocks.
- A TokenPacks-style custody contract directly holds and accounts for every Pack's basket. A Pack is not a token-bound account.
- Transferring the Pack transfers the right to its recorded basket. In V1 the current holder can unwrap or redeem the full recorded basket with no protocol deduction, and the application exposes unwrap directly.
- Top-ups are additions only: the creator, and only the creator, may add whitelisted Stock Tokens to an unselected Pack at any time, and every top-up triggers an eligibility checkpoint. There are no partial withdrawals — assets leave a Pack only through full delist-and-redeem or through the holder's unwrap after selection. A published NAV can therefore rise between checkpoints but can never be hollowed out.
- Pack contents and oracle NAV are public and auditable before selection and after transfer. The whitelist resolves canonical addresses from Robinhood's [Token Contracts](https://docs.robinhood.com/chain/contracts/) page and may reconcile metadata through the [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/). Custody accounting uses raw token units; displayed NAV never replaces the recorded basket.
- Pack NAV and eligibility use the approved onchain Chainlink feed for each whitelisted Stock Token, following Robinhood Chain's [oracle and price-feed guidance](https://docs.robinhood.com/chain/oracles-and-price-feeds/). Fresh values are checked at defined hourly-epoch boundaries and relevant Pack interactions, including Rip, top-up, and claim. Calculations normalize token and feed decimals and fail closed on invalid, paused, missing, or stale data. When canonical testnet token or feed coverage is unavailable, clearly labelled Test Assets and controlled feed doubles validate the same accounting and failure semantics.

### Trader: the persistent desk

- A Trader is a transferable ERC-721 identity. Its stablecoin budget and received Packs are protocol custody keyed to the token, so transferring the Trader carries its portfolio and public history by construction. V1 deliberately ships without ERC-6551 token-bound accounts; they arrive with the autonomous-agent V2 that actually exercises them (ADR-0004).
- In V1 the Trader is clockwork automation, not an autonomous market agent. Its only scheduled choice is already made by the manager: rip one Pack from one named pool when the hourly window opens and hard eligibility checks pass.
- The Desk Manager can fund, refill, configure the named pool, enable, and pause the Trader. The Trader cannot change its own pool, cadence, budget, or permissions.
- Ownership changes leave the Trader paused until the new owner claims and re-enables it.

### Creator: permissionless supply

- Any participant may create and list as many fully funded Packs as they can support.
- Creation and active-pool eligibility do not depend on a creator allowlist or per-creator caps. Eligibility follows objective published rules for approved assets, complete funding, oracle freshness, and public contents and NAV. V1 does not attempt supply caps it cannot enforce against wallet-splitting; the demand-side defense against floor-flooding is the published Pool Statistics, which let Desk Managers see a pool's expected value before enabling a Trader.
- Under the initial `$25` configuration, a creator receives fixed proceeds of `$22.50` when their Pack is selected, even when the Pack's NAV is higher than the Rip Price.
- A creator accrues a pro rata share of each hourly epoch's published fixed emission budget, weighted by verified USD Pack NAV and eligible time established at fresh-oracle checkpoints — but only while the Pack's NAV is at or above the Rip Price (ADR-0002). A Pack between the pool floor and the Rip Price remains selectable and earns nothing. Rewards can be claimed at any time without changing the Pack's ongoing eligibility or accrual. Accrual stops when the Pack is selected, redeemed, delisted, or falls below the emission gate or pool bounds.
- Creator copy must disclose maximum immediate downside and must not describe emissions, token price, or pool participation as a return promise.

### Pool and protocol

- Each pool or tier has a stable public name, one configured USD stablecoin, one fixed Rip Price, approved Stock Token rules, fees, and published minimum and maximum USD oracle NAV bounds. Pack NAV and bounds are denominated in USD; Rip Price, creator proceeds, and protocol fees are denominated and settled in that stablecoin.
- The initial V1 Rip Price is `$25`. Its 10% Rip fee retains `$2.50` as protocol revenue in the configured stablecoin and settles `$22.50` as fixed creator proceeds in that stablecoin. The fee is versioned, evented pool configuration that may be adjusted prospectively based on testnet results rather than an immutable universal constant.
- The initial `$25` pool's starting hypothesis is a `$15` minimum NAV and `$100` maximum NAV, with the emission gate at the `$25` Rip Price. These are versioned, evented pool configuration, not immutable universal constants.
- The V1 unwrap or redemption fee is zero. The disclosed Rip fee is the only player-facing protocol fee.
- NAV bounds and the emission gate are enforced with fresh oracle data at defined hourly-epoch boundaries and relevant Pack interactions, including Rip, top-up, and claim; the maximum protects pool risk rather than serving only as a listing-time check. A Pack outside either pool bound leaves the eligible selection set and stops creator emissions until a later checkpoint confirms that price movement or a permitted top-up has returned it within bounds; its redemption right remains intact. A Pack inside pool bounds but below the emission gate remains selectable and simply stops accruing.
- Bound changes apply prospectively to new listings or a new pool version and never silently rewrite the bounds governing existing active Packs.
- Selection within a pool is uniform: oracle NAV, game-token balance, creator identity, and all other Pack attributes have zero selection weight.
- Each pool publishes live Pool Statistics — eligible Pack count, mean and median NAV, and the NAV distribution — so managers can judge a pool's expected value before and while their Traders participate.
- V1 may launch with one pool. Additional fixed-price pools are configuration expansions, not variable pricing within a pool.
- The protocol validates funding and eligibility, enforces one Rip per Trader per hourly window on-chain, settles the fixed payment, and records finality exactly once.
- The House operates the selection and scheduling infrastructure and executes the V1 random draw. It can affect liveness, and — because the draw is a trusted operation — V1 discloses that selection fairness rests on the House rather than on cryptographic proof (ADR-0001). The House cannot create an unfunded Pack, alter a selected basket, charge a different price, reuse a Rip, bypass the on-chain frequency limits, mint outside the capped allocations, or block the Pack holder's disclosed exit.

## Game-token role in V1

The game token is a fixed-maximum-supply ERC-20 with `1,000,000,000` tokens allocated for V1 as follows:

- **Creator emissions — 15%:** `150,000,000` tokens are emitted over the 15-day Season through a published fixed hourly-epoch schedule and distributed pro rata based on verified USD Pack NAV multiplied by eligible time, restricted to Packs at or above the Rip Price (ADR-0002). Selection, redemption, delisting, or loss of eligibility stops accrual.
- **Rip participation rewards — 15%:** `150,000,000` tokens are divided among published fixed daily pots of `10,000,000` tokens, or an equivalent fixed-epoch schedule with the same total cap. Each pot is shared among confirmed qualifying Rips in that epoch; the protocol never mints an uncapped fixed amount per Rip.
- **Unallocated — 70%:** `700,000,000` tokens remain non-emitting, unallocated, and unavailable for use in V1. Any future use requires separate approval and does not imply a market, liquidity, buyback, external distribution, price support, treasury access, or return guarantee.

Only confirmed, settled Rips qualify for the participation pot; failed, pending, or retried intents do not. V1 has no identity-based Sybil gate: a creator ripping their own Packs from another wallet is indistinguishable from any other player and is permitted. The economic bound is disclosed instead of pretended away — every Rip cycle costs the `$2.50` protocol fee plus gas, and fixed per-epoch pots mean farmers dilute each other rather than minting extra supply (ADR-0003). The owner may update the participation-reward configuration only within the immutable deployment-time maximum and the `150,000,000`-token Season allocation, and every change must be evented and auditable. The configured reward remains below the disclosed game cost and is never a return, yield, appreciation, or guarantee.

Emission and reward accounting is computed off-chain from confirmed on-chain records by a published, reproducible algorithm, and paid through per-epoch merkle Claim Roots posted on-chain (ADR-0005). Anyone can recompute any epoch's entitlements from the same records. The token contract hard-caps each `150,000,000`-token allocation independently of posted roots, so an incorrect root can never inflate supply.

At V1 launch, the token is earned-only and transfer-restricted. Normal external wallet-to-wallet `transfer` and `transferFrom` are disabled; user balances are earned only through eligible creator emissions and qualifying Rip participation rewards. Protocol mints, burns, and strictly required internal movements remain allowed. Transfers stay locked for the entire V1 Season.

The contract ships with a one-way, irreversible transfer-enable switch behind a 72-hour timelock: enabling is explicit, evented, delayed, and cannot be undone, and it is exercisable only post-V1 as a separately approved decision. Enabling transfers does not itself create external buying; a market or liquidity venue requires a separate decision. Any stablecoin-fee-funded market buy, buyback, or liquidity program is post-V1 and separately approved; buying through an approved pool is distinct from adding two-sided liquidity, and neither creates a price target, floor, redemption right, or return promise. Mainnet and external-market opening remain outside V1, with no price, return, availability, or transfer-enablement promise.

The token is not required to Rip, create, or redeem a Pack. It does not affect Pack contents, NAV, unwrap output, selection odds, Trader cadence, or the fixed Rip Price.

Creator emissions and Rip participation rewards are minted from their separate fixed-supply allocations under the published launch schedules. Stablecoin protocol revenue neither gates nor funds either token budget and does not directly pay or mint either reward. Any mainnet token launch remains an approval-gated decision.

Creator emissions stop when inventory leaves emission-eligible supply. All creator-emission totals, Pack eligibility inputs, and claims must be reproducible from confirmed records. The token pays no staking yield, fee share, revenue distribution, APY, or guaranteed benefit.

## Safety and accounting invariants

- Every active Pack is fully backed by its recorded basket; fee assets and protocol-owned assets are never counted as Pack backing.
- Pack baskets only grow before selection: top-ups are creator-only additions of whitelisted assets with an immediate checkpoint, and no path removes assets from a listed Pack except full delist-and-redeem or the holder's post-selection unwrap.
- A Pack can be selected at most once and its fixed Rip payment settles at most once. Failure and retry paths reconcile the same intent and never create a second Rip.
- Every funded, eligible Trader can complete at most one Rip in an hourly window, enforced on-chain. Ownership transfer, pause, insufficient balance, or ineligibility fails closed.
- Selection odds are equal across the published eligible set: oracle NAV, game-token holdings or stake, creator identity, and Pack attributes never add selection weight. In V1 the draw is a disclosed House operation (ADR-0001); the eligible set, the outcome, and every settlement are on-chain and auditable even though the draw itself is trusted.
- Pool NAV bounds and the emission gate are enforced with fresh oracle data at defined epoch boundaries and relevant Pack interactions. An out-of-bounds Pack leaves selection and emission eligibility until a later checkpoint confirms its return, without losing its redemption right; a below-gate, in-bounds Pack stays selectable and stops accruing; versioned bound changes apply prospectively rather than rewriting active-Pack terms.
- The fixed Rip Price, selected Pack, basket, NAV snapshot, payment, fees, and terminal state are preserved in confirmed audit records.
- Initial settlement conserves the full `$25` stablecoin payment: `$22.50` goes to the creator and `$2.50` remains protocol revenue in the configured stablecoin, while the selected Pack transfers to the Trader with control of its full recorded basket and its creator emissions stop.
- Redemption releases the selected Pack's full recorded raw-token basket with zero protocol fee. Stale or unavailable oracle data makes NAV-dependent eligibility fail closed; oracle or scheduler failure cannot rewrite custody or permanently block the defined exit — including after the Season ends.
- The fixed supply is `1,000,000,000` tokens. Creator emissions and Rip participation rewards can never exceed their separate `150,000,000`-token Season allocations, enforced in the token contract independently of any posted Claim Root; the remaining `700,000,000` tokens do not emit or become available in V1.
- Creator emissions follow the published fixed hourly-epoch budget, accrue only to Packs at or above the Rip Price, remain independent of Rip-fee revenue, and are never described as offsetting creator loss or promising a return.
- Rip-fee revenue remains in the configured USD stablecoin as protocol revenue; it does not gate, fund, directly pay, or mint either V1 token reward.
- A Rip participation pot is shared only among confirmed, settled qualifying Rips in its fixed epoch and cannot become an uncapped per-Rip mint. Failed, pending, or retried intents never qualify; there is no identity-based Sybil gate, and the protocol fee is the disclosed economic bound on self-Rips (ADR-0003). The configured reward remains below the disclosed game cost.
- All emission and reward entitlements are reproducible by third parties from confirmed records under the published algorithm (ADR-0005).
- Ordinary external token transfers fail closed for the entire Season. The transfer-enable switch is one-way, irreversible, 72-hour time-delayed, evented, bounded to enabling transferability rather than promising a market, and exercisable only post-V1.
- Testnet assets and tokens are visibly labelled as valueless test assets. V1 makes no mainnet, yield, appreciation, or guaranteed-profit claim.

## V1 acceptance path

On Robinhood Chain testnet, independent participants can create and fully fund eligible Packs, inspect their backing and USD NAV, review published Pool Statistics, create or acquire Traders, fund those Traders with the configured USD stablecoin, and observe the following without hidden operator edits:

- an enabled Trader completes no more than one fixed-price Rip in an hourly window;
- selection comes from the published eligible Pack set;
- the selected Pack and fixed proceeds settle exactly once;
- confirmed history, creator-emission accounting, and qualifying-Rip reward accounting reflect the same events, are independently reproducible from confirmed records, and remain within their separate published launch allocations;
- pause, insufficient funds, stale eligibility data, and ownership transfer fail closed;
- the current Pack holder can exercise the disclosed transfer and redemption rights directly in the application; and
- when the Season ends, selection and emissions stop while redemption and claims remain open.

## V1 launch configuration

- **Season:** starts August 4, 2026 and runs 15 days, ending at the August 19 boundary. Exact epoch timestamps are an open configuration item.
- **Stablecoin:** Robinhood Chain testnet has no canonical test USDC, so the protocol deploys its own mock USD stablecoin, visibly labelled as a valueless test asset. The mainnet stablecoin is USDG; that configuration is verified fresh at any separately approved mainnet deployment and nothing about the mock carries over.
- **Approved Stock Token whitelist (testnet):**

  | Ticker | Address                                      |
  | ------ | -------------------------------------------- |
  | AMZN   | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` |
  | AMD    | `0x71178BAc73cBeb415514eB542a8995b82669778d` |
  | NFLX   | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
  | PLTR   | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` |
  | TSLA   | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` |

  Creators acquire these permissionlessly from Robinhood's official testnet faucet (`faucet.testnet.chain.robinhood.com`), which dispenses testnet ETH and all five listed Stock Tokens.

- **Desk Grant:** every new account receives a one-time `$50` mock-stablecoin deposit at desk creation — enough for two Rips — plus a rate-limited in-app refill (initially `$50` per account per day, versioned configuration). Because the mock stablecoin is granted rather than bought, the `$2.50` protocol-fee Sybil tax is nominal on testnet, and Season participation-reward data is treated as directional rather than economically load-bearing (see ADR-0003).

## Open decisions before implementation planning

- The V1 pool name, oracle freshness limits, and checkpoint timing rules.
- Whether the `$15` / `$100` USD NAV-bound hypothesis becomes launch configuration, and the criteria for prospective changes to the initial 10% Rip fee after testnet results.
- Exact Season epoch timestamps, integer-rounding and empty-pot treatment, and permitted configuration changes within the fixed allocations and immutable maximums.
- Chainlink feed availability on testnet for each whitelisted Stock Token; any gaps are covered by controlled feed doubles per the oracle section.

Resolved since v0.2 (see `docs/adr/`): the selection trust model (ADR-0001), the creator-emission gate (ADR-0002), the Sybil stance (ADR-0003), Trader account architecture (ADR-0004), emissions accounting and claims (ADR-0005), top-up rules, in-app redemption, the transfer-enable switch shape, end-of-Season behavior, the mock stablecoin and Desk Grant, the Stock Token whitelist, and the Season start date. Regulatory and consumer-protection review is explicitly waived by the owner for the testnet Season and remains a gate for any mainnet decision.

## Relationship to prior Floor documents

Mainnet launch remains outside V1. If separately approved, it is a fresh deployment of the same reviewed contract logic with separately verified production configuration: canonical Stock Token addresses, USDG as the settlement stablecoin, Chainlink feed map and freshness limits, whitelist, fees, and roles — plus the regulatory review waived for testnet. No testnet Pack, Trader, game-token, or other state migrates. Mainnet also requires revisiting the V1 operator-trust decisions: verifiable randomness replaces the House draw when available on Robinhood Chain (ADR-0001).

The earlier Floor PRD (`docs/prd-margin-call-floor.md`) has been removed from the repo; this document supersedes it. The principles it contributed are carried forward here directly: the Robinhood-only network boundary, confirmed-intent finality, custody conservation, pause-and-exit asymmetry, event-derived Wire facts, and visible testnet labelling.
