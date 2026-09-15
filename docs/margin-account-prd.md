# Margin Call — Transferable Financed Spot Positions PRD

## Summary

Margin Call finances real tokenized equities on Base and turns each live spot position into a transferable ERC-721.

For the hackathon, V1 should prove one narrow primitive with as little protocol machinery as possible:

1. A user or agent already owns NVDAc.
2. They deposit NVDAc into Margin Call.
3. They choose target leverage from `1.0x` through `1.5x`.
4. At `1.0x`, Margin Call simply custodies the stock and mints the Position NFT.
5. Above `1.0x`, Margin Call values the stock with Chainlink, checks available USDC in the Credit Pool, draws the required principal, and atomically swaps that USDC through Uniswap into more NVDAc.
6. Margin Call custodies all stock and records each position's stock amount, principal, accrued interest, and executor in contract storage.
7. Financing accrues simple interest at a protocol-wide APR, initially `10%`.
8. The ERC-721 may be transferred without selling the stock or refinancing the debt. Ownership of the position state follows `ownerOf(tokenId)`.
9. The owner may increase leverage, reduce leverage, repay, transfer, or close.
10. If the position becomes unhealthy, anyone may liquidate it. The Credit Pool is repaid first, the liquidator receives the configured reward, and any residual equity goes to the NFT owner.

The user never receives borrowed USDC as freely spendable capital. Credit drawn against NVDAc can only buy more NVDAc.

The core product thesis remains:

> **Margin Call creates a secondary market for financed spot positions.**

The hackathon implementation intentionally does **not** attempt to solve public LPs, generalized multi-asset custody, smart accounts per position, dynamic interest-rate markets, or production-grade governance.

---

## Product thesis

Perpetual futures already provide leveraged synthetic exposure. Margin Call is different because it finances ownership of the actual onchain stock token and makes the entire stock-plus-debt position transferable.

```text
Perpetual position

collateral
  -> synthetic leveraged exposure
  -> close
  -> settle P&L
```

```text
Margin Call position

real NVDAc
  -> deposit stock
  -> optionally finance more NVDAc
  -> live stock + debt position
  -> ERC-721 ownership
       |
       +-> hold
       +-> increase leverage
       +-> deleverage
       +-> repay
       +-> transfer
       `-> close
```

The NFT is therefore not just a receipt or collectible wrapper. It is the ownership primitive for a live position containing:

- real NVDAc exposure;
- optional USDC principal;
- accrued borrow interest;
- equity and health state;
- an optional executor;
- application-layer thesis/history.

When the NFT changes hands, the underlying stock and debt do not move. Only ownership/control changes.

---

## V1 scope

V1 is deliberately narrow:

- Base only.
- Long only.
- **NVDAc only** for the first end-to-end implementation.
- One stock per position.
- Margin Call itself custodies position stock; there is no per-position smart account in V1.
- Target leverage from `1.0x` through `1.5x`.
- UI presets at `1.0x`, `1.1x`, `1.25x`, `1.4x`, and `1.5x`.
- Protocol may accept any valid target inside that range.
- `1.0x` has no debt and no borrow interest.
- Borrowed USDC can only buy more NVDAc.
- Borrowed USDC is never freely withdrawable.
- Protocol-funded USDC `CreditPool` rather than ERC-4626.
- Available credit is simply the Credit Pool's liquid USDC balance.
- Fixed/simple protocol APR, initially `10%`.
- APR may be changed by the protocol owner only when global outstanding principal is zero.
- Chainlink for solvency pricing.
- Uniswap for NVDAc/USDC execution.
- Full liquidation only.
- One `1%` liquidator reward; no separate protocol liquidation fee.
- Standard ERC-721 position ownership.
- Simple owner/executor authorization.
- NFT transfers are blocked only when a financed position is already liquidatable; there is no separate transfer-health threshold.

The hackathon goal is to prove this lifecycle locally and then execute the smallest practical real position on Base.

---

## Explicit V1 simplifications

These are intentional product decisions, not missing architecture.

### No ERC-4626 yet

The protocol is the only capital provider during the hackathon, so V1 uses a simple USDC `CreditPool`.

There are:

- no public LP shares;
- no withdrawal-liquidity accounting;
- no reserve factor;
- no utilization curve;
- no receivable-aware ERC-4626 share pricing.

The pool only needs to hold USDC, lend it to Margin Call, receive repayments, and expose available liquidity.

### No Position Account clones

V1 does not deploy one smart account per NFT.

`MarginCall` custodies the NVDAc for all positions and keeps logically isolated accounting keyed by `tokenId`.

This removes:

- `PositionAccount` implementation;
- `PositionAccountFactory`;
- clone deployment;
- smart-account call permissions;
- per-account token approvals.

If the product works, dedicated position accounts can be introduced later without changing the product thesis.

### No historical APR accumulator

V1 uses straightforward timestamp-based simple interest per position.

The APR can only be changed when `outstandingPrincipal == 0`, so no open financed position ever spans two protocol APRs. This removes the need for a global borrow index or rate-history accumulator.

### One stock first

V1 hardcodes/configures NVDAc as the only supported stock.

There is no generalized asset registry, per-stock risk configuration, per-stock APR, or multi-route execution registry in the hackathon core.

### No liquidity reserve

Because there are no public LP withdrawals in V1:

```text
availableCredit = USDC.balanceOf(CreditPool)
```

The protocol may lend all liquid USDC in the Credit Pool. Repayments immediately restore capacity.

### One liquidation incentive

V1 has a `1%` liquidator reward and no additional protocol liquidation fee.

Margin Call's primary protocol revenue is borrow interest.

### One health threshold

V1 uses the liquidation threshold for both solvency and transfer safety.

A position may transfer if it is not currently liquidatable. There is no separate transfer-health configuration.

---

## Actors

### Position owner

The wallet that owns the Position NFT.

The owner may:

- open a position;
- add NVDAc;
- increase leverage;
- reduce leverage;
- repay with external USDC;
- appoint or revoke an executor;
- transfer the Position NFT while the position is not liquidatable;
- close the position and receive remaining NVDAc/USDC.

The owner may be a human wallet, a Dynamic embedded wallet, or an agent wallet.

### Executor

Each position may optionally store one executor address.

The executor may:

- increase leverage within limits and available credit;
- reduce leverage;
- repay debt;
- perform supported execution actions.

The executor may not:

- transfer the NFT;
- withdraw owner equity;
- change the configured stock;
- route borrowed USDC elsewhere;
- bypass protocol risk checks.

Authorization should be intentionally small:

```text
executorOf[tokenId] = address
```

Owner or executor may perform approved management actions. Only the NFT owner may transfer or close for owner withdrawal.

When the NFT transfers, the previous executor is cleared.

### Liquidator

Any address may call `liquidate(tokenId)` once a financed position is below maintenance.

The contract determines liquidatability. The liquidator does not choose pricing, repayment priority, or payout routing.

### Protocol owner/admin

For V1, the protocol owner may:

- fund the Credit Pool;
- change the protocol APR only when no principal is outstanding;
- manage deployment/integration configuration required for the hackathon.

Longer-term governance/timelocks are out of scope.

---

## Position storage model

There is no separate Position Account contract in V1.

`MarginCall` keeps position accounting in storage, conceptually:

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

NVDAc itself is held by the `MarginCall` contract.

The accounting invariant is that every live position has its own recorded stock amount even though custody is shared at the contract level.

Conceptually:

```text
sum(stockAmount of all live positions)
<= NVDAc.balanceOf(MarginCall)
```

No position may spend, withdraw, or pledge another position's accounted stock.

The Position NFT remains the ownership primitive:

```text
ownerOf(tokenId)
  -> economic owner of positions[tokenId]
```

---

## Leverage selection

V1 supports gross leverage from `1.0x` through `1.5x`.

Recommended UI presets:

```text
1.0x   Spot only      no borrowing
1.1x   Conservative   borrow 10% of contributed equity
1.25x  Balanced       borrow 25% of contributed equity
1.4x   Aggressive     borrow 40% of contributed equity
1.5x   Max            borrow 50% of contributed equity
```

For a fresh position with contributed stock equity `E` and target leverage `L`:

```text
initialPrincipal = E * (L - 1)
grossStockExposure = E * L
```

For a `$100` NVDAc deposit:

```text
Target    USDC principal    Gross stock exposure
1.0x      $0                $100
1.1x      $10               $110
1.25x     $25               $125
1.4x      $40               $140
1.5x      $50               $150
```

Presets are only UX conveniences. The contract may accept intermediate targets inside the valid range.

### Capacity-constrained leverage

`1.5x` is the risk ceiling, not a guarantee that enough capital is available.

```text
availableCredit = USDC.balanceOf(CreditPool)
```

For a fresh opening:

```text
capacityLeverage = 1 + (availableCredit / contributedEquity)
maxAvailableLeverage = min(1.5x, capacityLeverage)
```

Example:

```text
NVDAc deposit value       $100
Protocol leverage ceiling 1.50x
Available USDC             $20
Current max leverage       1.20x
```

The UI should disable choices above the currently financeable maximum.

The transaction must still check capacity atomically because another position can consume USDC between quote and execution.

### `1.0x` positions

A `1.0x` position:

- draws no USDC;
- accrues no interest;
- consumes no Credit Pool capital;
- is not liquidatable for lender solvency;
- can later increase leverage if credit becomes available.

A `1.0x` position may open even when `availableCredit == 0`.

---

## Canonical opening flow

Example:

```text
User deposits         $100 NVDAc
Target leverage       1.5x
Required principal     $50 USDC
Borrow APR                  10%
```

Conceptually:

```text
openPosition(stockAmount, targetLeverage)
```

Margin Call atomically:

1. transfers NVDAc from the caller into `MarginCall`;
2. values the contribution with Chainlink;
3. validates `1.0x <= targetLeverage <= 1.5x`;
4. calculates required USDC principal;
5. if principal is greater than zero, verifies the Credit Pool has enough liquid USDC;
6. draws exactly that USDC from the Credit Pool;
7. swaps that USDC through the approved Uniswap execution path into NVDAc;
8. keeps purchased NVDAc in `MarginCall` custody;
9. records the position's total NVDAc amount and principal;
10. sets `lastAccruedAt`;
11. mints the Position NFT to the owner.

At `1.5x`:

```text
NVDAc gross value       $150
USDC principal           $50
Accrued interest          $0
Current debt             $50
Net equity              $100
Gross leverage          1.50x
```

At `1.0x`:

```text
NVDAc gross value       $100
USDC principal            $0
Current debt              $0
Net equity              $100
Gross leverage          1.00x
```

If there is not enough Credit Pool USDC or the Uniswap swap fails/slippage exceeds bounds, a financed opening reverts atomically.

The user never receives a standalone USDC loan.

---

## Increasing leverage

Conceptually:

```text
increaseLeverage(tokenId, targetLeverage)
```

Margin Call:

1. accrues interest through the current timestamp;
2. checks owner/executor authorization;
3. values current NVDAc with Chainlink;
4. calculates current debt, equity, and leverage;
5. validates the higher target up to `1.5x`;
6. calculates additional principal required;
7. checks Credit Pool USDC capacity;
8. draws the additional USDC;
9. swaps it into NVDAc;
10. increases the position's recorded `stockAmount` and `principal`.

Borrowed USDC may only buy NVDAc.

---

## Reducing leverage

Conceptually:

```text
reduceLeverage(tokenId, targetLeverage)
```

Margin Call:

1. accrues interest;
2. checks owner/executor authorization;
3. determines how much debt must be repaid to reach the requested lower leverage;
4. sells only the required NVDAc into USDC;
5. applies USDC to accrued interest first and principal second;
6. returns repayment to the Credit Pool;
7. decreases the position's recorded NVDAc amount and debt state.

Reducing to `1.0x` fully repays current debt while preserving the remaining NVDAc in the same NFT position.

Principal returned to the Credit Pool immediately becomes available for new financing.

---

## Borrow interest

Borrow interest is Margin Call's primary V1 protocol revenue.

### V1 model

Initial APR: **10%**.

Interest is:

- USDC-denominated;
- simple, not compounding;
- charged only while principal is outstanding;
- calculated lazily from timestamps;
- attached to the position when the NFT transfers;
- repaid before principal.

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

For `50 USDC` principal at `10% APR`:

```text
At open        50.000 USDC debt
After 1 day    ~50.014 USDC debt
After 30 days  ~50.411 USDC debt
After 1 year   ~55.000 USDC debt
```

No keeper or periodic interest transaction is required.

Before a debt-changing action, `_accrue(tokenId)` stores elapsed interest and updates `lastAccruedAt`.

### APR updates

To avoid historical rate accounting, V1 only allows APR changes when there is no outstanding principal anywhere in the protocol.

Conceptually:

```text
setBorrowApr(newApr)
  require(outstandingPrincipal == 0)
```

Recommended constraints:

- owner/admin only;
- `newApr <= 50%` hard safety cap;
- emit `BorrowAprUpdated(oldApr, newApr)`.

If any financed position is open, the APR is locked.

This is sufficient for the hackathon and preserves the ability to change the pricing model between financing epochs without adding a global rate accumulator.

---

## Credit Pool

V1 uses a simple USDC pool, not ERC-4626.

### Responsibilities

`CreditPool`:

- holds protocol-owned USDC;
- allows only `MarginCall` to draw financing;
- receives principal and interest repayments;
- exposes liquid USDC / available credit;
- tracks or exposes global outstanding principal as needed for accounting and APR-change gating.

Conceptually:

```text
availableCredit() = USDC.balanceOf(CreditPool)
```

There is no liquidity reserve in V1.

### Capacity

The number of financed users/positions depends on how much USDC remains in the Credit Pool.

Example:

```text
Credit Pool funded      $10,000
Outstanding principal    $6,000
Liquid USDC              $4,000
Available new credit     $4,000
```

The `$6,000` already lent out is still owed to the protocol, but it cannot be lent again until repaid.

New financed openings and leverage increases are first-come, first-served.

If requested principal exceeds current liquid USDC, the transaction reverts.

Repayment, deleveraging, close, and liquidation return USDC to the pool and restore capacity immediately.

### Funding

For the hackathon, the protocol treasury is the only capital provider.

It can simply transfer/fund USDC into the Credit Pool.

Public LP deposits and ERC-4626 shares are future work.

---

## Risk model

For one NVDAc position:

```text
NAV = Chainlink value of recorded NVDAc amount
Current Debt = principal + accrued interest
Equity = NAV - Current Debt
Equity Ratio = Equity / NAV
Gross Leverage = NAV / Equity
```

Initial V1 constants/configuration:

```text
Minimum leverage           1.0x
Maximum leverage           1.5x
Borrow APR                 10%
APR hard cap               50%
Maintenance equity ratio   30%
Liquidator reward           1%
Liquidation                full unwind
```

Displayed health factor:

```text
Health Factor = Equity Ratio / Maintenance Equity Ratio
```

`Health Factor < 1.0` means liquidatable.

A zero-debt `1.0x` position is not liquidatable for lender solvency.

### Risk-increasing actions

Before opening a financed position or increasing leverage, verify:

- caller is owner or executor;
- position is active;
- target leverage is within `1.0x-1.5x`;
- Chainlink price is fresh/valid;
- current debt includes elapsed interest;
- resulting position remains above maintenance;
- sufficient Credit Pool USDC is available;
- execution buys only NVDAc.

### Risk-reducing actions

Repay, deleverage, and close should remain available whenever technically safe.

Lack of Credit Pool liquidity never blocks an action that returns capital to the pool.

### Oracle behavior

Chainlink is the solvency oracle.

Uniswap spot price is never used to decide health or liquidation.

If the Chainlink price is stale/invalid:

- block new financing;
- block leverage increases;
- block liquidation until a valid price is available;
- allow direct USDC repayment;
- allow other clearly risk-reducing actions where implementation can do so safely.

---

## Transfer semantics

The Position NFT is a standard ERC-721.

A transfer changes economic ownership of the existing position. It does not:

- sell NVDAc;
- repay debt;
- create a new loan;
- reset accrued interest;
- alter the position's recorded stock amount.

On transfer:

- `ownerOf(tokenId)` becomes the new economic owner;
- the old executor is cleared;
- debt and stock state remain unchanged.

### Transfer check

V1 has no separate transfer-health threshold.

A financed NFT may transfer if the position is **not currently liquidatable** using fresh Chainlink pricing and current debt.

If `Health Factor < 1.0`, transfer reverts and the position must be repaid/deleveraged or liquidated.

A `1.0x` zero-debt position transfers normally.

---

## Liquidation

Liquidation is permissionless for financed positions.

Conceptually:

```text
liquidate(tokenId)
```

V1 full liquidation:

1. accrue interest;
2. validate `Health Factor < 1.0` with a fresh Chainlink price;
3. sell the position's entire recorded NVDAc amount to USDC through the approved Uniswap path;
4. repay Credit Pool current debt first;
5. pay the liquidator reward;
6. return remaining USDC to the NFT owner;
7. mark the position liquidated;
8. burn the NFT.

There is **no separate protocol liquidation fee** in V1.

### Liquidator reward

Target V1 reward: `1%`.

Keep the Credit Pool senior. Conceptually:

```text
repay Credit Pool first
reward = min(1% of gross liquidation proceeds, remaining equity)
remaining equity -> NFT owner
```

If there is no residual equity after Credit Pool repayment, the liquidator reward may be reduced or zero. More sophisticated keeper economics are future work.

No `$MARGINCALL` token incentive is required for liquidation.

---

## Normal close

The NFT owner may close at any time, subject to execution availability.

Default close preserves as much stock as possible.

`closePosition(tokenId)`:

1. accrues interest;
2. calculates current USDC debt;
3. if debt is greater than zero, sells only enough NVDAc to cover current debt, subject to slippage bounds;
4. repays the Credit Pool in full;
5. returns all remaining recorded NVDAc plus any residual USDC to the NFT owner;
6. marks the position closed;
7. burns the NFT.

Example:

```text
Before close
NVDAc value           $180
Principal              $50
Accrued interest        $2
Current debt           $52
Net equity            $128

Close
sell ~ $52 NVDAc
repay $52 to Credit Pool
return ~ $128 NVDAc to owner
burn NFT
```

### External repayment

The owner may send USDC through `repay(tokenId, amount)` before closing.

Repayment ordering:

```text
1. accrued interest
2. principal
```

If current debt reaches zero, closing does not sell NVDAc. It simply returns the remaining NVDAc and burns the NFT.

---

## Fees and revenue

Keep V1 economics minimal.

### Revenue

Primary protocol revenue:

- borrow interest.

Supplemental product revenue may come from Bankr creator fees outside the core financing contracts.

### Do not charge in V1

No separate:

- origination fee;
- close fee;
- repayment fee;
- NFT transfer fee;
- protocol liquidation fee.

Uniswap LP fees and slippage are execution costs paid by the user, not Margin Call revenue.

---

## Oracle and execution adapters

Keep these abstractions because they make local testing easy, but make the live V1 implementations single-purpose.

### `OracleAdapter`

For V1:

```text
getNvdaPrice()
```

Responsibilities:

- return normalized NVDAc economic value;
- expose freshness/validity;
- use the selected Chainlink feed semantics correctly.

No generalized asset registry is required.

### `ExecutionAdapter`

For V1, only two directions exist:

```text
USDC -> NVDAc
NVDAc -> USDC
```

Requirements:

- bounded slippage;
- fixed approved tokens;
- fixed recipient/settlement path;
- no arbitrary output token;
- no arbitrary recipient;
- no unrestricted caller-supplied route.

---

## Contract architecture

V1 should have only five core components:

```text
MarginCall
PositionNFT
CreditPool
OracleAdapter
ExecutionAdapter
```

### `MarginCall`

Primary coordinator, custody contract, accounting layer, and risk engine.

Responsibilities:

- custody NVDAc for all live positions;
- maintain `positions[tokenId]` accounting;
- open at `1.0x-1.5x`;
- draw USDC from Credit Pool;
- buy more NVDAc;
- accrue simple interest;
- calculate debt/equity/leverage/health;
- increase/reduce leverage;
- accept direct repayment;
- manage one executor per position;
- enforce transfer check;
- close positions;
- liquidate positions;
- coordinate NFT mint/burn.

### `PositionNFT`

OpenZeppelin ERC-721.

Responsibilities:

- represent ownership of each live position;
- call/consult Margin Call transfer validation;
- clear executor on transfer through Margin Call lifecycle;
- burn only on close/liquidation.

### `CreditPool`

Simple USDC capital pool.

Responsibilities:

- hold protocol-owned USDC;
- lend only to Margin Call;
- receive principal/interest repayment;
- expose liquid available credit.

### `OracleAdapter`

Single NVDAc Chainlink pricing adapter.

### `ExecutionAdapter`

Single NVDAc/USDC Uniswap execution adapter.

There is no `PositionAccount`, `PositionAccountFactory`, ERC-4626 vault, global interest accumulator, asset registry, or utilization-rate module in V1.

---

## Events

Emit enough events to reconstruct the lifecycle:

- `PositionOpened`
- `CreditDrawn`
- `InterestAccrued`
- `BorrowAprUpdated`
- `ExposureIncreased`
- `ExposureReduced`
- `CollateralAdded`
- `DebtRepaid`
- `ExecutorUpdated`
- ERC-721 `Transfer`
- `PositionClosed`
- `PositionLiquidated`

Convex can index these events for the application, charts, history, and social surfaces.

Contracts remain the financial source of truth.

---

## Local Foundry spike

Build the protocol locally before adding application complexity.

### Mocks

Implement:

- `MockUSDC`
- `MockNVDAc`
- `MockOracleAdapter`
- `MockExecutionAdapter`

### Canonical lifecycle test

1. Fund Credit Pool with `500 USDC`.
2. Give owner mock NVDAc worth `100 USDC`.
3. Open at `1.5x`.
4. Verify Margin Call receives the original NVDAc.
5. Verify `50 USDC` is drawn from Credit Pool.
6. Verify mock execution converts it into more NVDAc held by Margin Call.
7. Verify position accounting shows approximately `150 USDC` of NVDAc, `50 USDC` principal, and `100 USDC` equity.
8. Verify Credit Pool liquid USDC falls by `50`.
9. Warp time and verify interest grows lazily.
10. Transfer the NFT and verify stock/debt remain unchanged and old executor clears.
11. Reduce leverage and verify NVDAc is sold and principal returns to Credit Pool.
12. Increase leverage again if capacity exists.
13. Close and verify only enough NVDAc is sold to repay current debt, with remaining NVDAc returned to the owner.
14. Open another position, push oracle price below maintenance, liquidate, repay Credit Pool first, pay liquidator reward, return residual equity, and burn NFT.

### Capacity test

1. Fund Credit Pool with a known USDC amount.
2. Verify `availableCredit()` equals its USDC balance.
3. Consume most capacity with financed positions.
4. Verify a financing request larger than remaining USDC reverts.
5. Verify a `1.0x` position still opens with zero available credit.
6. Repay/deleverage/close/liquidate and verify available credit returns immediately.

### Leverage test

1. Open `$100` NVDAc at `1.0x` and verify zero debt.
2. Increase to `1.25x` and verify roughly `$25` principal / `$125` gross exposure.
3. Increase to `1.5x` and verify roughly `$50` principal / `$150` gross exposure.
4. Reduce through an intermediate target.
5. Reduce to `1.0x` and verify debt becomes zero without replacing the NFT.
6. Verify targets below `1.0x` or above `1.5x` revert.
7. Verify a valid non-preset target works.

### Interest test

1. Open with `50 USDC` principal at `10% APR`.
2. Warp `30 days`.
3. Verify `currentDebt()` is approximately `50.411 USDC` subject to rounding.
4. Verify no keeper transaction was needed.
5. Partially repay and verify interest is repaid before principal.
6. Verify health uses current debt.

### APR admin test

1. Verify owner may set APR when `outstandingPrincipal == 0`.
2. Open a financed position.
3. Verify APR update reverts while principal is outstanding.
4. Fully repay/close all financed positions.
5. Verify APR may now change.
6. Verify non-owner changes revert.
7. Verify APR above the hard cap reverts.

### Shared-custody accounting test

1. Open multiple positions.
2. Verify each position's `stockAmount` is independent.
3. Verify actions on one position cannot consume another position's stock accounting.
4. Verify aggregate recorded live stock never exceeds actual NVDAc held by Margin Call.

---

## Live Base spike

After local tests are green, validate only the plumbing required for the demo.

### 1. NVDAc + Chainlink

Verify:

- NVDAc token address/decimals;
- selected Chainlink feed;
- normalization;
- freshness behavior;
- B20 multiplier/total-return semantics if applicable.

### 2. Uniswap

Verify:

- minimal USDC -> NVDAc swap;
- minimal NVDAc -> USDC swap;
- slippage limits;
- Margin Call custody/approvals.

### 3. Credit Pool

- fund with a small amount of real USDC;
- verify available credit;
- draw for one tiny position;
- repay/close and verify USDC returns.

### 4. Tiny end-to-end position

Open the smallest practical real NVDAc position, finance it, display it, and close it.

A live liquidation can be demonstrated on a fork/local environment if intentionally pushing a real position into liquidation is impractical.

---

## Human and agent interface

### Human app

The primary open-position UI should show:

```text
NVDAc deposit value
Leverage presets
Currently available credit
Current financeable max leverage
Borrow APR
Estimated gross exposure
Estimated principal
Estimated health
```

Example:

```text
Deposit               $100 NVDAc
Credit available       $20 USDC
Protocol max           1.50x
Available max          1.20x
Borrow APR             10%
```

Disable leverage choices that cannot currently be financed.

### Position page

Show:

- living NFT/character art;
- owner;
- executor;
- NVDAc amount/value;
- gross exposure;
- principal;
- accrued interest;
- current debt;
- APR;
- equity;
- leverage;
- health;
- P&L;
- thesis/history;
- available credit for an increase;
- increase/decrease leverage;
- repay;
- close;
- share link.

The UI may calculate live accrued interest from the onchain timestamp/state for smooth display. Contract `currentDebt()` remains authoritative.

### Agent interface

Keep the agent surface small:

- `get_credit_pool`
- `get_position`
- `get_health`
- `open_position`
- `increase_leverage`
- `reduce_leverage`
- `repay`
- `set_executor`
- `close_position`

There is no generic `borrow_usdc` action.

---

## NFT art and social layer

The living-position presentation remains useful, but it is separate from protocol accounting.

For V1, start with one NVDAc character family and deterministic pre-created state images.

Suggested states:

- neutral;
- up big;
- down;
- warning;
- critical;
- liquidated;
- retired/closed historical state.

Character state can be derived from P&L, health, and lifecycle status.

The financial metrics remain visible in the position page/card. Art never affects accounting.

A first-party NFT marketplace is not required. Standard ERC-721 transferability is enough to demonstrate the secondary-market primitive.

---

## Sponsor/product extensions

Do not let sponsor integrations block the core protocol.

### Dynamic

Use Dynamic for human onboarding/embedded wallet if useful. Existing agent wallets remain first-class and can own NFTs directly.

### Flash

Advanced stop-loss/take-profit/bracket execution is a later extension after the core Uniswap lifecycle works.

### Bankr / `$MARGINCALL`

`$MARGINCALL` is not required to use the protocol and is not collateral.

Bankr creator fees may later be converted to USDC and used to increase protocol-owned Credit Pool capital.

Do not add token rewards to liquidation in V1.

---

## Security principles

- Borrowed USDC is never freely withdrawable.
- Borrowed USDC can only buy NVDAc.
- Margin Call shared custody must preserve per-position stock accounting.
- One position cannot consume another position's recorded stock.
- New principal cannot exceed liquid USDC in Credit Pool.
- A `1.0x` position consumes no credit and has no lender-driven liquidation.
- All financed health calculations use current debt including accrued interest.
- Chainlink determines solvency; Uniswap is execution only.
- Owner/executor permissions are narrow.
- NFT transfer clears the old executor.
- NFT transfer is blocked only if the position is already liquidatable.
- Credit Pool repayment is senior to liquidator reward and owner residual equity.
- Normal close sells only enough stock to repay current debt.
- APR cannot change while any principal is outstanding.
- Full liquidation only in V1.
- Prefer simple, restrictive functions over generalized call execution.

---

## Build order

### Phase 1 — Local protocol core

- Mock USDC/NVDAc/oracle/execution.
- Simple Credit Pool.
- Position NFT.
- Margin Call shared custody + position mapping.
- Open at `1.0x-1.5x`.
- Fixed/simple interest.
- Increase/reduce leverage.
- Repay.
- Transfer + executor clear.
- Stock-preserving close.
- Permissionless liquidation + 1% liquidator reward.
- Full Foundry lifecycle tests.

### Phase 2 — Base plumbing

- Real NVDAc.
- Chainlink adapter.
- Uniswap adapter.
- Real-USDC Credit Pool.
- Tiny live open/close.

### Phase 3 — App/agent demo

- Human onboarding.
- Capacity-aware leverage UI.
- Position dashboard/page.
- Agent tools.
- Living NFT art/social sharing.

### Phase 4 — Optional sponsor extensions

- Dynamic delegated flow.
- Flash advanced orders.
- Bankr token/creator-fee loop.

---

## Deferred until after the hackathon

Only add these if the core product is worth extending:

- ERC-4626 / public LP shares;
- LP withdrawals and reserve management;
- utilization-based variable APR;
- reserve factor / protocol-vs-LP interest split;
- global borrow index / historical rate accumulator;
- per-position smart accounts or ERC-6551;
- Position Account factory/clones;
- multi-stock asset registry;
- per-stock risk parameters;
- per-stock APRs;
- separate transfer-health threshold;
- partial liquidation;
- protocol liquidation fee;
- complex executor policy engine;
- generalized routing/execution;
- production governance/timelocks.

---

## Remaining implementation questions

These are the only important questions that should remain before coding the simplified core:

1. Exact NVDAc token address/decimals on Base.
2. Exact Chainlink feed and normalization semantics for NVDAc/B20.
3. Exact Uniswap pool/route and practical slippage for NVDAc/USDC.
4. Final maintenance equity ratio after a small simulation; `30%` is the starting value.
5. Exact integer precision/rounding for leverage and simple interest.
6. Whether the `1%` liquidator reward is calculated from gross liquidation proceeds or another simple basis; Credit Pool must remain senior either way.
7. Exact amount of USDC to seed into the Credit Pool for the demo.

Everything else can wait.

---

## Product statement

> **Margin Call finances real NVDAc spot exposure and creates a secondary market for financed positions. Deposit NVDAc, choose leverage from `1.0x` through `1.5x`, and Margin Call uses finite protocol-owned USDC to buy more NVDAc. The position accrues transparent borrow interest while financed and is represented by a transferable NFT that can change owners without unwinding the trade.**