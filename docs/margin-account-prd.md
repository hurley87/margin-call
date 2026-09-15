# Margin Call — Transferable Financed Spot Positions PRD

## Status and authority

This is the current proposed V1 for Margin Call. It supersedes the earlier Stock Gacha and generalized inventory-protocol directions.

The hackathon objective is intentionally narrow: prove that a user can deposit real NVDAc, finance additional NVDAc with protocol-owned USDC, represent the live stock-plus-debt position as an ERC-721, transfer that position without unwinding it, and let the new owner settle and close it.

The contracts and application described here are requirements, not implemented features.

---

## Product statement

> **Margin Call finances real NVDAc spot exposure and makes the financed position transferable.**

Perpetuals already provide leveraged synthetic exposure. Margin Call instead finances ownership of the actual onchain stock token.

A live Position NFT represents:

- recorded NVDAc held by Margin Call;
- remaining USDC principal;
- accrued borrow interest;
- current ownership and optional executor;
- liquidation risk and lifecycle history.

When the NFT transfers, the underlying stock and debt do not move or reset. Control of the existing position simply follows `ownerOf(tokenId)` on `MarginCall` itself.

V1 demonstrates **transferable financed positions**, not a functioning secondary market. Purchase settlement, bidding, listings, and marketplace guarantees are deferred.

---

## V1 scope

- Base only.
- Long only.
- NVDAc only.
- One stock per position.
- Margin Call directly custodies position NVDAc.
- `MarginCall` itself is the ERC-721 Position NFT contract; there is no separate `PositionNFT` contract.
- Opening leverage uses one of five fixed presets: `1.0x`, `1.1x`, `1.25x`, `1.4x`, or `1.5x`.
- `1.0x` is spot-only and draws no credit.
- Above `1.0x`, borrowed USDC can only buy more NVDAc.
- Borrowed USDC is never freely withdrawable.
- Protocol-owned USDC `CreditPool`; no public LP vault.
- Simple borrow interest at an immutable `10% APR`.
- Chainlink total-return pricing for solvency.
- Uniswap for NVDAc/USDC execution.
- Full liquidation only.
- No liquidator reward.
- Standard ERC-721 transfer semantics with **no financial transfer gate**.
- One optional executor per position.

The post-open management surface is deliberately minimal. There is no leverage-increase action, add-collateral action, or arbitrary target-leverage adjustment in V1.

---

## Contract surface

The complete V1 financial/lifecycle surface is:

```text
openPosition(...)
repay(tokenId, amount)
reduceExposure(tokenId, stockAmount, minOut)
setExecutor(tokenId, executor)
closePosition(tokenId)
liquidate(tokenId)
ERC-721 transfer
```

There is intentionally no:

- `increaseLeverage`;
- `addCollateral`;
- generic `borrowUSDC`;
- arbitrary execution call;
- partial liquidation;
- protocol liquidation fee;
- liquidator token or USDC reward;
- APR setter or rate-admin action.

A user who wants a materially different leveraged position can settle, close, and reopen. V1 does not optimize continuous portfolio adjustment.

---

## Components

V1 has four core components:

```text
MarginCall (also the ERC-721 Position NFT contract)
CreditPool
OracleAdapter
ExecutionAdapter
```

### `MarginCall`

The coordinator, custody contract, accounting layer, risk engine, and ERC-721 ownership contract.

It inherits OpenZeppelin ERC-721 directly. Position ownership is `ownerOf(tokenId)` on `MarginCall`; mint, burn, transfer, executor clearing, and financial accounting therefore remain inside one contract boundary.

Responsibilities:

- implement the Position NFT directly as ERC-721;
- custody NVDAc for all live positions;
- maintain position accounting by `tokenId`;
- open positions at one of the five allowed leverage presets;
- draw USDC from `CreditPool` only during financed opening;
- buy additional NVDAc during financed opening;
- accrue simple interest at the fixed V1 APR;
- accept external USDC repayment;
- reduce exposure by selling caller-specified NVDAc and applying proceeds to debt;
- manage one executor;
- clear the executor internally on ERC-721 ownership transfer;
- close debt-free positions;
- liquidate unhealthy financed positions;
- mint and burn its own Position NFTs.

### `CreditPool`

Simple protocol-owned USDC pool. It holds capital, lends only to `MarginCall`, receives repayments, and exposes available liquid credit.

### `OracleAdapter`

Single NVDAc Chainlink total-return pricing/state adapter.

### `ExecutionAdapter`

Single-purpose NVDAc/USDC Uniswap adapter with fixed approved tokens, fixed settlement path, and bounded execution.

There is no separate `PositionNFT` contract, ERC-4626 vault, Position Account clone, asset registry, utilization-rate module, generalized router, APR admin module, or global outstanding-principal counter in V1.

---

## Position accounting

Conceptually:

```solidity
struct Position {
    uint256 stockAmount;
    uint256 principal;
    uint256 accruedInterest;
    uint256 lastAccruedAt;
    address executor;
    PositionStatus status;
}

mapping(uint256 tokenId => Position) positions;
```

All NVDAc is physically held by `MarginCall`, but each position has isolated accounting. The same contract also owns the ERC-721 token state, so `positions[tokenId]` and `ownerOf(tokenId)` cannot drift across contracts.

Invariant:

```text
sum(stockAmount of all live positions)
<= NVDAc.balanceOf(MarginCall)
```

One position must never consume another position's recorded stock.

V1 does not maintain a per-position USDC balance. Repayment transfers only the amount actually owed, `reduceExposure` immediately sends any sale surplus to the current owner, and close returns the position's remaining NVDAc.

---

## Risk model

All solvency calculations use a `LIVE` Chainlink observation. `currentDebt()` remains time-based and readable even when pricing is `HELD` or `INVALID`.

For one position:

```text
NAV = oracle value of recorded NVDAc
currentDebt = principal + all accrued interest through now
equity = NAV - currentDebt
equityRatio = equity / NAV
healthFactor = equityRatio / maintenanceEquityRatio
```

V1 risk constants are defined in one place:

```text
Minimum opening leverage      1.0x
Maximum opening leverage      1.5x
Allowed opening presets       1.0x, 1.1x, 1.25x, 1.4x, 1.5x
Borrow APR                    10%   (immutable in V1)
Maintenance equity ratio      30%   (provisional pending simulation)
Liquidation threshold         healthFactor < 1.0
Liquidation                   full unwind
```

A financed position is liquidatable only when pricing is `LIVE` and `healthFactor < 1.0`.

Implement the predicate without unsafe unsigned subtraction or division:

- if `NAV == 0` and debt is positive, the position is liquidatable;
- if `currentDebt >= NAV`, equity is zero or negative and the position is liquidatable;
- otherwise calculate positive equity, `equityRatio`, and `healthFactor` normally.

A zero-debt `1.0x` position is not liquidatable for lender solvency.

The `1.5x` value is an **opening ceiling**, not a maintenance threshold. After opening, market moves and interest may push gross leverage above `1.5x`; liquidation occurs only when the maintenance predicate above is breached.

Transfer never consults this risk model. A liquidatable or underwater position may still transfer, and its existing liquidation eligibility follows the NFT.

The `30%` maintenance equity ratio is the V1 starting parameter and must be validated with simulation before meaningful live capital is deployed.

---

## Opening a position

### Fixed leverage presets

The contract accepts only these opening leverage values:

```text
1.0x   Spot only
1.1x   Conservative
1.25x  Balanced
1.4x   Aggressive
1.5x   Max
```

Intermediate leverage values are intentionally rejected in V1. This keeps contract validation and UI behavior aligned and removes a feature that adds no demo value.

For a fee-free example with `$100` of contributed NVDAc:

```text
Target    Principal    Gross exposure
1.0x      $0           $100
1.1x      $10          $110
1.25x     $25          $125
1.4x      $40          $140
1.5x      $50          $150
```

Execution costs must be included when sizing the actual loan so post-execution leverage does not exceed the selected preset or the hard `1.5x` ceiling.

### `openPosition`

Conceptually:

```text
openPosition(stockAmount, targetLeverage, minNvdaOut)
```

For `1.0x`, Margin Call transfers in NVDAc, records the complete position state, and mints its own ERC-721 token. No oracle, credit draw, or swap is required.

For a financed preset above `1.0x`, Margin Call atomically:

1. transfers the contributed NVDAc into custody;
2. requires a `LIVE` oracle observation;
3. values the contribution using the total-return feed;
4. validates that the target is one of the five allowed presets;
5. sizes the USDC principal conservatively for execution costs;
6. checks liquid USDC capacity in `CreditPool`;
7. draws the principal;
8. swaps USDC -> NVDAc with caller `minNvdaOut` plus protocol execution bounds;
9. records the resulting NVDAc and principal;
10. verifies post-execution leverage is no greater than the selected preset / `1.5x` ceiling;
11. records complete position state, then mints the Position NFT from `MarginCall` itself.

Any safe-mint receiver callback occurs only after the position state is fully initialized.

Failure of the preset check, oracle check, credit-capacity check, swap, or post-execution leverage check reverts the entire financed opening.

There is no later `increaseLeverage`. Opening is the only action that creates principal.

---

## Borrow interest

V1 borrow APR is **fixed at 10% and immutable**.

Implement it as a compile-time protocol constant (for example `BORROW_APR = 10%`), not constructor-configurable governance state. There is no `setBorrowApr`, no APR cap, no rate-admin role, and no requirement to track aggregate outstanding principal for rate changes.

Interest is:

- USDC-denominated;
- simple, not compounding;
- charged only while principal is outstanding;
- accrued lazily from timestamps;
- attached to the position when the NFT transfers.

Per-position debt state:

```text
principal
accruedInterest
lastAccruedAt
```

Conceptually:

```text
unaccruedInterest =
    principal
    * 10%
    * (now - lastAccruedAt)
    / 365 days

currentDebt = principal + accruedInterest + unaccruedInterest
```

Ordinary repayment applies USDC:

```text
1. accrued interest
2. principal
```

Changing borrow-rate policy is explicitly deferred beyond V1.

---

## Credit capacity

V1 uses finite protocol-owned USDC.

```text
availableCredit = USDC.balanceOf(CreditPool)
```

There is no reserve requirement because there are no public LP withdrawals.

Financed openings are first-come, first-served. If the requested opening requires more USDC than remains in the pool, it reverts. A `1.0x` position can still open with zero available credit.

Repayment, reduction, close, and liquidation restore only the USDC actually returned to the pool. Written-off principal does not create available credit.

---

## Repayment

### `repay`

```text
repay(tokenId, amount)
```

`repay` is oracle-free.

Margin Call first accrues interest and calculates `debtBefore = currentDebt(tokenId)`. The actual payment is capped at the debt:

```text
payAmount = min(amount, debtBefore)
```

Only `payAmount` is transferred from the caller. If `amount > debtBefore`, the excess never leaves the caller; there is no refund transaction and no residual USDC credited to the position.

Apply `payAmount` to accrued interest first and principal second, then return that USDC to `CreditPool`. `DebtRepaid` records the actual amount applied, not the caller's larger requested cap.

The owner or executor may repay. Payment cannot be redirected to either caller.

Once current debt is zero, the position is unfinanced and may be closed immediately.

---

## Reduce exposure

V1 keeps one deliberately small deleveraging primitive instead of target-leverage adjustment.

```text
reduceExposure(tokenId, stockAmount, minOut)
```

The owner or executor specifies the exact amount of the position's NVDAc to sell.

Margin Call:

1. accrues interest;
2. checks owner/executor authorization;
3. requires a `LIVE` oracle observation so lender-protective execution bounds can be enforced;
4. verifies `stockAmount` does not exceed this position's recorded stock;
5. sells exactly `stockAmount` NVDAc -> USDC;
6. enforces caller `minOut` and the protocol's oracle-derived slippage floor;
7. applies realized USDC to accrued interest first and principal second;
8. returns the debt repayment to `CreditPool`;
9. if realized USDC exceeds current debt, immediately sends the excess to the current NFT owner;
10. reduces the position's recorded NVDAc by the exact amount sold.

`reduceExposure` does not accept a target leverage and never borrows additional USDC.

If pricing is not `LIVE`, the user can still repay externally. After debt reaches zero, `closePosition` remains available without an oracle.

---

## Executor

The owner may appoint one executor:

```text
setExecutor(tokenId, executor)
```

The executor may only:

- `repay`;
- `reduceExposure`.

The executor may not:

- transfer the NFT;
- close the position;
- appoint another executor;
- withdraw owner assets to itself;
- create new principal;
- route execution elsewhere.

When the Position NFT transfers, `MarginCall` clears the old executor internally as part of its ERC-721 ownership update before any safe-transfer recipient callback can manage the position.

ERC-721 approvals and executor permissions are separate authorization systems.

---

## Transfer semantics — no financial gate

A live Position NFT transfers through standard ERC-721 rules implemented directly by `MarginCall`.

There is **no financial transfer gate in V1**.

Transfer must not:

- call the oracle;
- require fresh pricing;
- require positive equity;
- require a maintenance-health threshold;
- require leverage below any value;
- repay debt;
- reset interest;
- pause because the position is liquidatable or underwater;
- honor a protocol-admin financial transfer pause.

The transfer path may enforce only normal ERC-721 authorization, token existence, recipient rules, and executor clearing.

Implementation requirement: `MarginCall` inherits OpenZeppelin ERC-721 and overrides the internal ownership update hook (for OZ v5, `_update`) only as needed to clear `positions[tokenId].executor` on a real ownership transfer. Executor clearing must complete inside `MarginCall` before any `safeTransferFrom` receiver callback. Mint and burn are also internal ERC-721 operations in `MarginCall`; no cross-contract ownership synchronization exists.

The position's existing stock, debt, interest, and liquidation eligibility follow the NFT unchanged to the new owner. Transfer creates no grace period.

Position pages must disclose debt and the current oracle state, but disclosure is an app/metadata responsibility, not a transfer condition.

V1 proves transferability. Purchase settlement is deferred.

---

## Oracle policy

Chainlink determines solvency. Uniswap spot price is never a solvency oracle.

`OracleAdapter` classifies the NVDAc observation as:

```text
LIVE
HELD
INVALID
```

### `LIVE`

A `LIVE` observation requires a complete positive round, valid timestamp, no Coinbase corporate-action pause, a supported update window, a round within the configured live-age bound, and a new qualifying round after any prior held period.

### `HELD`

`HELD` means the latest mark is intentionally frozen because of a known scheduled market hold or corporate action. It may be displayed with timestamp/reason but is never a current solvency mark.

### `INVALID`

`INVALID` means the adapter cannot prove either a valid live observation or a legitimate held state. The adapter fails closed.

### V1 action matrix

| Action | `LIVE` | `HELD` | `INVALID` |
| --- | --- | --- | --- |
| Open `1.0x` | Yes | Yes | Yes |
| Open financed | Yes | No | No |
| Repay external USDC | Yes | Yes | Yes |
| Reduce exposure | Yes | No | No |
| Set/clear executor | Yes | Yes | Yes |
| Transfer NFT | Yes | Yes | Yes |
| Close debt-free position | Yes | Yes | Yes |
| Liquidate | Yes | No | No |
| Read current debt | Yes | Yes | Yes |
| Read current NAV / health | Current | Unavailable; held mark may be shown separately | Unavailable |

Interest continues accruing while pricing is held or invalid.

**Accepted V1 hold constraint:** a financed position with debt outstanding cannot `reduceExposure` or close while pricing is `HELD` or `INVALID`. If the owner has no external USDC to repay the debt, they must wait for a qualifying `LIVE` observation before they can deleverage and close. Standard ERC-721 transfer remains available during the hold. V1 intentionally does not use a stale/frozen mark to manufacture an unwind path.

---

## NVDAc valuation rule

The Coinbase NVDA Chainlink feed publishes the B20 total-return value: underlying equity price multiplied by the B20 multiplier.

Margin Call values **raw NVDAc units directly against that total-return price** and must never apply the B20 multiplier separately.

Conceptually:

```text
valueUsdcBase =
    stockAmountRaw
    * priceRaw
    * 10^usdcDecimals
    / 10^stockDecimals
    / 10^feedDecimals
```

Use one overflow-safe normalization helper everywhere valuation is required.

Do not multiply `scaledBalanceOf`, `toScaledBalance`, or `multiplier()` into the total-return price. Doing so double counts the multiplier.

---

## Close

### `closePosition`

V1 makes close intentionally simple:

```text
closePosition(tokenId)
```

Only the NFT owner may close.

Requirement:

```text
currentDebt(tokenId) == 0
```

If debt remains, the owner must first either:

- call `repay` with external USDC; or
- use `reduceExposure` while pricing is `LIVE` until debt is zero.

Once debt is zero, close is oracle-free:

1. return all remaining recorded NVDAc to the current NFT owner;
2. mark the position closed;
3. burn the ERC-721 token internally in `MarginCall`.

There is no position-attributed residual USDC to return: `repay` never takes an overpayment and `reduceExposure` sends sale surplus to the owner immediately.

This deliberately removes debt-covering swap logic from the close function.

---

## Liquidation

Liquidation is permissionless but **pays no liquidator reward in V1**.

The protocol operates a first-party keeper to ensure eligible liquidations are actually submitted.

```text
liquidate(tokenId)
```

Liquidation requires `LIVE` pricing and a financed position with `healthFactor < 1.0` under the Risk Model above.

V1 performs a full unwind:

1. accrue interest and snapshot current owner/current debt;
2. validate liquidation eligibility using the live Chainlink mark and the Risk Model predicate;
3. sell this position's entire recorded NVDAc -> USDC through the approved bounded execution path;
4. settle the liquidation proceeds;
5. finalize the position and burn the ERC-721 token internally in `MarginCall`.

There is no protocol liquidation fee, no liquidator payout, and no global outstanding-principal counter to decrement.

### Sufficient proceeds

If gross USDC proceeds cover current debt:

```text
send currentDebt to CreditPool
send all remaining USDC to current NFT owner
```

The position is then finalized and burned.

### Shortfall liquidation

If proceeds are less than current debt, send all realized USDC to `CreditPool` and finalize anyway.

```text
shortfall = currentDebt - actualGrossUsdcProceeds
```

Emit the shortfall as the complete bad-debt record:

```solidity
event BadDebtRealized(
    uint256 indexed tokenId,
    uint256 shortfall
);
```

The treasury absorbs the shortfall. There is no claim on the current owner, any prior owner, or another position, and no aggregate principal state needs to be repaired or decremented during finalization.

A successful shortfall liquidation still finalizes and burns the NFT. Failed oracle, token-transfer, or bounded-swap execution reverts atomically and leaves the position active.

---

## Events

Emit only lifecycle/accounting events needed by the simplified surface:

- `PositionOpened`
- `CreditDrawn`
- `InterestAccrued`
- `DebtRepaid`
- `ExposureReduced`
- `ExecutorUpdated`
- ERC-721 `Transfer`
- `PositionClosed`
- `PositionLiquidated`
- `BadDebtRealized(tokenId, shortfall)`

There is no `ExposureIncreased`, `CollateralAdded`, or `BorrowAprUpdated` event because those actions do not exist in V1.

---

## Required acceptance flow

The live demo must prove the actual product, not merely open/display/close.

The demo is intentionally scheduled for a `LIVE` oracle window because the executor step must exercise `reduceExposure`. Before beginning the financed opening, confirm the adapter is `LIVE` and that the expected feed window is long enough to reach step 4. If the feed becomes `HELD` or `INVALID` before that step, do not use a stale mark or weaken the rule; wait for a qualifying `LIVE` observation and resume the demo.

Required sequence:

1. **A opens a financed NVDAc position during a `LIVE` window.** Confirm contributed NVDAc, borrowed USDC, purchased NVDAc, principal, and ERC-721 ownership on `MarginCall`.
2. **Interest accrues.** Wait or advance time and prove `currentDebt > principal` without a keeper transaction.
3. **A appoints executor E.**
4. **E reduces exposure during `LIVE` pricing.** E performs a small `reduceExposure`, proving delegated management and the bounded NVDAc -> USDC path.
5. **A transfers the Position NFT to B.** No oracle/health gate may block the transfer. Stock and debt remain in place; `MarginCall` clears the executor internally during the ERC-721 ownership update.
6. **A and E lose authority.** Calls by A or E to `repay`, `reduceExposure`, `setExecutor`, or `closePosition` must revert where authorization is required. Standard ERC-721 ownership/approval behavior applies separately.
7. **B manages the inherited position.** B may appoint a new executor, repay, or reduce exposure.
8. **B settles the debt to zero.** For the simplest live path, B repays the remaining debt with external USDC.
9. **B closes.** All remaining recorded NVDAc goes to B and `MarginCall` burns the NFT.
10. Record transaction receipts and before/after accounting for A, E, B, the position, and `CreditPool`.

If the demo later crosses a held market period, the UI must visibly report `HELD`. Transfer, repayment, executor updates, and debt-free close remain available; financed opening, reduction, and liquidation do not.

A purchase payment is not part of this V1 acceptance test. Do not claim that the demo creates a functioning secondary market.

---

## Local Foundry acceptance

At minimum, tests must cover:

- `MarginCall` directly implementing ERC-721 ownership, approvals, mint, transfer, and burn with no separate `PositionNFT` deployment;
- exactly the five opening leverage presets, including rejection of intermediate values;
- cost-aware post-swap leverage checks for each financed preset;
- finite CreditPool capacity and zero-credit `1.0x` opening;
- lazy simple interest at the immutable 10% APR and interest-first ordinary repayment;
- absence of any APR setter/rate-admin path or global outstanding-principal counter;
- `repay(tokenId, amount)` with `amount > currentDebt`, proving only current debt is transferred and no residual/refund balance is created;
- exact Risk Model math for NAV, current debt, equity, equity ratio, and health factor using the 30% maintenance ratio;
- liquidation at `healthFactor < 1.0`, non-liquidation at/above the threshold, and safe handling of zero NAV / zero or negative equity;
- leverage drift above `1.5x` without liquidation until the maintenance threshold is breached;
- no `increaseLeverage` or `addCollateral` path;
- `reduceExposure(tokenId, stockAmount, minOut)` exact-input accounting and bounds;
- executor permissions limited to repayment/reduction;
- executor clearing inside the ERC-721 ownership update before a safe-transfer receiver callback can act;
- transfers of healthy, liquidatable, underwater, `HELD`, `INVALID`, and reverting-oracle positions without any oracle call;
- `HELD`/`INVALID` financed-position behavior: `reduceExposure` is unavailable, debt-free close still requires zero debt, external `repay` remains available, and transfer remains available;
- debt-free close only, including close after external repayment;
- close returning remaining NVDAc only, with no position-attributed residual USDC path;
- full liquidation with no reward/fee;
- shortfall finalization by returning all realized proceeds to `CreditPool`, emitting `BadDebtRealized(tokenId, shortfall)`, and burning the NFT;
- oracle `LIVE` / `HELD` / `INVALID` schedule behavior;
- post-hold requirement for a new qualifying round;
- raw NVDAc units × total-return price with no second multiplier application;
- shared-custody isolation between multiple positions;
- atomic rollback on swap/token/oracle failures.

---

## Human and agent UI

### Open

Show the five fixed leverage presets only:

```text
1.0x
1.1x
1.25x
1.4x
1.5x
```

Also show:

```text
NVDAc deposit
Oracle state
Available credit
Borrow APR (fixed 10%)
Estimated principal
Estimated gross exposure
Estimated health
```

When a financed preset above `1.0x` is selected, disclose the V1 hold constraint: reducing exposure requires `LIVE` pricing, so during `HELD`/`INVALID` pricing an owner without external USDC cannot repay from the position itself and therefore cannot close until a qualifying live observation returns. NFT transfer remains available.

### Position page

Show:

- owner;
- executor;
- NVDAc amount/value when pricing is live;
- oracle state and timestamp;
- principal;
- accrued interest;
- current debt;
- fixed 10% APR;
- equity/leverage/health when live;
- repay;
- reduce exposure;
- set executor;
- transfer;
- close when debt is zero;
- lifecycle history and share link.

For repayment, the UI may allow a large user-entered cap or a "Repay all" action, but must communicate that the contract transfers at most `currentDebt`.

There is no increase-leverage, add-collateral, or APR-admin control.

### Agent surface

Expose only:

```text
get_credit_pool
get_position
get_health
open_position
repay
reduce_exposure
set_executor
close_position
liquidate
```

`open_position` accepts only the five supported leverage presets. NFT transfer uses the standard wallet/ERC-721 interface exposed by `MarginCall` itself.

---

## NFT/social layer

The living NFT is a presentation layer only.

For V1, use pre-created NVDAc character states such as neutral, up, down, warning, critical, liquidated, and retired/closed. Financial state remains authoritative in the contracts.

When the oracle is held/invalid, preserve the last known visual state and label pricing unavailable rather than implying current health.

---

## Security principles

- `MarginCall` is the sole ERC-721 Position NFT contract; there is no cross-contract ownership/accounting synchronization.
- Borrowed USDC is never freely withdrawable.
- Opening is the only action that creates new principal.
- Opening accepts only the five fixed leverage presets.
- Borrowed USDC can only buy NVDAc.
- No position may consume another position's recorded NVDAc.
- Borrow APR is an immutable V1 constant at 10%; there is no rate setter or APR admin surface.
- `repay` transfers at most current debt; an over-sized requested amount never becomes position USDC.
- Financed opening and liquidation require `LIVE` solvency pricing.
- `repay`, transfer, executor updates, and debt-free close are oracle-independent.
- `reduceExposure` requires `LIVE` pricing plus caller and protocol execution bounds.
- During `HELD`/`INVALID`, a financed position with outstanding debt cannot be unwound through `reduceExposure` or close; without external USDC the owner must wait for `LIVE` pricing, though NFT transfer remains available.
- Chainlink determines solvency; Uniswap is execution only.
- Raw NVDAc units are valued directly against the total-return feed; the B20 multiplier is never applied twice.
- Maintenance is a 30% equity ratio in V1, so liquidation eligibility is `healthFactor < 1.0` using the explicit Risk Model; zero/negative-equity edge cases must not underflow or divide by zero.
- The `1.5x` leverage limit applies to opening, not to later market/interest drift.
- Active NFT transfer is independent of price, health, leverage, or liquidation eligibility.
- `MarginCall` clears the old executor inside the ERC-721 ownership update before safe-transfer recipient callbacks.
- Executor permissions never create principal or withdraw assets to the executor.
- Close requires zero debt and returns remaining recorded NVDAc.
- Liquidation is full, permissionless, and unrewarded in V1.
- Liquidation shortfalls are treasury losses recorded by `BadDebtRealized`; no aggregate principal counter participates in finalization.

---

## Live Base feasibility gate

Before real funds are used, verify and pin:

- NVDAc address/decimals and native B20 transfer semantics;
- Coinbase NVDA Chainlink proxy and feed decimals;
- Coinbase oracle-registry pause semantics;
- supported live/held schedule and freshness policy;
- post-hold new-round behavior;
- raw-unit total-return normalization;
- executable USDC -> NVDAc route for financed opening;
- executable NVDAc -> USDC route for reduction/liquidation;
- practical slippage bounds at demo size;
- the actual `LIVE` feed window in which the required live acceptance flow will be run;
- simulation evidence supporting or revising the provisional 30% maintenance equity ratio before meaningful live capital.

Mocks must reflect the verified semantics.

---

## Deferred until after the hackathon

- `increaseLeverage` / post-open re-levering;
- add collateral;
- arbitrary/intermediate opening leverage values beyond the five presets;
- target-leverage adjustment;
- purchase/payment settlement for NFT sales;
- first-party marketplace;
- ERC-4626 / public LP shares;
- LP withdrawals and reserve management;
- configurable or utilization-based variable APR;
- reserve factor / LP revenue split;
- global borrow index;
- per-position smart accounts / ERC-6551;
- multi-stock asset registry;
- per-stock risk/APR parameters;
- partial liquidation;
- liquidator incentives;
- protocol liquidation fee;
- complex executor policy engine;
- generalized routing;
- production governance/timelocks.

---

## Final V1 thesis

> **Deposit NVDAc, choose one of five opening leverage presets, finance more NVDAc with finite protocol USDC at a fixed 10% APR, and receive a transferable NFT minted directly by Margin Call representing the live stock-plus-debt position. Repay or reduce exposure, transfer the position without an oracle/health gate, and let the new owner settle and close it.**