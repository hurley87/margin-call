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

When the NFT transfers, the underlying stock and debt do not move or reset. Control of the existing position simply follows `ownerOf(tokenId)`.

V1 demonstrates **transferable financed positions**, not a functioning secondary market. Purchase settlement, bidding, listings, and marketplace guarantees are deferred.

---

## V1 scope

- Base only.
- Long only.
- NVDAc only.
- One stock per position.
- Margin Call directly custodies position NVDAc.
- Opening leverage from `1.0x` through `1.5x`.
- `1.0x` is spot-only and draws no credit.
- Above `1.0x`, borrowed USDC can only buy more NVDAc.
- Borrowed USDC is never freely withdrawable.
- Protocol-owned USDC `CreditPool`; no public LP vault.
- Simple borrow interest, initially `10% APR`.
- Chainlink total-return pricing for solvency.
- Uniswap for NVDAc/USDC execution.
- Full liquidation only.
- No liquidator reward.
- Standard ERC-721 transfer semantics with **no financial transfer gate**.
- One optional executor per position.

The post-open management surface is deliberately minimal. There is no leverage-increase action and no add-collateral action in V1.

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
- liquidator token or USDC reward.

A user who wants a different leveraged position can close and reopen. V1 does not optimize ongoing portfolio adjustment.

---

## Components

V1 has five core components:

```text
MarginCall
PositionNFT
CreditPool
OracleAdapter
ExecutionAdapter
```

### `MarginCall`

The coordinator, custody contract, accounting layer, and risk engine.

Responsibilities:

- custody NVDAc for all live positions;
- maintain position accounting by `tokenId`;
- open positions at `1.0x-1.5x`;
- draw USDC from `CreditPool` only during financed opening;
- buy additional NVDAc during financed opening;
- accrue simple interest;
- accept external USDC repayment;
- reduce exposure by selling caller-specified NVDAc and applying proceeds to debt;
- manage one executor;
- clear the executor on NFT transfer;
- close debt-free positions;
- liquidate unhealthy financed positions;
- coordinate NFT mint/burn.

### `PositionNFT`

OpenZeppelin ERC-721 representing ownership of each live position.

### `CreditPool`

Simple protocol-owned USDC pool. It holds capital, lends only to `MarginCall`, receives repayments, and exposes available liquid credit.

### `OracleAdapter`

Single NVDAc Chainlink total-return pricing/state adapter.

### `ExecutionAdapter`

Single-purpose NVDAc/USDC Uniswap adapter with fixed approved tokens, fixed settlement path, and bounded execution.

There is no ERC-4626 vault, Position Account clone, asset registry, utilization-rate module, or generalized router in V1.

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

All NVDAc is physically held by `MarginCall`, but each position has isolated accounting.

Invariant:

```text
sum(stockAmount of all live positions)
<= NVDAc.balanceOf(MarginCall)
```

One position must never consume another position's recorded stock.

---

## Opening a position

### Leverage choices

The user chooses leverage only when opening:

```text
1.0x   Spot only
1.1x   Conservative
1.25x  Balanced
1.4x   Aggressive
1.5x   Max
```

The contract may accept intermediate values from `1.0x` through `1.5x`.

For a fee-free example with `$100` of contributed NVDAc:

```text
Target    Principal    Gross exposure
1.0x      $0           $100
1.1x      $10          $110
1.25x     $25          $125
1.4x      $40          $140
1.5x      $50          $150
```

Execution costs must be included when sizing the actual loan so post-execution leverage does not exceed the selected target or the hard `1.5x` ceiling.

### `openPosition`

Conceptually:

```text
openPosition(stockAmount, targetLeverage, minNvdaOut)
```

For `1.0x`, Margin Call transfers in NVDAc, records the position, and mints the NFT. No oracle, credit draw, or swap is required.

For financed opening above `1.0x`, Margin Call atomically:

1. transfers the contributed NVDAc into custody;
2. requires a `LIVE` oracle observation;
3. values the contribution using the total-return feed;
4. validates the requested target from `1.0x-1.5x`;
5. sizes the USDC principal conservatively for execution costs;
6. checks liquid USDC capacity in `CreditPool`;
7. draws the principal;
8. swaps USDC -> NVDAc with caller `minNvdaOut` plus protocol execution bounds;
9. records the resulting NVDAc and principal;
10. verifies post-execution leverage is no greater than the requested target / `1.5x` ceiling;
11. mints the Position NFT.

Failure of the oracle check, credit-capacity check, swap, or post-execution leverage check reverts the entire financed opening.

There is no later `increaseLeverage`. Opening is the only action that creates principal.

---

## Borrow interest

Initial V1 APR: **10%**.

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
    * borrowApr
    * (now - lastAccruedAt)
    / 365 days

currentDebt = principal + accruedInterest + unaccruedInterest
```

Ordinary repayment applies USDC:

```text
1. accrued interest
2. principal
```

APR may be changed by the protocol owner only when global `outstandingPrincipal == 0`. V1 caps configured APR at `50%`.

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

The caller supplies USDC. Margin Call accrues interest, applies payment to interest first and principal second, and returns the repaid USDC to `CreditPool`.

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
8. returns repaid USDC to `CreditPool`;
9. if realized USDC exceeds current debt, sends only the surplus to the current NFT owner;
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

When the Position NFT transfers, the old executor is cleared before any recipient callback can manage the position.

ERC-721 approvals and executor permissions are separate authorization systems.

---

## Transfer semantics — no financial gate

A live Position NFT transfers through standard ERC-721 rules.

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

1. return all remaining recorded NVDAc and any residual USDC to the current NFT owner;
2. mark the position closed;
3. burn the NFT.

This deliberately removes debt-covering swap logic from the close function.

---

## Liquidation

Liquidation is permissionless but **pays no liquidator reward in V1**.

The protocol operates a first-party keeper to ensure eligible liquidations are actually submitted.

```text
liquidate(tokenId)
```

Liquidation requires `LIVE` pricing and a financed position below maintenance.

V1 performs a full unwind:

1. accrue interest and snapshot current owner/debt;
2. validate liquidation eligibility using the live Chainlink mark;
3. sell this position's entire recorded NVDAc -> USDC through the approved bounded execution path;
4. apply realized proceeds to settlement;
5. remove the position's entire remaining principal from global `outstandingPrincipal` exactly once;
6. finalize the position and burn the NFT.

There is no protocol liquidation fee and no liquidator payout.

### Sufficient proceeds

If gross USDC proceeds cover current debt:

```text
repay accrued interest
repay principal
send all remaining USDC to current NFT owner
```

### Shortfall liquidation

If proceeds are less than current debt, all proceeds go to `CreditPool`, applied principal first and then interest for loss accounting.

```text
P = remaining principal
I = accrued interest
S = actual gross USDC proceeds

principalRecovered = min(S, P)
interestRecovered = min(max(S - P, 0), I)
principalLoss = P - principalRecovered
unpaidInterest = I - interestRecovered
shortfall = principalLoss + unpaidInterest
```

The treasury absorbs the loss. There is no claim on the current owner, any prior owner, or another position.

Emit:

```solidity
event BadDebtRealized(
    uint256 indexed tokenId,
    uint256 principalLoss,
    uint256 unpaidInterest,
    uint256 shortfall
);
```

A successful shortfall liquidation still finalizes and burns the NFT. Failed oracle, token-transfer, or bounded-swap execution reverts atomically and leaves the position active.

---

## Events

Emit only lifecycle/accounting events needed by the simplified surface:

- `PositionOpened`
- `CreditDrawn`
- `InterestAccrued`
- `BorrowAprUpdated`
- `DebtRepaid`
- `ExposureReduced`
- `ExecutorUpdated`
- ERC-721 `Transfer`
- `PositionClosed`
- `PositionLiquidated`
- `BadDebtRealized(tokenId, principalLoss, unpaidInterest, shortfall)`

There is no `ExposureIncreased` or `CollateralAdded` event because those actions do not exist in V1.

---

## Required acceptance flow

The live demo must prove the actual product, not merely open/display/close.

Required sequence:

1. **A opens a financed NVDAc position.** Confirm contributed NVDAc, borrowed USDC, purchased NVDAc, principal, and NFT ownership.
2. **Interest accrues.** Wait or advance time and prove `currentDebt > principal` without a keeper transaction.
3. **A appoints executor E.**
4. **E acts.** E successfully performs a permitted management action, preferably a small `reduceExposure`, proving delegated control works.
5. **A transfers the Position NFT to B.** No oracle/health gate may block the transfer. Stock and debt remain in place; the executor is cleared.
6. **A and E lose authority.** Calls by A or E to `repay`, `reduceExposure`, `setExecutor`, or `closePosition` must revert where authorization is required. Standard ERC-721 ownership/approval behavior applies separately.
7. **B manages the inherited position.** B may appoint a new executor, repay, or reduce exposure.
8. **B settles the debt to zero.** For the simplest live path, B repays the remaining debt with external USDC.
9. **B closes.** All remaining NVDAc/residual USDC goes to B and the NFT burns.
10. Record transaction receipts and before/after accounting for A, E, B, the position, and `CreditPool`.

If the demo crosses a held market period, the UI must visibly report `HELD`. Transfer, repayment, executor updates, and debt-free close remain available; financed opening, reduction, and liquidation do not.

A purchase payment is not part of this V1 acceptance test. Do not claim that the demo creates a functioning secondary market.

---

## Local Foundry acceptance

At minimum, tests must cover:

- opening `1.0x` through `1.5x`, including cost-aware post-swap leverage checks;
- finite CreditPool capacity and zero-credit `1.0x` opening;
- lazy simple interest and interest-first ordinary repayment;
- no `increaseLeverage` or `addCollateral` path;
- `reduceExposure(tokenId, stockAmount, minOut)` exact-input accounting and bounds;
- executor permissions limited to repayment/reduction;
- executor clearing on transfer;
- transfers of healthy, liquidatable, underwater, `HELD`, `INVALID`, and reverting-oracle positions without any oracle call;
- debt-free close only, including close after external repayment;
- full liquidation with no reward/fee;
- shortfall finalization and split `BadDebtRealized` accounting;
- oracle `LIVE` / `HELD` / `INVALID` schedule behavior;
- post-hold requirement for a new qualifying round;
- raw NVDAc units × total-return price with no second multiplier application;
- shared-custody isolation between multiple positions;
- atomic rollback on swap/token/oracle failures.

---

## Human and agent UI

### Open

Show:

```text
NVDAc deposit
Oracle state
Leverage choice
Available credit
Borrow APR
Estimated principal
Estimated gross exposure
Estimated health
```

### Position page

Show:

- owner;
- executor;
- NVDAc amount/value when pricing is live;
- oracle state and timestamp;
- principal;
- accrued interest;
- current debt;
- APR;
- equity/leverage/health when live;
- repay;
- reduce exposure;
- set executor;
- transfer;
- close when debt is zero;
- lifecycle history and share link.

There is no increase-leverage or add-collateral control.

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

NFT transfer uses the standard wallet/ERC-721 interface.

---

## NFT/social layer

The living NFT is a presentation layer only.

For V1, use pre-created NVDAc character states such as neutral, up, down, warning, critical, liquidated, and retired/closed. Financial state remains authoritative in the contracts.

When the oracle is held/invalid, preserve the last known visual state and label pricing unavailable rather than implying current health.

---

## Security principles

- Borrowed USDC is never freely withdrawable.
- Opening is the only action that creates new principal.
- Borrowed USDC can only buy NVDAc.
- No position may consume another position's recorded NVDAc.
- Financed opening and liquidation require `LIVE` solvency pricing.
- `repay`, transfer, executor updates, and debt-free close are oracle-independent.
- `reduceExposure` requires `LIVE` pricing plus caller and protocol execution bounds.
- Chainlink determines solvency; Uniswap is execution only.
- Raw NVDAc units are valued directly against the total-return feed; the B20 multiplier is never applied twice.
- Active NFT transfer is independent of price, health, leverage, or liquidation eligibility.
- Transfer clears the old executor before recipient callbacks.
- Executor permissions never create principal or withdraw assets to the executor.
- Close requires zero debt.
- Liquidation is full, permissionless, and unrewarded in V1.
- Shortfall losses are isolated to the protocol treasury and finalized exactly once.

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
- practical slippage bounds at demo size.

Mocks must reflect the verified semantics.

---

## Deferred until after the hackathon

- `increaseLeverage` / post-open re-levering;
- add collateral;
- target-leverage adjustment;
- purchase/payment settlement for NFT sales;
- first-party marketplace;
- ERC-4626 / public LP shares;
- LP withdrawals and reserve management;
- utilization-based variable APR;
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

> **Deposit NVDAc, choose leverage once, finance more NVDAc with finite protocol USDC, and receive a transferable NFT representing the live stock-plus-debt position. Repay or reduce exposure, transfer the position without an oracle/health gate, and let the new owner settle and close it.**
