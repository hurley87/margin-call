# Proposed Margin Call Protocol Overview

> **Status: product and protocol proposal.** Margin Call is currently a coming-soon application scaffold. The custody, inventory, pricing, reservation, claim, withdrawal, and settlement behavior described here is not implemented or shipped.

## Thesis

Margin Call is a proposed shared protocol for real financial inventory.

Applications can contribute approved inventory; Margin Call holds and accounts for it under common rules; and permissionless applications can build games, markets, portfolio and collection experiences, liquidity tools, and other products on the same inventory.

**Stock Gacha is the first proposed application and proof of the protocol. It is not the definition or limit of Margin Call.**

The protocol creates a shared inventory layer rather than one more application-specific treasury. Value created when applications use inventory can flow to three participants:

- the contributor who supplied the inventory;
- the application that created demand and owns its product economics; and
- Margin Call, which supplies the common custody and accounting rules.

This overview deliberately does not assign fixed percentages to those participants.

## The problem

An application that delivers real financial assets must ordinarily source, custody, price, manage, and settle its own inventory. Each new application repeats that work.

The result is fragmentation:

- liquidity is split across application treasuries;
- inventory deposited for one experience is trapped in that silo;
- contributors cannot make the same idle supply useful to multiple applications;
- every application must recreate solvency, pricing, custody, and settlement controls; and
- users must trust each application to keep its offered rewards or allocations funded.

Margin Call proposes to make approved inventory reusable across applications without making it unaccountable. Applications share access to supply; contributors retain attributable ownership and economics; and the protocol prevents the same unit from backing more than one obligation.

## Available inventory and provenance

**Available inventory** is the aggregate quantity of approved deposited units currently free for an application to use. This is the canonical term; the protocol does not call it a “shared pool.”

Each unit has exactly one protocol state:

| State                 | Meaning                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Available**         | Deposited, accepted, and free to reserve or allocate.                                                                             |
| **Reserved**          | Locked for a specific pending application obligation and unavailable elsewhere.                                                   |
| **Claimed**           | Backing a vested user ownership claim and unavailable to applications or contributors.                                            |
| **Withdrawn/settled** | No longer available to the protocol because the contributor or claimant received the inventory through the applicable final path. |

No transition may allocate one unit twice. Reserved inventory cannot be withdrawn or reserved by another application. Claimed inventory remains locked for its owner until it is withdrawn or transferred through a supported path.

Inventory is pooled for application access, but not stripped of provenance. Margin Call must preserve the relationship between contributed units and their contributor so it can attribute:

- contributor earnings;
- contributor withdrawals;
- audit history; and
- evidence needed to resolve disputes.

Aggregate application access and contributor attribution are both protocol requirements.

## Supply and access

### Contributing inventory

Any wallet or application may propose a deposit, but Margin Call accepts only assets on the V1 operator’s public asset registry. The V1 operator publicly maintains both the registry and the acceptance criteria used to whitelist assets.

This means contribution is open at the wallet level but bounded at the asset level. Permissionless deposits do not imply that an arbitrary token becomes protocol inventory.

A contributor may withdraw only inventory that is still available. Inventory cannot be withdrawn while it is reserved for an application or backing a user claim.

### Using inventory

Application access is open and permissionless. An application does not need a bespoke integration approval to use approved available inventory, but it must use the protocol’s public terms and state transitions.

An application:

- cannot reach into a contributor’s wallet;
- cannot use an asset outside the public registry;
- cannot allocate reserved, claimed, or withdrawn inventory;
- cannot override the protocol’s valuation; and
- cannot bypass the principal, fee, finality, or solvency checks for an allocation.

## Responsibility boundary

Margin Call and its applications have distinct responsibilities.

| Margin Call owns                     | Applications own                                         |
| ------------------------------------ | -------------------------------------------------------- |
| Custody of deposited inventory       | Product experience and user interface                    |
| Inventory state and provenance       | Application pricing and entry payments                   |
| Approved price inputs                | Odds and outcome distribution                            |
| Reservations and ownership claims    | Product-specific pools and their composition             |
| Contributor and claimant withdrawals | Selection of eligible inventory to request               |
| Settlement                           | Product risk, upside, working capital, and subsidy       |
| Protocol solvency invariants         | Application-specific randomness and outcome verification |

Stock Gacha therefore owns its randomness. Draws should be independently verifiable, but the protocol does not decide which user receives which outcome and does not set the game’s odds.

For a proposed Stock Gacha allocation, Margin Call validates only:

- the selected asset is eligible;
- the required inventory is available;
- the user’s purchase is final;
- the application supplies the full locked protocol-quoted inventory value plus the allocation fee; and
- the requested state transition preserves protocol invariants.

**Games decide outcomes; the protocol makes valid outcomes real.**

## Stock Gacha: the first proof

Stock Gacha is the proposed first application because it can prove that shared inventory supports a consumer experience whose rewards are real assets rather than application credits.

Before a user plays, Stock Gacha publishes:

- the entry price;
- the reward inventory in the offered pool;
- the remaining availability or pool size; and
- the odds of each outcome.

V1 does not require the application to calculate or display expected value. The published inputs must nevertheless be sufficient for an independent observer to verify the draw rules and pool state.

Every meaningful V1 reward is actual protocol inventory. Points, credits, cosmetic upgrades, or internal balances do not substitute for the financial inventory promised by an offered outcome.

### Game economics and solvency

Stock Gacha collects entry payments directly. It may use those payments to acquire or reserve inventory through Margin Call, but the protocol does not socialize the game’s risk.

Stock Gacha owns both the upside and downside of its outcome distribution. It must maintain enough pre-funded reserve or working capital—or an explicit subsidy—to settle the full locked protocol-quoted value of higher-value outcomes and the separate allocation fee. Every offered pool must be solvent before its first draw.

The application may set its odds and pool size to target a positive expected game margin. Margin Call does not set or guarantee that margin.

The solvency order is strict:

1. the application defines and funds an offered pool;
2. the user’s purchase reaches payment finality;
3. the application settles the inventory’s full locked protocol-quoted value to the contributor, pays the separate allocation fee, and atomically creates the backed user ownership claim; and
4. only then may the application reveal the funded outcome.

If that atomic transition fails, no application funding, inventory, fee, or claim moves. Stock Gacha must retry or refund rather than reveal an unfunded reward.

## Inventory principal, allocation fee, and value flow

An allocation has two distinct economic amounts:

1. **Inventory principal** — the inventory’s full locked protocol-quoted value, denominated in USDC and settled by the consuming application to the contributor in exchange for the ownership represented by the user’s claim.
2. **Allocation fee** — a separate application-access fee calculated as one public V1 percentage of that locked value, also denominated in USDC.

The allocation fee is not payment for the inventory principal. Paying the fee alone never transfers ownership of contributor inventory.

The fee:

- uses the protocol’s locked quote for the allocation;
- is transparently split between the inventory contributor and Margin Call; and
- uses one operator-set rate uniformly across all approved V1 assets.

The thesis does not hard-code the V1 fee percentage or split. Asset-specific rates are a possible later extension, not a V1 behavior.

The application’s economics are separate from both settlement amounts. Stock Gacha collects its entry payments and bears its game outcomes. For an allocation, it must fund any difference between the user’s entry payment and the full inventory principal plus allocation fee from its reserve, working capital, or explicit subsidy.

At a high level, inventory use therefore creates value for the contributor, application, and protocol without confusing the contributor’s principal with fee revenue.

## Public asset registry and pricing

Each whitelisted asset has a public registry entry that defines:

- the asset’s onchain address;
- its canonical unit convention;
- one approved external oracle or pricing adapter; and
- the maximum permitted age of a price.

At reservation or allocation, Margin Call reads the approved quote, snapshots it, calculates and locks both the USDC-denominated inventory principal and allocation fee, and rejects the transition if the price is missing or stale. Applications cannot provide or substitute their own protocol valuation.

The registry must make unit handling explicit. For B20 assets in particular, it must distinguish:

- the raw onchain token amount;
- the scaled economic unit used for prices and user ownership; and
- any corporate-action multiplier connecting the two.

Reservations, claims, principal, fees, and withdrawals must use the same canonical conversion. A split, consolidation, or multiplier change must not create or destroy a claimant’s economic ownership. The registry and accounting history must make it possible to translate the locked economic claim into the correct underlying units after such an event.

This overview intentionally does not prescribe a specific oracle provider or contract interface. Those choices require technical design and asset-specific diligence.

## Settlement and ownership

An allocation is valid only when the application’s full USDC inventory principal and separate allocation fee, reservation of eligible available inventory, and creation of the user’s ownership claim succeed atomically after the user purchase is final.

On failure, nothing moves. In particular, there is no state in which:

- the contributor transferred inventory without receiving the locked principal;
- the application paid only the allocation fee for user-owned inventory;
- the user has paid but no funded claim exists;
- a game has revealed a reward that is not backed;
- the same inventory backs multiple claims; or
- an allocation fee is charged for a failed allocation.

The ownership claim vests only after the user’s purchase or payment is final. Once vested, it is immediately visible as the user’s ownership, does not expire, and remains backed by locked protocol inventory until withdrawal or transfer.

V1 proposes withdrawal of the actual inventory at a later time. It explicitly does **not** promise cash redemption, protocol buyback, or a guaranteed exit price at launch.

## Proposed V1 invariants

The V1 design is not complete until its technical specification and tests can enforce these statements:

1. Only assets in the public operator registry can become protocol inventory.
2. Application access to approved available inventory is permissionless.
3. Each inventory unit is available, reserved, claimed, or withdrawn/settled—never more than one at once.
4. Contributor provenance remains attributable through aggregate application access.
5. Contributors can withdraw only inventory that is neither reserved nor backing a claim.
6. Applications cannot provide protocol valuations or use stale or missing quotes.
7. B20 raw units, scaled units, and corporate-action multipliers preserve economic ownership.
8. Every offered Stock Gacha pool is solvent before its first draw.
9. Every meaningful V1 Stock Gacha reward is real protocol inventory.
10. The consuming application settles the full locked inventory principal plus the separate allocation fee.
11. Principal settlement, fee payment, reservation, and claim creation are atomic after user payment finality.
12. A vested ownership claim is visible, non-expiring, and fully backed until withdrawal or transfer.
13. V1 promises actual-inventory withdrawal, not cash redemption or buyback.

## Deliberate non-decisions

This proposal does not yet choose:

- the initial asset list or published asset-acceptance criteria;
- the oracle or pricing adapter for any asset;
- the public V1 allocation-fee percentage or contributor/protocol split;
- the exact representation and transfer mechanics of ownership claims;
- the reservation lifetime, cancellation rules, and any pre-allocation collateral requirement;
- the timing and operational flow for actual-inventory withdrawals;
- the initial Stock Gacha entry price, pool composition, odds, or subsidy; or
- the detailed treatment of a specific B20 corporate action beyond the invariant that economic ownership is preserved.

Those are inputs to later product, economic, and technical specifications. They must not be inferred from this thesis or described as implemented until the repository contains and verifies them.

## Positioning

**Margin Call makes approved financial inventory reusable across permissionless applications while preserving contributor attribution and user ownership.**

For contributors:

**Contribute approved inventory once; let multiple applications create demand under common rules.**

For applications:

**Build the experience and economics; use Margin Call for valid, solvent inventory transitions.**
