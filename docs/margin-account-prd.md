# Margin Call — Transferable Financed Spot Positions PRD

## Status and document authority

This is the current proposed product for Margin Call. It supersedes the standalone Stock Gacha MVP and generalized inventory-protocol proposals as the active product direction.

The repository currently contains a coming-soon site and retained application/Foundry scaffolding. The contracts, keeper, indexing, agent tools, and product UI described here are requirements, not implemented features. Product decisions below were resolved in the PR #419 documentation review; live integration feasibility remains to be verified.

Use [CONTEXT.md](../CONTEXT.md) for canonical vocabulary and the [docs index](README.md) for the associated architecture decisions.

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

> **Margin Call makes financed spot positions transferable without unwinding them.**

A secondary market is the product thesis. V1 proves transfer and continued management by a new owner; purchase settlement and market demand are not established by an ERC-721 transfer alone.

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
- Target leverage from `1.0x` through `1.5x`, with the ceiling enforced on actual post-execution leverage at opening and increase.
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
- Active NFTs may transfer regardless of oracle availability or position health, including while liquidatable. Margin Call imposes no oracle, health, or admin pause on NFT transfers.
- Shortfall liquidation realizes a treasury loss without recourse to any NFT owner or other position.
- A first-party keeper is required to submit underwater liquidations that pay no reward.

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

### Health does not gate transfers

V1 uses maintenance health to determine liquidation eligibility only. NFT transfers do not consult the oracle or apply a health threshold. A transfer never cures an unhealthy position or postpones liquidation.

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
- transfer the Position NFT regardless of oracle availability or position health;
- close the position and receive remaining NVDAc/USDC.

The owner may be a human wallet, a Dynamic embedded wallet, or an agent wallet.

### Executor

Each position may optionally store one executor address.

The executor may:

- increase leverage within limits and available credit;
- reduce leverage;
- repay debt;

Executor appointment alone does not authorize the following:

- transfer the NFT;
- withdraw owner equity;
- change the configured stock;
- route borrowed USDC elsewhere;
- bypass protocol risk checks.

Authorization should be intentionally small:

```text
executorOf[tokenId] = address
```

Owner or executor may perform the management actions listed above. Only the NFT owner may close for owner withdrawal or appoint/revoke the executor. Payout recipients are fixed by the protocol and cannot be chosen by the executor.

ERC-721 approved addresses and operators may initiate NFT transfers under standard ERC-721 authorization. An NFT approval alone grants no position-management permission. Executor appointment alone grants no NFT-transfer permission. A wallet may hold both roles only through separate authorization.

When the NFT transfers, the previous executor is cleared.

### Liquidator

Any address may call `liquidate(tokenId)` once a financed position is below maintenance.

The contract determines liquidatability. The liquidator does not choose pricing, repayment priority, or payout routing.

### First-party keeper

The protocol operates a keeper that discovers liquidatable positions and submits liquidation transactions, including underwater positions with no reward. It is required for V1 operations, but is not a privileged contract role; anyone may submit the same transaction.

The treasury funds keeper gas. Failed attempts use bounded retries and surface persistent execution failures for operator attention. The keeper cannot bypass oracle validity, token transfer restrictions, or execution bounds. Keeper availability is separate from permissionless liquidation eligibility.

### Protocol owner/admin

For V1, the protocol owner may:

- fund the Credit Pool;
- change the protocol APR only when no principal is outstanding;
- choose deployment/integration configuration before deployment.

NVDAc/USDC addresses, oracle/execution adapters, maintenance parameters, and the 1% liquidator reward are fixed for a V1 deployment. Changing them requires a new deployment; existing positions keep their original rules.

V1 grants no general configuration setter, custody-withdrawal override, or transfer-pause power. No additional emergency powers are specified for V1. Any later proposal must enumerate its exact authority and which actions it affects before implementation.

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

The `executor` field is the sole stored executor authority; `executorOf(tokenId)` is its accessor, not a second independent authorization mapping. Terminal position records remain available for history after the NFT is burned.

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

V1 accepts target leverage from `1.0x` through `1.5x`. Existing positions' current leverage can move outside this range as prices and interest change.

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

`1.5x` is the post-execution ceiling for opening/increasing leverage, not a guarantee that enough capital is available. Market moves and interest may subsequently push an existing position above 1.5x; maintenance determines liquidation eligibility.

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

### Execution costs and the leverage ceiling

The opening and capacity formulas above are idealized estimates before fees, slippage, and rounding. They do not establish the actual position leverage.

For example, depositing $100 of NVDAc and borrowing $50 that buys only $49 of oracle-valued NVDAc leaves NAV of $149, debt of $50, and equity of $99. Actual leverage is approximately `1.505x`, which must fail the 1.5x post-execution ceiling.

Opening and increasing leverage must size borrowing using bounded execution costs, then validate actual recorded stock and current debt against the same valid oracle observation. Equity must be positive and actual leverage must not exceed 1.5x. An out-of-bounds result reverts the entire transaction, including the draw and swap. The UI must show attainable estimates after costs; selecting the max preset is not a promise of exactly 1.500x execution.

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

Idealized example before execution costs:

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
10. for a financed opening, verifies actual post-execution leverage does not exceed 1.5x and maintenance is satisfied;
11. sets `lastAccruedAt`;
12. mints the Position NFT to the owner.

The `1.0x` path only deposits and records NVDAc and mints the NFT. It skips borrowing, swaps, and oracle-dependent validation; unavailable pricing affects display, not zero-debt opening.

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
10. increases the position's recorded `stockAmount` and `principal`;
11. verifies actual post-execution leverage does not exceed 1.5x and maintenance is satisfied; otherwise the whole transaction reverts.

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

### Adding collateral

The owner may deposit additional NVDAc into an active position. Credit only the actual received amount to that position's stock accounting. Adding collateral does not draw credit, automatically change principal, or require oracle pricing. Any displayed valuation or leverage remains unavailable until valid pricing returns.

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
- repaid before principal in ordinary repayment and sufficient-proceeds liquidation; shortfall liquidation applies proceeds to principal first.

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

This applies to interest accrual only. The first-party liquidation keeper remains required.

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

`outstandingPrincipal` is the sum of remaining principal on active positions. Draws increase it; principal repayments decrease it. Finalized liquidation removes the position's entire remaining principal, including any unrecovered principal. Interest never contributes to this counter. Realized bad debt is recorded separately, so written-off debt does not permanently block APR changes.

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

Repayment, deleveraging, close, and liquidation increase capacity only by the USDC actually returned to the pool. A successful zero-proceeds liquidation restores no liquid capacity; realized losses are never available credit.

### Funding

For the hackathon, the protocol treasury is the only capital provider.

It can simply transfer/fund USDC into the Credit Pool.

Public LP deposits and ERC-4626 shares are future work.

---

## Risk model

For one NVDAc position:

```text
NAV = Chainlink value of recorded NVDAc amount
Current Debt = principal + all accrued interest, including elapsed interest not yet stored
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

Financed positions with zero or negative equity are also liquidatable when pricing is valid. Implement health checks without unsigned-subtraction or division failures at zero NAV/equity. A negative equity display does not create personal recourse against the owner.

A zero-debt `1.0x` position is not liquidatable for lender solvency.

### Risk-increasing actions

Before opening a financed position or increasing leverage, verify:

- for an increase, caller is owner or executor and the position is active;
- for an opening, the caller supplies the initial stock and receives the new NFT;
- target leverage is within `1.0x-1.5x`;
- Chainlink price is fresh/valid;
- current debt includes elapsed interest;
- resulting position remains above maintenance;
- actual leverage after a successful opening/increase is at most 1.5x;
- sufficient Credit Pool USDC is available;
- execution buys only NVDAc.

### Risk-reducing actions

Repay, deleverage, and close should remain available whenever technically safe.

Lack of Credit Pool liquidity never blocks an action that returns capital to the pool.

### Oracle behavior

Chainlink is the solvency oracle.

Uniswap spot price is never used to decide health or liquidation.

When pricing is stale, invalid, or frozen, use this action policy:

| Action                                          | Available without valid oracle pricing?                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Open a zero-debt position                       | Yes; no borrowing or swap.                                                                                  |
| Open financed / increase leverage               | No.                                                                                                         |
| Transfer an active NFT, including one with debt | Yes; no oracle or health check.                                                                             |
| Repay with external USDC                        | Yes.                                                                                                        |
| Add NVDAc collateral                            | Yes, subject to token transfer availability.                                                                |
| Close a zero-debt position                      | Yes, subject to token transfer availability.                                                                |
| Close a financed position                       | Yes only when bounded execution repays current debt in full without relying on unavailable oracle pricing.  |
| Reduce to an intermediate leverage target       | No; target sizing requires valid valuation.                                                                 |
| Reduce to 1.0x                                  | Yes only when bounded execution fully repays current debt, preserving remaining stock in the same position. |
| Liquidate                                       | No; requires valid pricing.                                                                                 |

Interest continues to accrue while pricing is unavailable. Liquidation can therefore be delayed even as debt grows. NFT transfers and sale settlement are not paused by that condition.

Do not label unavailable health or NAV as current. Debt remains computable without the stock price. Token pauses or execution failures may separately prevent moving underlying stock; they do not create a Margin Call health/oracle gate on NFT transfer.

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

### Transfer availability and sale semantics

All standard ERC-721 transfer entry points allow an active NFT to transfer regardless of debt, oracle availability, or position health. Transfer must not call the oracle, require a price, apply a health threshold, or honor a protocol-admin transfer pause. Standard ownership/approval, recipient, and NFT-existence rules still apply.

This includes already-liquidatable and underwater positions. The new owner receives the unchanged position and its existing liquidation risk; no personal debt claim attaches to any owner. A transfer grants no grace period or exemption from liquidation. After transfer, any liquidation residual belongs to the new current owner.

NFT sales are always available at the Margin Call transfer layer while the NFT exists. Marketplace availability and payment settlement are separate integrations. A close or liquidation burns the NFT, so an order referencing that NFT can no longer settle afterward. A sale executed before liquidation does not prevent the new owner's position from being liquidated next.

Clear the old executor before any recipient callback can manage the transferred position. Permission tests must cover owner transfers, approved addresses, operators, and both safe-transfer variants.

Position pages and sale presentations must expose current debt and indicate unavailable pricing or known liquidation risk. A displayed estimate is not a promise that stock, debt, or health will be unchanged by sale settlement. V1 proves transferability, not protected purchase settlement for a mutable position.

---

## Liquidation

Liquidation is permissionless for financed positions.

Conceptually:

```text
liquidate(tokenId)
```

V1 full liquidation:

1. accrue interest and snapshot the position's remaining principal, accrued interest, and current owner;
2. validate liquidation eligibility with valid, non-frozen Chainlink pricing;
3. sell only this position's entire recorded NVDAc amount to USDC through the approved Uniswap path, subject to execution bounds;
4. apply the realized proceeds using the sufficient-proceeds or shortfall waterfall below;
5. remove the position's entire remaining principal from global `outstandingPrincipal` exactly once;
6. clear the active stock/debt/executor state and mark the position liquidated, retaining historical outcome data;
7. burn the NFT and emit the liquidation outcome.

Finalization cannot fail merely because realized proceeds are insufficient to repay debt. Execution must still succeed within bounds. If the token transfer or swap fails, oracle pricing is unavailable, or slippage bounds are violated, the transaction reverts atomically and leaves the position active and unchanged for a later attempt. "Unconditional finalization" applies to the debt shortfall after successful execution; it is not permission to bypass those prerequisites.

There is **no separate protocol liquidation fee** in V1.

### Liquidator reward

Target V1 reward: `1%`.

When gross liquidation proceeds are at least current debt:

```text
repay Credit Pool current debt in full (interest first, then principal)
residual = gross proceeds - current debt
reward = min(1% of gross proceeds, residual)
owner payout = residual - reward
```

Gross liquidation proceeds means actual USDC received from the sale, before Credit Pool repayment and payouts. It is not oracle NAV or a pre-swap quote. At exact debt coverage, both reward and owner payout are zero.

### Shortfall liquidation

If gross proceeds are less than current debt, all proceeds go to the Credit Pool, applied to **principal first, then interest**. This differs intentionally from ordinary repayments and sufficient-proceeds liquidation, which pay interest first.

```text
P = remaining principal immediately before liquidation
I = accrued interest immediately before liquidation
S = actual gross USDC proceeds, where S < P + I

principal recovered = min(S, P)
interest recovered = min(max(S - P, 0), I)
principal loss = P - principal recovered
unpaid interest = I - interest recovered
shortfall = principal loss + unpaid interest = P + I - S
outstandingPrincipal decreases by P
liquidator reward = 0
owner payout = 0
```

Emit exactly one loss event on successful shortfall finalization, with the loss components explicitly split:

```solidity
event BadDebtRealized(
    uint256 indexed tokenId,
    uint256 principalLoss,
    uint256 unpaidInterest,
    uint256 shortfall
);
```

All amount fields use USDC base units, and `shortfall == principalLoss + unpaidInterest`. An interest-only shortfall still emits the event with `principalLoss == 0`. Sufficient-proceeds liquidation, including exact debt coverage, emits no `BadDebtRealized` event. A reverted attempt leaves no persisted loss event or realized-loss accounting.

The protocol treasury absorbs the economic loss; finalization does not require a synchronous treasury top-up. Only USDC actually recovered restores liquid lending capacity. Writing off principal does not create USDC.

The global counter removes the **entire remaining principal**, not the lifetime original borrowing amount. For example, after borrowing $50 and previously repaying $20 of principal, a position owes $30 principal plus $2 interest. If liquidation receives $25, return $25 to the pool, reduce `outstandingPrincipal` by $30, and emit a $7 shortfall consisting of $5 principal loss and $2 unpaid interest.

The required end-state is `outstandingPrincipalAfter == outstandingPrincipalBefore - P`. Recovered principal and written-off principal together account for this single decrease; do not subtract recovered principal and then subtract all of `P` again. Once the last active position's principal is repaid or removed by finalized liquidation, the counter reaches zero and the APR gate opens. Any principal still outstanding on another active position keeps the gate closed.

Settlement examples for `P = 30 USDC` and `I = 2 USDC` (display units, not raw event amounts):

| Gross proceeds | Pool receives | Principal loss | Unpaid interest | Total shortfall | Liquidator reward | Owner payout |
| -------------- | ------------- | -------------- | --------------- | --------------- | ----------------- | ------------ |
| 0              | 0             | 30             | 2               | 32              | 0                 | 0            |
| 25             | 25            | 5              | 2               | 7               | 0                 | 0            |
| 31             | 31            | 0              | 1               | 1               | 0                 | 0            |
| 32             | 32            | 0              | 0               | 0               | 0                 | 0            |
| 35             | 32            | 0              | 0               | 0               | 0.35              | 2.65         |

Each finalized row removes 30 USDC of remaining principal from the global counter. The zero-proceeds row applies only if execution can successfully satisfy its bounds with that outcome; it does not permit bypassing execution bounds.

No claim attaches to the current or any prior NFT owner. No other position's collateral or accounting is affected. The position is finalized and its NFT burned even though the Credit Pool recovered less than current debt.

The first-party keeper must submit these zero-reward liquidations when pricing and execution permit. It cannot guarantee immediate liquidation during an oracle, token, or execution outage.

No `$MARGINCALL` token incentive is required for liquidation.

---

## Normal close

The NFT owner may close subject to execution availability and full debt repayment. A normal close cannot write off debt; if the position cannot repay in full, it must receive external repayment/collateral or use the eligible liquidation path.

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

### Documented Base integration facts and feasibility gate

The [official Base integration documentation](https://docs.base.org/build-on-base/integrate-defi/list-tokenized-stocks) documents:

- NVDAc: `0xb20000000000000000000078ee7ce2fE4908108C`.
- Coinbase NVDA Chainlink proxy: `0x04689a41629776563E6822F76f2e57D148d28513`.
- The feed has 8 decimals and already includes the B20 multiplier in its total-return value; do not apply the multiplier again.
- Updates use a 0.5% deviation or 24-hour heartbeat during supported hours; values freeze off-hours and during corporate actions. A callable feed is not necessarily a usable price.
- B20 tokens are native precompiles with no deployed bytecode. Transfer policies and function pauses may reject underlying-token transfers independently of allowance.

These are documented facts checked during review, not verified deployment results. Before completing the mock-based core, perform a read-only/fork feasibility check: verify token units and adapter compatibility, feed and registry pause semantics, and an executable USDC/NVDAc Uniswap route in both directions at the intended size. In particular, prove that stock-preserving close can bound the stock sold while covering exact current debt. A conventional mock ERC-20 does not prove compatibility with native B20 tokens.

The executable route, current liquidity, practical slippage, token decimals, and precise freshness policy remain verification items. Pin verified results and the tested block in an integration record. Mocks must reflect those semantics. This feasibility gate does not authorize deployment, funding, or live trades.

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
- clear executor on transfer without consulting pricing or health;
- close positions;
- liquidate positions;
- coordinate NFT mint/burn.

### `PositionNFT`

OpenZeppelin ERC-721.

Responsibilities:

- represent ownership of each live position;
- support standard owner/approved-address/operator transfer authorization;
- transfer active positions independently of oracle availability and health;
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
- `BadDebtRealized(tokenId, principalLoss, unpaidInterest, shortfall)`

Liquidation outcome data must distinguish gross proceeds, principal recovered, interest recovered, principal loss, unpaid interest, reward, and owner payout, and identify the owner at finalization. Transfer history must retain the prior and new owner; terminal history cannot depend on `ownerOf` after burn.

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

The amounts below assume a fee-free mock execution rate equal to the oracle price. The execution-cost tests separately cover real post-execution leverage.

1. Fund Credit Pool with `500 USDC`.
2. Give owner mock NVDAc worth `100 USDC`.
3. Open at `1.5x`.
4. Verify Margin Call receives the original NVDAc.
5. Verify `50 USDC` is drawn from Credit Pool.
6. Verify mock execution converts it into more NVDAc held by Margin Call.
7. Verify position accounting shows approximately `150 USDC` of NVDAc, `50 USDC` principal, and `100 USDC` equity.
8. Verify Credit Pool liquid USDC falls by `50`.
9. Warp time and verify interest grows lazily.
10. Transfer the NFT to a second wallet and verify stock/debt remain unchanged, the old executor clears, and the previous owner/executor can no longer manage it.
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

Use a fee-free mock and no elapsed interest for these idealized sizing examples.

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
8. Shortfall-liquidate the last financed position after a partial principal repayment. Verify the entire remaining principal is removed, historical bad debt remains recorded, and the owner can change APR once the counter reaches zero.
9. Repeat with principal outstanding on a second position. Verify its principal is unchanged and APR updates still revert.

### Shared-custody accounting test

1. Open multiple positions.
2. Verify each position's `stockAmount` is independent.
3. Verify actions on one position cannot consume another position's stock accounting.
4. Verify aggregate recorded live stock never exceeds actual NVDAc held by Margin Call.

### Transfer availability and authorization tests

1. Transfer active zero-debt, healthy financed, liquidatable, and underwater positions.
2. Repeat with stale, frozen, invalid, and reverting oracle responses; transfer must not call the oracle.
3. Cover owner, approved-address, and operator authorization through `transferFrom` and both `safeTransferFrom` variants.
4. Verify executor appointment alone cannot transfer and NFT approval alone cannot manage or close a position.
5. Verify old owner/executor lose management authority and executor clearing precedes recipient callbacks.
6. Transfer a liquidatable position, then liquidate it with valid pricing. Eligibility is unchanged, and any residual goes to the new owner.
7. Verify transfer after close/liquidation fails because the NFT has been burned.

### Loss realization and failed-execution tests

1. Liquidate with proceeds above debt, exactly equal to debt, between principal and total debt, below principal, and zero if a successful bounded execution can produce that result.
2. Verify shortfall proceeds repay principal first, whereas ordinary repayments pay interest first.
3. Verify each settlement-table row, including $30 principal / $2 interest / $25 proceeds: pool receives $25, global principal falls by exactly $30, and the event records $5 principal loss, $2 unpaid interest, and $7 total shortfall in USDC base units. Verify one event for each shortfall, including interest-only loss, and none for exact/full coverage.
4. Verify zero reward and owner payout for shortfalls, no personal claim, terminal status, and NFT burn.
5. Verify unrelated positions' stock, principal, interest, and executors remain unchanged.
6. Verify removed principal is counted exactly once; realized loss does not create available credit and does not leave phantom principal blocking APR updates.
7. Force oracle, token, swap, and slippage failures. Verify atomic rollback with no burn, loss event, or accounting change.
8. Verify the keeper retries transient failures within configured bounds and surfaces persistent failures; zero reward does not exclude a position from its work. Run the same invalid-price, token-restriction, and slippage cases as both keeper and public caller: both must revert with identical accounting preservation.

### Execution, oracle, and administration tests

1. Reject the $100 deposit / $50 loan / $49 purchased-stock example because actual leverage exceeds 1.5x.
2. Verify cost-aware sizing can open/increase within the ceiling and failed post-execution validation rolls back the entire draw and swap.
3. Allow market/interest-driven leverage above 1.5x without automatic liquidation until maintenance is breached.
4. Cover every row of the unavailable-oracle action policy, including full-debt close and debt-free actions.
5. Cover zero NAV, zero equity, and negative equity without unsigned subtraction or division errors hiding liquidation eligibility; zero-debt positions remain exempt.
6. Verify immutable deployment parameters and absence of a protocol-admin NFT transfer pause.

### History and performance acceptance

1. Contributions and repayments affect the performance baseline; borrowed principal does not count as an owner contribution.
2. Transfer changes ownership without resetting position performance or inventing the buyer's purchase cost.
3. Closing/liquidation retains a historical page with final owner, asset flows, and outcome despite NFT burn.
4. Unavailable valuation is shown explicitly; stale marks are not presented as current P&L.

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

Wallet A opens the smallest practical real NVDAc position and appoints an executor. After interest has accrued, A transfers the NFT to wallet B. Display the unchanged stock/debt, verify A and its executor can no longer manage the position, then have B manage and close it and receive the residual stock/USDC. Record receipts and accounting before and after transfer.

This is the required transferability demonstration. A purchase payment is not part of this acceptance test; no functioning secondary market is claimed from the transfer alone.

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

Label P&L as **position performance since inception**. Adjust its baseline for owner-contributed NVDAc and externally supplied USDC repayments, and include value returned on exit. Borrowing is financing, not an owner contribution. Execution costs and accrued interest must be reflected without double counting.

NFT transfer neither resets this baseline nor supplies a buyer acquisition price. Do not present the metric as the current owner's investment return. Record actual asset flows and their valuation basis; when a required valuation is unavailable, display that limitation instead of inventing a price. Realized bad debt is a separate loss outcome, not owner profit.

Preserve thesis/history, ownership changes, asset flows, and final close/liquidation outcomes in an addressable historical page after burn. Capture the final owner before burning; a historical page cannot resolve ownership using `ownerOf` on a burned token.

Show unavailable pricing and known liquidation risk while keeping transfer actions available. Never use a stale-health display as an implicit transfer block.

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

A first-party NFT marketplace is not required. Standard ERC-721 transferability plus continued management and close by the new owner demonstrates the V1 primitive. Payment settlement and market demand remain outside that proof.

---

## Sponsor/product extensions

Do not let sponsor integrations block the core protocol.

### Dynamic

Use Dynamic for human onboarding/embedded wallet if useful. Existing agent wallets remain first-class and can own NFTs directly.

The retained repository helpers currently use Privy and Base Sepolia; Dynamic is not integrated, and those helpers do not establish mainnet readiness. Human wallet-provider selection remains an application integration choice and must not block the two-wallet protocol demonstration.

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
- Active NFT transfer is independent of oracle availability and health, including when liquidatable or underwater; transfer never resets debt or liquidation eligibility.
- NFT approvals and executor permissions are distinct; all transfer entry points clear the executor before recipient callbacks.
- Credit Pool repayment is senior to liquidator reward and owner residual equity.
- Successful shortfall liquidation applies proceeds to principal first, realizes treasury bad debt, removes remaining principal exactly once, and creates no claim against any owner or other position.
- Failed execution leaves the position unchanged; the required first-party keeper retries within bounds.
- Normal close sells only enough stock to repay current debt.
- Opening and leverage increase enforce the 1.5x ceiling after execution costs.
- APR cannot change while any principal is outstanding.
- Other deployment parameters are fixed; there is no protocol-admin transfer pause.
- Full liquidation only in V1.
- Prefer simple, restrictive functions over generalized call execution.

---

## Build order

### Phase 0 — Integration feasibility

- Verify documented token/feed addresses and units through read-only/fork checks.
- Pin total-return pricing, pause detection, and freshness semantics.
- Verify native B20 transfer/approval compatibility.
- Prove both execution directions and bounded debt-covering close at intended sizes.
- Record the verified route, block, liquidity, and limitations before finalizing mocks.

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
- Shortfall finalization, treasury loss accounting, and unrestricted active NFT transfer.
- First-party keeper with bounded retries, gas funding requirements, and failure visibility.
- Full Foundry lifecycle tests.

### Phase 2 — Base plumbing

- Real NVDAc.
- Chainlink adapter.
- Uniswap adapter.
- Real-USDC Credit Pool.
- Tiny live open, interest accrual, transfer to a second wallet, management, and close.

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
- partial liquidation;
- protocol liquidation fee;
- complex executor policy engine;
- generalized routing/execution;
- production governance/timelocks.

---

## Remaining implementation questions

The product decisions above are settled for this V1 proposal. The following implementation evidence and numerical choices must be recorded before the relevant phase proceeds:

1. Read-only/fork confirmation of documented token/feed addresses, token decimals, total-return normalization, and native B20 compatibility.
2. Exact executable Uniswap pool/route, practical slippage, and bounded debt-covering close behavior.
3. Precise price-age/pause rules consistent with the documented feed schedule; NFT transfers are never gated by them.
4. Validate the starting 30% maintenance equity ratio with a simulation before deployment, then fix the selected value for that deployment.
5. Integer precision and rounding for leverage, accrual, repayment, loss accounting, and fractional-interest remainder handling. Accrual frequency must not allow material interest avoidance.
6. Keeper polling/retry settings, gas budget, and persistent-failure reporting.
7. Demo Credit Pool funding amount and receipt-based live acceptance evidence.
8. Performance valuation conventions for contributions/withdrawals and unavailable-price handling, consistent with the since-inception definition.

These verification items do not reopen transfer availability, loss allocation, permission separation, or the two-owner demonstration. Any failure that requires changing those decisions must be surfaced explicitly.

---

## Product statement

> **Margin Call finances real NVDAc spot exposure and makes the financed position transferable. Deposit NVDAc, choose leverage from `1.0x` through `1.5x`, and Margin Call uses finite protocol-owned USDC to buy more NVDAc. The position accrues transparent borrow interest and can change owners without unwinding the trade, regardless of oracle availability or position health. Its existing liquidation risk follows the NFT.**
