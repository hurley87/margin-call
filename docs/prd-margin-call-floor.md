# Margin Call: The Floor

**Status:** Ready for implementation planning  
**Target:** Robinhood Chain testnet  
**Version:** 1.0  
**Date:** July 25, 2026

## Problem Statement

Margin Call's current Base Sepolia game resolves prompt-based deals through an application-controlled outcome loop. That model does not make inventory ownership, trade execution, or realized performance the core of the game. It also leaves too much of the economic truth in application state and does not produce the legible, onchain trading-floor loop the product now needs.

The replacement must let a human-run desk equip autonomous Traders to acquire blind Lots of tokenized-stock test assets, trade those Lots with other Traders for test USDG, and redeem them for their underlying inventory. The game must be playable end to end on a public Robinhood Chain testnet without real funds and without ongoing operator intervention after initial setup.

The difficult part is not the user interface. It is preserving solvency and custody across randomized Rips, supplier withdrawals, asynchronous settlement, external NFT transfers, autonomous-agent authority, and oracle interruptions. The system must keep those guarantees onchain while using Convex for realtime coordination and read models.

The release also needs an honest trust model. The House operates the roller and active Offer Book, sponsors gas, and can affect liveness. It must not be able to mint outside published configuration, reuse a Rip, forge a maker price, spend supplier claims, or block exits. The product will not claim provable fairness, ungameable reputation, or production readiness from a valueless testnet deployment.

## Solution

Build The Floor as a clean replacement for the current deal economy on Robinhood Chain testnet.

A Desk Manager creates a transferable Trader NFT whose ERC-6551 token-bound account holds test USDG, Lots, and cracked underlying assets. The manager funds assets outside the application, chooses a receiving Trader, and pays a fixed test USDG Rip Price into one House-operated Window. The House roller selects a ticker and Lot size from a published, versioned distribution. The Window validates live oracle data, configuration bounds, inventory capacity, and exactly-once settlement before minting a transferable Lot NFT to the chosen Trader.

Allowlisted Suppliers, not the House, provide the Window's underlying inventory. The House seeds a recoverable test USDG reserve so every accepted Rip can satisfy the largest possible supplier obligation. Each pending Rip reserves a Capacity Slot consisting of worst-case inventory for every eligible ticker and the corresponding USDG liability. Supplier principal claims remain senior and immediately withdrawable; unconsumed inventory withdrawals are delayed and may use only unreserved inventory.

Traders sell Lots on an ask-only Floor. A maker signs a short-lived offer, and Convex maintains the active Offer Book. A fill requires both the maker signature and a short-lived House book authorization, allowing gas-free cancellation and re-quoting without letting the House invent a maker price. Settlement atomically exchanges the Lot for the quoted USDG amount, deducts the configured fee, records the buyer's Acquisition Cost, and emits the facts used for Realized P&L and the Wire.

A Lot can be Cracked at any time for its raw underlying token amount less a configured raw-token fee. Cracking is feed-independent and remains available during pauses or oracle outages. Lots and Traders remain standard transferable NFTs and may be sold externally. Margin Call does not track arbitrary external-transfer consideration. Live ownership is checked at display and settlement time; an unscored external transfer becomes scored again only when a later Floor purchase establishes a known Acquisition Cost for the buyer.

Convex owns the offchain realtime system: Desk and Trader read models, roll receipts, the Offer Book, active-book authorizations, agent scheduling, approval workflows, the acquisition ledger, experimental leaderboard calculations, and the Wire. Onchain contracts remain the source of truth for custody, ownership, settlement, claims, capacity, fees, and exits. The Wire derives typed facts from confirmed events and uses an LLM only to render period-appropriate diction.

The initial release has one Window, one configured Rip Price of 10 test USDG, two Lot classes—Regular Lot and Block—and a configurable long-tailed size distribution. Canonical Robinhood Chain testnet Stock Tokens, USDG, multipliers, and feeds are used where available. Any missing equivalent is replaced by a visibly labelled Margin Call Test Asset; mocks must never be presented as real Robinhood assets.

The release is complete when two independently owned desks can execute the following public-testnet path: create or claim Traders, fund them outside the application, Rip a Lot to the first Trader, resolve the Rip, post and fill an offer between Traders, Crack the purchased Lot in kind, withdraw the Supplier's USDG claim, and observe at least one confirmed event on the Wire—with sponsored gas and no manual House action after initial deployment, funding, configuration, and opening.

## User Stories

1. As a Desk Manager, I want to connect an independently controlled wallet, so that my Desk ownership is not shared with the House.
2. As a Desk Manager, I want to create a Trader NFT, so that my autonomous Trader has a persistent identity and token-bound account.
3. As a Desk Manager, I want to claim a Trader after acquiring it externally, so that I can review and reconfigure it before automation resumes.
4. As a Desk Manager, I want a Trader sale to transfer the Trader's complete token-bound inventory and balances, so that the identity and portfolio remain inseparable.
5. As a Desk Manager, I want previous agent authority and open offers invalidated when a Trader changes owners, so that a prior owner cannot act after the sale.
6. As a Desk Manager, I want to fund test assets outside the application, so that v1 does not require an in-app faucet or distribution workflow.
7. As a Desk Manager, I want the application to detect missing test USDG or gas readiness and link me to setup instructions, so that funding failures are understandable.
8. As a Desk Manager, I want supported game actions to be gas sponsored, so that testnet gameplay does not require routine native-token management.
9. As a Desk Manager, I want to select the receiving Trader before starting a Rip, so that the resulting Lot lands in the intended account without a later reassignment workflow.
10. As a Desk Manager, I want to see the current Rip Price, eligible tickers, size distribution, fees, and Window state before paying, so that the published rules are clear.
11. As a Desk Manager, I want a successful Rip to charge exactly the configured Rip Price, so that the Trader's initial Acquisition Cost is unambiguous.
12. As a Desk Manager, I want an expired unresolved Rip to be permissionlessly refundable to its payer, so that a failed House roller cannot strand funds.
13. As a Desk Manager, I want a refund to release its Capacity Slot exactly once, so that capacity returns without enabling a second mint or refund.
14. As a Desk Manager, I want Lots to remain standard transferable NFTs, so that I may transfer or sell them on external marketplaces.
15. As a Desk Manager, I want externally transferred Lots to remain usable in Margin Call, so that contract-level transferability does not break gameplay.
16. As a Desk Manager, I want Margin Call to avoid inventing a purchase price for an external transfer, so that Realized P&L is based only on known consideration.
17. As a Desk Manager, I want the next Floor purchase after an external transfer to establish the buyer's Acquisition Cost, so that scoring can resume without tracking external transfer history.
18. As a Trader, I want to hold test USDG, Lots, and cracked underlying assets in my own token-bound account, so that my inventory is inspectable and travels with my identity.
19. As a Trader, I want to post a signed ask for a Lot without an onchain transaction, so that quoting and re-quoting are fast and gas-free.
20. As a Trader, I want to cancel or replace an offer immediately in the active book, so that stale quotes cannot be filled with a reused book authorization.
21. As a Trader, I want a fill to require my exact signed lot, price, expiry, maker identity, and nonce, so that neither the House nor the taker can change my terms.
22. As a Trader, I want fills to reject offers that are expired, replayed, inactive, no longer owned, or issued before an ownership change, so that settlement follows current authority.
23. As a Trader, I want a lifted offer to atomically transfer the Lot and quoted test USDG, so that neither side can receive only half of the trade.
24. As a Trader, I want the settlement fee deducted from seller proceeds, so that net proceeds and Realized P&L use the same economic amount.
25. As a Trader, I want Realized P&L to equal net Floor sale proceeds minus my known Acquisition Cost, so that scored performance is reproducible.
26. As a Trader, I want my Rip Price to be the initial Acquisition Cost rather than the Lot's Origin Intrinsic Value, so that luck and trading skill remain distinct.
27. As a Trader, I want a Floor purchase price to become my new Acquisition Cost, so that each known holder is scored on its own trade.
28. As a Trader, I want a Direct Transfer to produce no scored profit or loss, so that unknown off-platform consideration is not guessed.
29. As a Trader, I want to Crack a Lot for its underlying asset in kind, so that each Lot has a hard, feed-independent redemption path.
30. As a Trader, I want the Crack fee calculated in raw underlying units, so that corporate-action display multipliers do not change custody math.
31. As a Trader, I want Cracking and other exits to remain available during an emergency pause, so that the House cannot trap my inventory.
32. As a Trader, I want automation to act only through typed Margin Call actions, so that an agent key cannot make arbitrary token-bound-account calls.
33. As a Trader, I want per-fill spend caps, daily spend caps, nonces, expiries, and key revocation enforced onchain, so that compromised automation has bounded authority.
34. As a Desk Manager, I want ticker allowlists, premium tolerance, dry-run mode, and manager approval thresholds enforced by the application workflow, so that strategy changes do not require contract upgrades.
35. As a Desk Manager, I want large fills or Cracks to pause for my approval when configured, so that autonomous execution respects my intervention policy.
36. As a Supplier, I want to deposit allowlisted test stock inventory instantly, so that I can stock the Window without waiting for an epoch.
37. As a Supplier, I want each consumed raw token unit attributed to my inventory and supplier claim, so that my proceeds are mechanically auditable.
38. As a Supplier, I want my principal claim to equal the oracle value of the exact inventory consumed when the Lot is minted, so that my sale price is not confused with the Rip Price.
39. As a Supplier, I want accrued test USDG principal to be withdrawable immediately, including during a pause, so that House operations cannot spend or delay senior claims.
40. As a Supplier, I want to request withdrawal of unconsumed inventory and complete it after the configured delay, so that the Window has predictable stock while preserving my exit.
41. As a Supplier, I want reserved inventory excluded from withdrawals, so that pending Rips stay fully backed.
42. As a Supplier, I want to see per-ticker deposited, reserved, consumed, and withdrawable raw units, so that I can reconcile my position.
43. As a Supplier, I want to see principal claims, surplus share, and completed withdrawals without an APY promise, so that testnet accounting is transparent without marketing yield.
44. As the House, I want to seed a recoverable test USDG reserve before opening the Window, so that rare Blocks can be settled without the House supplying stock as principal.
45. As the House, I want the Window to reject opening or new Rips when worst-case reserve and inventory requirements are not met, so that every accepted Rip remains solvent.
46. As the House, I want each pending Rip to reserve a worst-case Capacity Slot across every drawable ticker and its corresponding USDG obligation, so that concurrent Rips cannot overcommit the Window.
47. As the House, I want the contract to validate every roller result against the Rip's stored configuration version and output bounds, so that the roller cannot invent an unsupported outcome.
48. As the House, I want every roll receipt to contain a unique nonce, input identity, configuration version, selected outcome, transaction reference, and final status, so that operational disputes can be investigated.
49. As the House, I want one pending Rip to permit exactly one mint or one refund, so that retries remain safe.
50. As the House, I want stale, paused, or otherwise invalid oracle data to block new Rips without blocking Cracks or the 24/7 Floor, so that oracle safety does not remove exits.
51. As the House, I want configuration changes to require a closed Window with no pending Rips, so that an accepted Rip cannot have its terms changed mid-flight.
52. As the House, I want breaking protocol changes to use a new non-upgradeable deployment, so that custody rules cannot change beneath active positions.
53. As the House, I want an emergency pause to stop new deposits, Rips, offers, and fills while preserving refunds, cancellations, claims, matured withdrawals, and Cracks, so that incident response limits new risk without trapping assets.
54. As the House, I want operational roller, book-authorizer, relayer, and configuration roles separated and rotatable, so that one compromised key does not control the entire system.
55. As the House, I want collected Crack fees isolated from supplier inventory, so that fee-owned raw tokens cannot be consumed by future Rips or counted as supplier stock.
56. As the House, I want true surplus allocated only after supplier principal and the required House Reserve are restored, so that rake distribution cannot create insolvency.
57. As the House, I want same-desk fills rejected and per-counterparty contribution caps and simple round trips reflected in leaderboard scoring, so that basic suspicious activity is discouraged without pretending it can be eliminated.
58. As the House, I want leaderboard rank to remain experimental and non-monetary, so that testnet wash trading has no direct reward.
59. As a spectator, I want the Wire to report confirmed Rips, Blocks, fills, Cracks, and Window status, so that the Floor feels alive without exposing unconfirmed outcomes.
60. As a spectator, I want every number in the Wire to trace to a typed event or stored snapshot and survive validation unchanged, so that period diction cannot fabricate market facts.
61. As a spectator, I want Test Assets clearly labelled everywhere, so that mock instruments cannot be mistaken for real Robinhood Stock Tokens or real money.
62. As an operator, I want to deploy, fund, configure, and open the system once and then complete the acceptance path without manual intervention, so that the release demonstrates a functioning autonomous game rather than a staged demo.
63. As an operator, I want observable health for reserve coverage, Capacity Slots, oracle freshness, unresolved Rips, role actions, failed relays, book-authorizer availability, and Wire publication, so that operational failures can be diagnosed before they strand gameplay.
64. As an auditor, I want raw-token, test USDG, claim, fee, and pending-capacity conservation to hold across arbitrary valid action sequences, so that the protocol's solvency is demonstrated beyond happy-path examples.

## Implementation Decisions

### Release boundary and product model

- The Floor is a clean replacement for the current Base deal game. It does not run as a parallel mode and does not migrate legacy desks, Traders, balances, deals, outcomes, or history.
- V1 targets only a public Robinhood Chain testnet. It uses valueless test assets and makes no mainnet, legal-access, bridge, supplier-yield, or real-asset launch claims.
- There is one House-operated Window with one initial Rip Price of 10 test USDG. Multiple windows, size controls, and permissionless Window creation are deferred.
- The published size distribution contains only Regular Lots and Blocks. Block is explicitly a game rarity label, not a securities-market classification.
- The initial exact ticker weights, Regular/Block sizes, Block frequency, fees, reserve requirement, Supplier surplus share, withdrawal delay, pending-Rip timeout, and rate limits are versioned configuration tuned on testnet rather than permanent protocol constants.
- The initial settlement fee is 0.5 percent of the quoted Floor price. The initial Crack fee is selected within a 2–3 percent range of raw underlying units before the testnet configuration is opened; either value remains versioned configuration rather than immutable code.
- No in-app faucet is built. The application detects missing balances and directs the user to external testnet funding instructions. The House sponsors gas for supported user and agent actions.

### Trust and source-of-truth boundaries

- Onchain contracts are authoritative for ownership, custody, Window state, configuration versions, pending Rips, Capacity Slots, mint/refund finality, supplier claims, fees, fills, Crack results, agent authority, and emergency exits.
- Convex is authoritative for active-book state, short-lived book authorizations, roll-receipt operations, agent scheduling and strategy policy, manager approvals, chain-derived read models, the acquisition ledger, experimental leaderboard state, and Wire publication state.
- Chain-derived Convex records are projections, not competing financial truth. Reconciliation is idempotent, keyed by chain identity and log position, and tolerant of retries and temporary reordering.
- The House is trusted for roller and Offer Book liveness and can censor availability. It is not trusted to bypass contract bounds, forge maker prices, settle twice, spend Supplier claims, or block exits.
- The product does not use or claim provably fair randomness. The roller uses a cryptographically secure offchain source, emits an immutable receipt with a unique nonce, and is open to inspection. Commit-reveal, seed commitments, and verifiable randomness are deferred.

### Protocol components

- The protocol comprises a non-upgradeable Window vault, a single Lot NFT collection, a settlement contract, a transferable Trader NFT, and an audited ERC-6551 account implementation registered through the canonical registry.
- Use the canonical Robinhood Chain testnet ERC-6551 registry when present. Deploy and verify a compatible audited account implementation because an implementation address from another chain must not be assumed to contain code on Robinhood Chain.
- Contract dependencies and interfaces are fixed per deployment. Economic configuration is versioned and can change only while the Window is closed and has no pending Rips. Breaking changes require a new deployment and explicit application cutover.
- Separate administrative powers from routine operational powers. Configuration, pause, allowlist, and role rotation are administrative. Rolling, book authorization, and relaying are narrow operational capabilities.
- All financial amounts use integer raw token units. Decimal normalization is explicit at boundaries. Fee-on-transfer, rebasing, or otherwise non-conserving assets are unsupported unless a later version designs for them deliberately.

### Window, inventory, and reserve accounting

- Allowlisted Suppliers are the only source of principal stock inventory. The House never deposits stock as principal, though it may own raw tokens earned as protocol Crack fees.
- A Supplier deposit is available immediately. A Supplier inventory withdrawal is requested first, matures after the active configuration's delay, and can release only unreserved inventory.
- Before opening, the Window must be able to cover the largest allowed supplier obligation under the active configuration. Before accepting each Rip, it must reserve one Capacity Slot containing worst-case raw inventory availability for every eligible ticker and sufficient test USDG liquidity for the resulting supplier obligation.
- Capacity reservations are released only by the Rip's successful mint or refund. A Window with insufficient capacity rejects the Rip rather than changing weights or silently shrinking the outcome set.
- The roller selects ticker and size within the stored configuration version. The contract obtains the valid price, applies asset-specific decimals correctly, computes raw units and Origin Intrinsic Value, verifies inventory and capacity, and consumes the pending Rip exactly once.
- Supplier principal for consumed inventory equals the valid oracle value of the exact raw units at mint. It is senior, separately accounted, and immediately claimable. It is not equal to the Rip Price unless those values happen to match.
- Rip payment first satisfies consumed-inventory principal, then restores the House Reserve to its configured requirement. Only value remaining after both obligations is true surplus eligible for the configured House/Supplier split.
- Settlement fees follow the same solvency priority before becoming distributable House revenue. Crack fees remain denominated in raw underlying tokens and are held in an isolated protocol-fee balance excluded from Supplier inventory and Capacity calculations.
- Recoverable reserve capital may be withdrawn only while the Window is closed, no Rips are pending, all Supplier claims are fully backed, all matured withdrawal obligations can be honored, and the post-withdrawal reserve remains at or above the active requirement.
- The former cumulative minted-basis-versus-rip-payments constraint is not used because a valid rare Block can exceed cumulative Rip payments by consuming pre-seeded reserve. Solvency instead comes from exact raw-unit conservation, senior claims, explicit reserve coverage, per-Rip capacity, bounded outcomes, and exactly-once state transitions.

### Rips, Lots, valuation, and Cracks

- A Rip records payer, receiving Trader, Rip Price, creation and expiry times, configuration version, and final status before the roller acts.
- Only an active Trader controlled by a non-House Desk may receive a Rip. Traders themselves cannot initiate Rips through delegated agent authority.
- A timed-out unresolved Rip may be refunded by any caller, but test USDG returns only to the recorded payer. Mint and refund are mutually exclusive terminal states.
- Each Lot stores immutable underlying identity, raw amount, Rip Price, Origin Intrinsic Value, configuration version, and roll-receipt reference. The receiving Trader's initial Acquisition Cost is the Rip Price.
- The collection uses a stable metadata endpoint. Share display may use the asset's current ERC-8056 multiplier, but custody always uses immutable raw units. If the price feed is already multiplier-adjusted, valuation must not apply the multiplier a second time.
- The application may display both immutable Origin Intrinsic Value and current oracle-derived intrinsic value, clearly labelled. Neither is substituted for the current holder's Acquisition Cost.
- Oracle freshness, sequencer status, asset support, and token-level oracle pause state gate new Rips. Oracle failure does not stop Floor fills that do not need a price, refunds, claims, matured withdrawals, or Cracks.
- Cracking burns the Lot and sends the holder the stored raw underlying amount less the configured raw-token fee. It does not create a test USDG sale, use an oracle, or realize scored P&L.
- Rips are the only way to mint Lots. Supplier deposits alone never create game positions, and Cracks permanently reduce the closed Lot float.

### Floor and acquisition accounting

- The Floor is ask-only. It does not support bids, auctions, lot swaps, or machine buybacks.
- An offer binds chain, settlement deployment, Lot identifier, current maker Trader, quoted test USDG price, expiry, and nonce. The maximum initial order age is two minutes.
- A fill requires both a valid maker signature and a fresh Convex-issued active-book authorization bound to that exact offer. The authorization proves only that the offer remains active; it cannot change the maker's terms.
- Book authorization expiry is short enough to bound cancellation races. Cancellation and replacement immediately remove the offer from the active book, and old authorizations expire rather than requiring an onchain cancel transaction.
- Settlement checks current Lot ownership, Trader ownership epoch, maker and taker authority, active configuration, expiry, replay protection, same-Desk exclusion, allowlisted payment asset, balance, approval, and agent caps before atomic transfer.
- Offer display is a convenience view, not a settlement guarantee. Convex validates live ownership and prunes offers after transfers, but the settlement contract performs the final ownership and authorization checks.
- A successful fill deducts the configured settlement fee from seller proceeds. The seller's scored Realized P&L is net proceeds minus its known Acquisition Cost.
- A Rip establishes known Acquisition Cost for the first holder. A Floor fill establishes known Acquisition Cost for the buyer. A Direct Transfer does not copy or invent an Acquisition Cost for the recipient.
- When the current seller lacks a known Acquisition Cost because of a Direct Transfer, the fill still executes but produces no scored seller P&L. The buyer's exact fill price becomes known Acquisition Cost for later scoring.
- Margin Call does not retain or reconstruct arbitrary external Lot transfer history. Ownership is read live from chain, and only Rip and Floor-purchase consideration enters the acquisition ledger.

### Trader identity and agent authority

- Trader NFTs and Lot NFTs remain standard permissionlessly transferable ERC-721 tokens. No non-transferability restriction is added to either contract.
- Ownership of a Trader NFT controls its ERC-6551 account and therefore its complete balances and inventory. The application does not provide a v1 Trader marketplace or polished ownership-migration interface.
- A Trader transfer increments an authority epoch or equivalent invalidation value, revokes old delegated agent keys, invalidates pre-transfer offers, pauses automation, and requires the new owner to claim and configure the Trader before resuming.
- The Trader owner retains general account control. Delegated agent keys can sign only typed Margin Call quote, fill, cancel, and Crack intents against permitted protocol contracts.
- Onchain agent controls include permitted action domain, permitted contract addresses, per-fill test USDG cap, rolling daily spend cap, nonce/replay protection, expiry, authority epoch, and revocation.
- Convex owns strategy-level controls: ticker allowlists, premium tolerance, cadence, dry-run, manager approval thresholds, and operational pause. Contract caps are the final ceiling even if Convex is compromised.
- The initial base agent cycle is no slower than approximately 90 seconds while maximum offer age is two minutes. These values are configured and reviewed together so an unstaked Trader can maintain a quote.

### Convex orchestration and application behavior

- Convex replaces Supabase and Vercel Workflow for all new Floor offchain state and scheduling. New sensitive operations are internal functions or authenticated HTTP actions; every public boundary has runtime validation and server-derived identity.
- Stable identity comes from the authenticated token identifier and its onchain wallet binding. Client-supplied user identifiers never authorize Desk, Trader, offer, or approval access.
- High-churn data such as agent heartbeats, offer status, roll attempts, and relayer activity is separated from stable Desk and Trader records. Unbounded histories use child records and bounded indexed queries rather than growing arrays.
- Scheduled work uses Convex crons and scheduler functions. Roll resolution, chain indexing, agent cycles, and Wire publication are idempotent and safe to retry without duplicating onchain actions.
- Chain writes use prepare, sign or sponsor, submit, and confirm states with one stable intent identifier. A timeout after submission triggers reconciliation, never blind re-signing or resubmission.
- The application presents explicit authenticated, loading, empty, ready, stale, paused, submitted, confirmed, failed, and refundable states from Convex and chain data. Realtime subscriptions update these states without timer-based guesses.
- The application includes one Window view, Trader inventory and policy views, an Offer Book, a transaction or activity view, Supplier accounting, the experimental leaderboard, and the existing in-app Wire experience adapted to Floor events.
- The application does not include an in-app faucet, bridge, mainnet purchase flow, supplier recruiting APY page, Trader marketplace, or post-mint Lot reassignment workflow.

### Wire, reputation, and observability

- Typed event producers calculate every factual field before prose generation. The LLM may change diction but may not add or alter ticker, quantity, price, fee, P&L, ownership, status, or timestamp facts.
- Publication occurs only after the source event reaches the configured confirmation threshold. Failed validation, reorg, or missing evidence prevents publication.
- V1 Wire event families are Rip, Block, Fill, Crack, and Window status. The in-app feed is required; the existing optional X posting path may be reused. Farcaster and a daily editorial column are deferred.
- Reputation uses known Realized P&L only. The initial experimental leaderboard applies same-Desk exclusion at settlement, per-counterparty contribution caps, and simple reciprocal round-trip netting. It does not use device fingerprints, social-account gates, or funding-provenance clustering.
- Leaderboard rank has no monetary reward, and the product does not claim suspicious trading has been prevented. Settlement fees are an economic mechanic being tested, not a complete anti-Sybil defense.
- Operational telemetry covers Window solvency, per-ticker capacity, reserve health, supplier claim backing, pending and expired Rips, oracle freshness, relayer and sponsor failures, role changes, book-authorizer health, chain-index lag, agent-cycle failures, and Wire validation failures.
- Every privileged action and configuration transition creates an auditable record containing actor, previous value, next value, chain reference where applicable, and timestamp.

## Testing Decisions

### Smart-contract system seam

- Smart-contract testing follows the [LazerForge](https://github.com/LazerTechnologies/LazerForge) Foundry model and its [testing guidance](https://github.com/LazerTechnologies/LazerForge/blob/main/lazerTutorial/testing.md): explicit compiler selection, deterministic block height and timestamp, optimized reproducible builds without compiler metadata, named profiles for local development, CI fuzzing, gas analysis, via-IR when needed, and network endpoints supplied through environment variables.
- The baseline configuration disables automatic compiler detection, pins Solidity 0.8.28, removes bytecode and CBOR metadata, uses a realistic fixed test block number and timestamp, and retains LazerForge's high-optimization intent. The gas profile uses via-IR and one million optimizer runs, while the CI fuzz profile runs at least 1,024 cases. Any deviation required by Robinhood Chain or contract-size constraints must be documented with the reason.
- Adapt those conventions to the repository's existing contract workspace rather than importing LazerForge wholesale. Keep the currently useful unit, end-to-end, fuzz, invariant, integration, mock, and public-fork separation.
- Test files use the `Contract.t.sol` convention with descriptive behavior-oriented test names and shared setup. Every externally reachable state transition receives positive, revert, authorization, replay, zero-value, maximum-value, decimal, boundary-time, pause, and ownership-change cases where applicable.
- A high-seam protocol harness deploys the Window, Lot NFT, Settlement, Trader NFT, account implementation, test USDG, multiple test stock tokens, mutable oracle doubles, and representative House, Supplier, manager, Trader, and agent actors.
- Stateful invariant campaigns must prove raw stock conservation per asset; test USDG conservation; Supplier principal is always backed; fee balances never enter Supplier inventory; reserved capacity equals live pending obligations; reserve withdrawals preserve the requirement; terminal Rips cannot mint and refund; Lots cannot fill or Crack twice; offers cannot replay; and pause states preserve every specified exit.
- Fuzz campaigns cover asset decimals, oracle prices, multipliers, distribution boundaries, Regular and Block sizes, fees, concurrent Capacity Slots, Supplier allocation, withdrawal timing, offer price and expiry, daily spend windows, and arbitrary sequences of Rip, resolve, refund, transfer, fill, claim, withdrawal, and Crack.
- Dedicated tests prove stale feeds and sequencer failure stop only price-dependent Rips; multiplier-adjusted feeds are not multiplied twice; raw-unit Crack outputs survive simulated corporate-action multiplier changes; and fee-on-transfer or rebasing assets are rejected.
- Trader-transfer tests prove ERC-6551 control follows the current NFT owner while prior agent keys, authority epochs, open offers, and automation cannot survive the ownership change.
- Settlement tests prove a maker signature alone is insufficient, a book authorization alone is insufficient, cancellation bounds are enforced, current ownership is checked, same-Desk fills fail, seller proceeds are net of fee, unknown external-transfer basis remains unscored, and the buyer receives a new known Acquisition Cost.
- The deterministic happy-path test executes the full acceptance flow from Supplier deposit and reserve seed through Rip, resolution, offer, cross-Desk fill, Crack, Supplier claim, and reserve reconciliation.
- Local development runs a fast deterministic profile. CI runs `forge fmt --check`, the complete non-fork suite, and the higher-run fuzz/invariant profile. `forge snapshot` output is committed for sensitive paths, and meaningful gas regressions require explicit review. Coverage reports are generated for the protocol suite, with exclusions limited to deployment or generated artifacts.
- Public-network fork or smoke tests are isolated from deterministic CI and require explicit RPC configuration. They validate deployed bytecode, canonical registry behavior, token/feed interfaces, event decoding, and integration assumptions without using real funds.
- Existing Foundry tests for escrow and seat-vault unit, e2e, fuzz, invariant, integration, mocks, and Base Sepolia fork behavior are prior art for suite structure. The new protocol replaces the old economic assertions rather than inheriting obsolete deal-game invariants.

### Convex orchestration seam

- Convex behavior is tested with `convex-test`, Vitest, and the edge runtime, using the repository's existing schema/module test harness and authenticated identity helpers.
- A chain adapter boundary is mocked for deterministic Convex tests. Tests assert emitted intents and reconciliation outcomes rather than reproducing Solidity accounting in TypeScript.
- Behavior tests cover authenticated ownership, Trader transfer synchronization, Window projections, pending Rip lifecycle, roll-receipt immutability, duplicate scheduler delivery, retry after ambiguous submission, Offer Book authorization and expiry, cancellation, live-ownership pruning, acquisition-cost transitions, leaderboard filtering, and Wire confirmation gates.
- Agent tests prove strategy cannot exceed contract-shaped caps, approval-required actions stop before submission, paused or transferred Traders stop scheduling, a stale cycle cannot overwrite newer state, and resuming schedules at most one immediate cycle.
- Wire tests use typed fixtures to prove every published number comes from the source event, changed numbers fail validation, unconfirmed or reverted events are not published, and Test Asset labels are preserved in generated text.
- Query tests use indexed bounded access patterns and exercise empty, pagination, stale, partial-indexing, and recovery states. Operational histories are tested for bounded reads and idempotent insertion keys.
- The existing Convex setup harness, cycle-idempotency tests, agent-scheduler cost-control tests, reconciliation tests, Wire simulation, and tweet-validation tests are prior art to extend.

### Public-testnet smoke seam

- A scripted Robinhood Chain testnet runbook validates the deployed system from two independent wallet owners and one Supplier identity. Test assets are funded outside the application; the script never mints or distributes them through product UI.
- The smoke flow verifies sponsored gas, Trader creation or claim, Supplier deposit, House reserve seed, Window open, Rip payment, automated roll resolution, Lot metadata, maker offer, active-book authorization, cross-Desk fill, balances and fees, acquisition ledger, Crack output, Supplier claim, reserve health, and at least one confirmed Wire item.
- The run records transaction hashes, emitted event identities, deployed addresses, configuration version, oracle freshness, pre/post balances, and final reconciliation state. It must distinguish canonical Robinhood testnet assets from visibly labelled Margin Call Test Assets.
- After initial deployment, funding, configuration, and opening, the run permits no manual database edit, contract impersonation, forced scheduler mutation, or operator-triggered settlement. A failure must surface a diagnosable product state rather than requiring hidden intervention.
- The existing Sepolia MCP e2e script and e2e testing runbook are prior art for secrets, evidence capture, and external-chain verification, but the new smoke path targets Robinhood Chain testnet and The Floor's lifecycle.

## Out of Scope

- Robinhood Chain mainnet, real funds, real-value assets, production launch claims, bridges, swaps, and jurisdictional or geofencing controls.
- Migration or import of current Base desks, Traders, balances, deals, outcomes, leaderboard history, or Wire history; running the old and new games in parallel.
- Permissionless Suppliers, permissionless Window creation, multiple Windows, per-ticker Windows, a user-controlled Rip size dial, and institutional tiers.
- In-app test-token minting, distribution, faucet operation, or native-gas acquisition.
- Commit-reveal, VRF, seed commitments, cryptographic fairness proofs, and a provably-fair marketing claim.
- Bids, auctions, lot-for-lot swaps, machine buybacks, automatic cash redemption, and Bankr-powered Crack-to-cash.
- Non-transferable Trader or Lot NFTs, an in-app Trader marketplace, external-sale settlement, external transfer-price tracking, and a polished post-sale migration experience.
- Post-mint reassignment of a Lot between a manager's Traders; a manager may use a standard NFT transfer instead.
- Quiver, Bankr agent skills, arbitrary token-bound-account agent execution, Supabase, and Vercel Workflow.
- A game token, staking, cycle-speed purchases, resting-order tiers, buy-and-burn, Morpho yield, supplier APY claims, and monetary leaderboard rewards.
- Advanced anti-Sybil or suspicious-trading systems such as device fingerprinting, social-account gates, wallet-funding clusters, identity graphing, or claims that the leaderboard is manipulation-proof.
- Odd-lot and round-lot grades, cosmetic rarity systems beyond Regular Lot and Block, and claims that Block corresponds to a regulated or conventional market threshold.
- Farcaster distribution, daily Wire columns, earnings forecasting, investment advice, price prediction, or unconfirmed-event narration.
- Automated corporate-action state migration. Raw custody remains unchanged and display valuation follows the current supported multiplier/feed interface.

## Further Notes

- This specification supersedes the earlier interview draft wherever they conflict. The repository vocabulary and architecture decisions are captured separately in the project context and ADRs for replacement scope, non-upgradeable custody, active-book authorization, and permissionless Trader transfers.
- The contracts intentionally protect safety more strongly than liveness. The House can stop rolling or authorizing fills, but users retain refunds, cancellations, Supplier claims, matured inventory withdrawals, and Cracks.
- The first testnet configuration should be conservative and observable. A long-tailed distribution with an approximately one-percent Block region is a starting hypothesis, not an acceptance criterion; configuration may change between closed Window sessions as solvency and gameplay data arrive.
- Example P&L: a Lot with an Origin Intrinsic Value of 8 test USDG is acquired in a 10 test USDG Rip. Alice sells it on the Floor for 12 test USDG net of fee and records +2. Bob's Acquisition Cost becomes 12; if Bob later sells for 13 net, Bob records +1. If either receives the Lot by Direct Transfer, that recipient has no scored Acquisition Cost until a later Floor purchase establishes one.
- Before implementation planning, confirm the current Robinhood Chain testnet chain identifier, RPC behavior, canonical Stock Token and USDG addresses, feed interfaces and freshness semantics, sequencer uptime feed, ERC-8056 multiplier behavior, ERC-6551 registry bytecode, gas-sponsorship support, and explorer verification path. Missing canonical assets must route to the explicit Test Asset fallback without changing protocol accounting.
- Security review should focus first on Supplier claim seniority, reserve withdrawal conditions, concurrent Capacity Slots, decimal and multiplier handling, Rip terminal-state races, active-book authorization races, ERC-6551 ownership changes, typed agent permissions, and pause/exit asymmetry.
- The specification is ready to decompose into vertical implementation slices. A sensible tracer path is: deterministic contract system with mock assets; Convex projections and one manual actor flow; autonomous offer/fill; Supplier accounting and exits; Wire; then the public-testnet acceptance run.
