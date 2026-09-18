# Margin Call — Transferable Financed Spot Positions PRD

## Status and authority

This is the V1 behavior spec for Margin Call. It supersedes the earlier Stock Gacha and generalized inventory-protocol directions.

The contract layer described here is **deployed and live-accepted on Base**. Canonical addresses and compact live-acceptance evidence live at [`contracts/deployments/base.json`](../contracts/deployments/base.json). The deploy / acceptance runbook is [`contracts/script/BASE_LAUNCH.md`](../contracts/script/BASE_LAUNCH.md). The 2026-09-17 NVDA-only Base deployment (issue #429) is a frozen legacy milestone at [`contracts/deployments/base-nvda-only.legacy.json`](../contracts/deployments/base-nvda-only.legacy.json); do not point the product frontend at those addresses.

This document remains the authoritative V1 behavior spec for risk, oracle, execution, custody, and transfer semantics. Exact V1 pins (10% APR, 30% maintenance, five opening presets, no financial transfer gate, no liquidator reward) are unchanged.

The application layer is separate. Today's site is a **minimal Base Position workspace** (connect → open → repay → close) wired to the canonical launch contracts — not the production frontend. Human UI, agent surface, living NFT presentation, indexing, and keeper automation remain **planned application direction** except where this document explicitly marks them otherwise.

The original V1 demo asset was NVDAc. The live launch registry now includes NVDAc + AAPLc + METAc + GOOGLc; per-stock oracle and execution adapters reuse these V1 semantics. This document does **not** rewrite the full technical surface as a multi-stock architecture — later architecture docs may supersede or extend it explicitly.

---

## Product statement

> **Margin Call finances real tokenized-stock spot exposure and makes the financed position transferable.**

Perpetuals already provide leveraged synthetic exposure. Margin Call instead finances ownership of the actual onchain stock token.

The original V1 demo and much of this document's concrete examples use **NVDAc**. The live Base launch registry now includes **NVDAc + AAPLc + METAc + GOOGLc**; each Position permanently records one `assetId`, and per-stock adapters reuse the same V1 risk, oracle, execution, and custody semantics.

A live Position NFT represents:

- recorded stock of one supported asset held by Margin Call;
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
- One stock per position (original V1 demo: NVDAc; live launch rails: NVDAc + AAPLc + METAc + GOOGLc).
- Margin Call directly custodies the position's recorded stock.
- `MarginCall` itself is the ERC-721 Position NFT contract; there is no separate `PositionNFT` contract.
- Opening leverage uses one of five fixed presets: `1.0x`, `1.1x`, `1.25x`, `1.4x`, or `1.5x`.
- `1.0x` is spot-only and draws no credit.
- Above `1.0x`, borrowed USDC can only buy more of that position's same stock.
- Borrowed USDC is never freely withdrawable.
- Protocol-owned USDC `CreditPool`; no public LP vault.
- Simple borrow interest at an immutable `10% APR`.
- Chainlink total-return pricing for solvency.
- Uniswap V3 for stock/USDC execution.
- Full liquidation only.
- No liquidator reward.
- Standard ERC-721 transfer semantics with **no financial transfer gate**.
- One optional executor per position.

The post-open management surface is deliberately minimal. There is no leverage-increase action, add-collateral action, arbitrary target-leverage adjustment, or explicit position-status state machine in V1.

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

Simple protocol-owned USDC pool. It holds capital, lends only to `MarginCall`, receives repayments, and exposes available liquid credit. The immutable treasury may withdraw idle `availableCredit` without touching borrowed capital or Position NFT state.

### `OracleAdapter`

Single NVDAc Chainlink total-return pricing/state adapter.

### `ExecutionAdapter`

Single-purpose NVDAc/USDC Uniswap adapter with fixed approved tokens, fixed settlement path, and bounded execution.

The verified Base V1 path is:

```text
Base USDC              0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NVDAc                  0xb20000000000000000000078ee7ce2fE4908108C
Uniswap V3 factory     0x33128a8fC17869897dcE68Ed026d694621f6FDfD
SwapRouter02           0x2626664c2603336E57B271c5C0b26F421741e481
QuoterV2               0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
Direct USDC/NVDAc pool 0x60661b315553EB81872deEA9a66d567Cf0CCd33B
Fee tier               3000
```

V1 enforces a maximum **100 bps (1.00%) total adverse oracle-relative
execution deviation** for the verified `$10–$250` demo range. That total
comprises venue fee, AMM price impact, and pool/oracle basis; it must not be
described entirely as “slippage.” Production execution uses:

```text
effectiveMinOut = max(callerMinOut, protocolOracleMinOut)
```

Derive `protocolOracleMinOut` from the current `LIVE` oracle mark and the 100 bps
adverse bound. Round conservatively so integer truncation cannot allow accepted
output to exceed the configured adverse deviation.

The 100 bps value is a V1 hackathon/demo parameter based on executable and
historical fork evidence, not a permanent production risk parameter. It must be
recalibrated before materially larger capital or trades. Aerodrome benchmarked
better at the pinned snapshot, but it is comparison evidence only and is not a
V1 production route. Do not add generalized DEX routing.

There is no separate `PositionNFT` contract, ERC-4626 vault, Position Account clone, asset registry, utilization-rate module, generalized router, APR admin module, global outstanding-principal counter, or `PositionStatus` enum in V1.

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
}

mapping(uint256 tokenId => Position) positions;
```

All NVDAc is physically held by `MarginCall`, but each position has isolated accounting. The same contract also owns the ERC-721 token state, so `positions[tokenId]` and `ownerOf(tokenId)` cannot drift across contracts.

There is no separate lifecycle-status field. In V1, ERC-721 token existence is the authoritative active/inactive status: an existing token is an active position; close or liquidation deletes the live position accounting and burns the token. `PositionClosed` and `PositionLiquidated` events distinguish terminal history offchain.

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
Maintenance equity ratio      30%
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

The `30%` maintenance equity ratio is the verified V1 constant. It means
liquidation begins when `equity / NAV < 0.30`, equivalently when
`currentDebt / NAV > 0.70`. It is a maintenance threshold, not a 30% opening
margin requirement and not 30% LTV.

---

## Opening a position

### Fixed leverage presets

The contract accepts only these opening leverage values:

| Preset  | Label        | Minimum opening health factor |
| ------- | ------------ | ----------------------------- |
| `1.0x`  | Spot only    | N/A — no debt                 |
| `1.1x`  | Conservative | `>= 3.03`                     |
| `1.25x` | Balanced     | `>= 2.67`                     |
| `1.4x`  | Aggressive   | `>= 2.38`                     |
| `1.5x`  | Max          | `>= 2.22`                     |

For financed presets, the displayed minimum follows directly from the preset ceiling and the 30% maintenance ratio:

```text
minimumOpeningHealthFactor = 1 / (presetLeverage * maintenanceEquityRatio)
```

Because post-execution leverage must be no greater than the selected preset, actual opening health must be at least the static value shown above. The open screen does not need to compute a separate dynamic “Estimated health” value.

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

V1 emits no `InterestAccrued` event. Lazy debt is recomputable from position principal, accrued-interest checkpoint state, `lastAccruedAt`, and the fixed APR; the app/indexer may derive the live debt curve offchain. State-changing debt events record the economically relevant transitions instead.

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
6. enforces caller `minOut` and the protocol's oracle-derived execution floor;
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

The verified Base V1 configuration is:

```text
NVDAc                              0xb20000000000000000000078ee7ce2fE4908108C
Coinbase/Chainlink NVDA feed       0x04689a41629776563E6822F76f2e57D148d28513
Coinbase oracle registry           0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD
Base sequencer uptime feed         0xBCF85224fc0756B9Fa45aA7892530B47e10b6433
NVDAc decimals                     8
NVDA feed decimals                 8
USDC decimals                      6
MAX_LIVE_AGE                       8 hours
Sequencer recovery grace period    3600 seconds
```

`OracleAdapter` classifies the NVDAc observation as:

```text
LIVE
HELD
INVALID
```

### `LIVE`

A `LIVE` observation requires the Coinbase registry to be unpaused; the Base
sequencer to be up and beyond its recovery grace period; and a complete,
positive, non-future Chainlink round no older than `MAX_LIVE_AGE`. After an
explicit hold, `LIVE` additionally requires a qualifying round strictly newer
than the frozen round before the adapter may recover.

### `HELD`

`HELD` means the Coinbase registry explicitly reports `paused == true`. This is
the only onchain proof of a hold. Stale data alone is not `HELD`. The last feed
value may be displayed as the held mark, but it is never current solvency
pricing.

### `INVALID`

`INVALID` means the adapter cannot prove either `LIVE` or explicit `HELD`. This
includes stale unpaused data, failed dependency reads, malformed, incomplete,
zero, negative, or future rounds, sequencer down or in its recovery grace
period, and registry unpause before a fresh post-hold round.

The production `OracleAdapter` must retain enough information to enforce the
fresh-round-after-`HELD` rule, such as the frozen `roundId` and `updatedAt` or
equivalent state. A purely stateless current-read classifier cannot prove that a
pause occurred between calls.

### V1 action matrix

| Action                    | `LIVE`  | `HELD`                                         | `INVALID`   |
| ------------------------- | ------- | ---------------------------------------------- | ----------- |
| Open `1.0x`               | Yes     | Yes                                            | Yes         |
| Open financed             | Yes     | No                                             | No          |
| Repay external USDC       | Yes     | Yes                                            | Yes         |
| Reduce exposure           | Yes     | No                                             | No          |
| Set/clear executor        | Yes     | Yes                                            | Yes         |
| Transfer NFT              | Yes     | Yes                                            | Yes         |
| Close debt-free position  | Yes     | Yes                                            | Yes         |
| Liquidate                 | Yes     | No                                             | No          |
| Read current debt         | Yes     | Yes                                            | Yes         |
| Read current NAV / health | Current | Unavailable; held mark may be shown separately | Unavailable |

Interest continues accruing while pricing is held or invalid.

**Accepted V1 hold constraint:** a financed position with debt outstanding cannot `reduceExposure` or close while pricing is `HELD` or `INVALID`. If the owner has no external USDC to repay the debt, they must wait for a qualifying `LIVE` observation before they can deleverage and close. Standard ERC-721 transfer remains available during the hold. V1 intentionally does not use a stale/frozen mark to manufacture an unwind path.

---

## NVDAc valuation rule

The Coinbase NVDA Chainlink feed publishes the B20 total-return value: underlying equity price multiplied by the B20 multiplier.

Custody and position accounting use raw ERC-20 `balanceOf` and `transfer` units.
Scaled/UI B20 balances are presentation values and must not be used to determine
the position amount held by Margin Call.

Margin Call values **raw NVDAc units directly against the total-return feed
answer**. The feed is already multiplier-adjusted, so the B20 multiplier must
never be applied again.

Conceptually:

```text
valueUsdcRaw =
    stockAmountRaw
    * feedAnswer
    * 10^usdcDecimals
    / 10^stockDecimals
    / 10^feedDecimals
```

For V1, `stockDecimals = 8`, `feedDecimals = 8`, and `usdcDecimals = 6`.
Production valuation must use overflow-safe `mulDiv` and conservative floor
rounding so NAV never overstates collateral value.

Do not use `scaledBalanceOf`, `balanceOfUI`, `toUIAmount`, or the B20 multiplier
for custody or position accounting. Applying the multiplier to the total-return
feed again double counts the corporate-action/dividend adjustment.

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
2. delete the live position accounting;
3. burn the ERC-721 token internally in `MarginCall`;
4. emit `PositionClosed` as the terminal-history record.

There is no position-attributed residual USDC to return: `repay` never takes an overpayment and `reduceExposure` sends sale surplus to the owner immediately.

This deliberately removes debt-covering swap logic and lifecycle-status storage from the close function.

---

## Liquidation

Liquidation is permissionless but **pays no liquidator reward in V1**.

Because liquidation has no protocol incentive, a first-party keeper is a natural operating role for submitting eligible liquidations. **Keeper automation is not currently shipped.** Anyone may call `liquidate`; a keeper would have no privileged bypass.

```text
liquidate(tokenId)
```

Liquidation requires `LIVE` pricing and a financed position with `healthFactor < 1.0` under the Risk Model above.

V1 performs a full unwind:

1. accrue interest and snapshot current owner/current debt;
2. validate liquidation eligibility using the live Chainlink mark and the Risk Model predicate;
3. sell this position's entire recorded NVDAc -> USDC through the approved bounded execution path;
4. settle the liquidation proceeds;
5. delete the live position accounting and burn the ERC-721 token internally in `MarginCall`;
6. emit `PositionLiquidated` as the terminal-history record.

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

The principal-versus-interest decomposition is intentionally derived offchain rather than emitted: with fixed 10% simple interest, interest-first repayment, and the `CreditDrawn`, `DebtRepaid`, and `ExposureReduced` event history, an indexer can reconstruct it deterministically.

The treasury absorbs the shortfall. There is no claim on the current owner, any prior owner, or another position, and no aggregate principal state needs to be repaired or decremented during finalization.

A successful shortfall liquidation still deletes live state and burns the NFT. Failed oracle, token-transfer, or bounded-swap execution reverts atomically and leaves the position active.

---

## Events

Emit only lifecycle/accounting events needed by the simplified surface:

- `PositionOpened`
- `CreditDrawn`
- `DebtRepaid`
- `ExposureReduced`
- `ExecutorUpdated`
- ERC-721 `Transfer`
- `PositionClosed`
- `PositionLiquidated`
- `BadDebtRealized(tokenId, shortfall)`

There is no `ExposureIncreased`, `CollateralAdded`, `BorrowAprUpdated`, or `InterestAccrued` event because those actions/state transitions do not need separate V1 event machinery.

---

## Required acceptance flow

### Compact live acceptance (release-gated)

Base mainnet release acceptance is the **compact** path recorded in [`contracts/deployments/base.json`](../contracts/deployments/base.json) and run via [`contracts/script/BASE_LAUNCH.md`](../contracts/script/BASE_LAUNCH.md). It does **not** require a live elapsed-interest wait or the full multi-actor transfer demo on mainnet.

Compact live sequence (smoke asset: NVDAc):

1. Seed the Credit Pool with protocol USDC.
2. Treasury idle-withdraw smoke (optional but recorded).
3. Open a financed position during a `LIVE` window (e.g. 0.01 NVDAc at `1.25x`).
4. Repay remaining debt with external USDC.
5. Close; remaining stock returns to the owner and `MarginCall` burns the NFT.

If the oracle is `HELD` / `INVALID` during live acceptance, **wait** for a qualifying `LIVE` observation. Do not weaken policy.

Transaction hashes and amounts for the recorded launch acceptance live in `base.json`. Do not duplicate them here.

### Full product proof (Foundry / fork)

The full A→E→B product proof remains required in Foundry and Base-fork tests. It is **not** a live mainnet release gate.

Before the financed opening, confirm the adapter is `LIVE` for any step that needs `reduceExposure`. If the feed becomes `HELD` or `INVALID` before that step, wait for a qualifying `LIVE` observation; do not use a stale mark or weaken the rule.

Product-proof sequence:

1. **A opens a financed NVDAc position during a `LIVE` window.** Confirm contributed NVDAc, borrowed USDC, purchased NVDAc, principal, and ERC-721 ownership on `MarginCall`.
2. **Interest accrues.** Advance time (or wait in a controlled test environment) and prove `currentDebt > principal` without a keeper transaction or `InterestAccrued` event. This timing proof stays in Foundry/fork tests; it is not required on live mainnet acceptance.
3. **A appoints executor E.**
4. **E reduces exposure during `LIVE` pricing.** E performs a small `reduceExposure`, proving delegated management and the bounded stock -> USDC path.
5. **A transfers the Position NFT to B.** No oracle/health gate may block the transfer. Stock and debt remain in place; `MarginCall` clears the executor internally during the ERC-721 ownership update.
6. **A and E lose authority.** Calls by A or E to `repay`, `reduceExposure`, `setExecutor`, or `closePosition` must revert where authorization is required. Standard ERC-721 ownership/approval behavior applies separately.
7. **B manages the inherited position.** B may appoint a new executor, repay, or reduce exposure.
8. **B settles the debt to zero.** For the simplest path, B repays the remaining debt with external USDC.
9. **B closes.** All remaining recorded stock goes to B and `MarginCall` burns the NFT.
10. Record transaction receipts and before/after accounting for A, E, B, the position, and `CreditPool`.

If a demo later crosses a held market period, the UI must visibly report `HELD`. Transfer, repayment, executor updates, and debt-free close remain available; financed opening, reduction, and liquidation do not.

A purchase payment is not part of this V1 acceptance test. Do not claim that the demo creates a functioning secondary market.

---

## Local Foundry acceptance

At minimum, tests must cover:

- `MarginCall` directly implementing ERC-721 ownership, approvals, mint, transfer, and burn with no separate `PositionNFT` deployment;
- no `PositionStatus` enum or lifecycle-status storage; token existence is active status and terminal outcome is event history;
- exactly the five opening leverage presets, including rejection of intermediate values;
- static minimum opening-health values derived from preset leverage and the 30% maintenance ratio;
- cost-aware post-swap leverage checks for each financed preset;
- finite CreditPool capacity and zero-credit `1.0x` opening;
- lazy simple interest at the immutable 10% APR and interest-first ordinary repayment, with no `InterestAccrued` event requirement;
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

**Planned application direction.** Today's deployed site is a minimal Base Position workspace that proves connect → open → repay → close against the canonical launch contracts. It is not the production frontend. The open screen, full position page, and agent tool surface below describe the intended product UI, not what is shipped today.

### Open

Show the five fixed leverage presets with their static minimum opening-health reference:

```text
1.0x   Spot only       No debt
1.1x   Conservative   HF >= 3.03
1.25x  Balanced       HF >= 2.67
1.4x   Aggressive     HF >= 2.38
1.5x   Max            HF >= 2.22
```

Also show:

```text
NVDAc deposit
Oracle state
Available credit
Borrow APR (fixed 10%)
Estimated principal
Estimated gross exposure
```

Do not compute a separate dynamic “Estimated health” field on the open screen. The preset itself determines the minimum opening health under the V1 maintenance ratio; actual post-open health remains available on the position page from live state.

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

**Partly built (issue #461), live on Base since the 2026-09-18 coordinator redeploy.** `tokenURI` points at
`https://margincall.fun/api/nft/{tokenId}`, which serves the opener's optional on-chain thesis and a
pre-drawn stage image (healthy / warning / danger / liquidated, else the neutral ticker logo). The
richer presentation below — composited or generated art, and health on portfolio cards — is not shipped.

The living NFT is a presentation layer only.

For V1, use pre-created character states such as neutral, up, down, warning, critical, liquidated, and retired/closed. Financial state remains authoritative in the contracts.

When the oracle is held/invalid, preserve the last known visual state and label pricing unavailable rather than implying current health.

---

## Security principles

- `MarginCall` is the sole ERC-721 Position NFT contract; there is no cross-contract ownership/accounting synchronization.
- ERC-721 token existence is the active-position status; V1 stores no separate `PositionStatus` enum.
- Borrowed USDC is never freely withdrawable.
- Opening is the only action that creates new principal.
- Opening accepts only the five fixed leverage presets.
- Borrowed USDC can only buy NVDAc.
- No position may consume another position's recorded NVDAc.
- Borrow APR is an immutable V1 constant at 10%; there is no rate setter or APR admin surface.
- Lazy interest is derived from position debt state and time; there is no `InterestAccrued` event surface.
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

## Verified Base V1 assumptions

Issue #420's executable Base-mainnet verification pins the addresses, decimals,
raw B20 custody semantics, total-return valuation, oracle-state policy,
`MAX_LIVE_AGE`, sequencer grace period, bidirectional Uniswap V3 path, 100 bps
execution bound for the `$10–$250` demo range, and 30% maintenance equity ratio
documented above.

Mocks and production implementations must reflect those verified semantics.
Before running compact live acceptance or any financed open / reduce / liquidate
demo, confirm the adapter is currently `LIVE`; that operational check does not
reopen the pinned architecture or risk decisions.

Canonical launch addresses and recorded compact acceptance live at
[`contracts/deployments/base.json`](../contracts/deployments/base.json).

---

## Deferred / later work

**Landed since the original V1 draft (do not treat as remaining work):**

- curated multi-stock asset registry on `MarginCall` with immutable `ASSET_ADMIN` (live launch rails: NVDAc + AAPLc + METAc + GOOGLc; issue #446).

**Still deferred:**

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
- per-stock risk/APR parameters;
- partial liquidation;
- liquidator incentives;
- protocol liquidation fee;
- first-party keeper automation (liquidation remains permissionless);
- complex executor policy engine;
- generalized routing;
- living NFT presentation;
- production governance/timelocks.

---

## Final V1 thesis

> **Deposit a supported tokenized stock, choose one of five opening leverage presets, finance more of that same stock with finite protocol USDC at a fixed 10% APR, and receive a transferable NFT minted directly by Margin Call representing the live stock-plus-debt position. Repay or reduce exposure, transfer the position without an oracle/health gate, and let the new owner settle and close it.**

The original V1 demo asset was NVDAc; the live launch registry extends the same semantics across NVDAc + AAPLc + METAc + GOOGLc.
