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
- Chainlink total-return pricing for solvency, with explicit `LIVE`, `HELD`, and `INVALID` oracle states.
- Held/frozen Chainlink marks are informational only; they are never used to open/increase financed exposure or determine liquidation eligibility.
- Uniswap for NVDAc/USDC execution, with caller-supplied execution bounds on every owner/executor swap.
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

Opening and increasing leverage must size borrowing using bounded execution costs, then validate actual recorded stock and current debt against the same `LIVE` oracle observation. Equity must be positive and actual leverage must not exceed 1.5x. An out-of-bounds result reverts the entire transaction, including the draw and swap. The UI must show attainable estimates after costs; selecting the max preset is not a promise of exactly 1.500x execution.

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
openPosition(stockAmount, targetLeverage, minNvdaOut, deadline)
```

Margin Call atomically:

1. transfers NVDAc from the caller into `MarginCall`;
2. requires a `LIVE` Chainlink observation and values the contribution with the total-return feed;
3. validates `1.0x <= targetLeverage <= 1.5x`;
4. calculates required USDC principal;
5. if principal is greater than zero, verifies the Credit Pool has enough liquid USDC;
6. draws exactly that USDC from the Credit Pool;
7. swaps that USDC through the approved Uniswap execution path into NVDAc using the caller's `minNvdaOut` and `deadline` bounds;
8. keeps purchased NVDAc in `MarginCall` custody;
9. records the position's total NVDAc amount and principal;
10. for a financed opening, verifies actual post-execution leverage does not exceed 1.5x and maintenance is satisfied using the same `LIVE` observation; otherwise the whole transaction reverts;
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

If there is not enough Credit Pool USDC, the oracle is not `LIVE`, or the Uniswap swap fails / violates caller bounds, a financed opening reverts atomically.

The user never receives a standalone USDC loan.

---

## Increasing leverage

Conceptually:

```text
increaseLeverage(tokenId, targetLeverage, minNvdaOut, deadline)
```

Margin Call:

1. accrues interest through the current timestamp;
2. checks owner/executor authorization;
3. requires a `LIVE` Chainlink observation and values current NVDAc;
4. calculates current debt, equity, and leverage;
5. validates the higher target up to `1.5x`;
6. calculates additional principal required;
7. checks Credit Pool USDC capacity;
8. draws the additional USDC;
9. swaps it into NVDAc using the caller's `minNvdaOut` and `deadline`;
10. increases the position's recorded `stockAmount` and `principal`;
11. verifies actual post-execution leverage does not exceed 1.5x and maintenance is satisfied using the same `LIVE` observation; otherwise the whole transaction reverts.

Borrowed USDC may only buy NVDAc.

---

## Reducing leverage

### Intermediate target

Conceptually:

```text
reduceLeverage(tokenId, targetLeverage, minUsdcOut, deadline)
```

Reducing to an intermediate leverage target requires a `LIVE` oracle observation because the target itself is valuation-based.

Margin Call:

1. accrues interest;
2. checks owner/executor authorization;
3. requires a `LIVE` observation;
4. determines how much debt must be repaid to reach the requested lower leverage;
5. sells only the required NVDAc into USDC using the caller's `minUsdcOut` and `deadline`;
6. applies USDC to accrued interest first and principal second;
7. returns repayment to the Credit Pool;
8. decreases the position's recorded NVDAc amount and debt state;
9. verifies the result did not increase leverage relative to the pre-action state and is within rounding tolerance of the requested target.

### Reduce fully to `1.0x`

A full deleverage does not need a stock valuation because the required USDC output is exactly `currentDebt()`.

The preferred V1 execution is an exact-output NVDAc -> USDC swap:

```text
reduceToOne(tokenId, maxNvdaIn, deadline)
```

Margin Call requests exactly the current debt in USDC and the caller supplies the maximum NVDAc that may be sold. If the route requires more than `maxNvdaIn`, the transaction reverts. On success, current debt is repaid in full and the remaining NVDAc stays in the same NFT position.

If the verified live Uniswap route cannot support a bounded exact-output swap, V1 must not silently substitute an unbounded oracle-free sale. In that case, full deleverage while pricing is `HELD`/`INVALID` is disabled until the caller can provide an exact-input amount plus `minUsdcOut` that is guaranteed to repay current debt in full; failure to cover all debt reverts atomically.

Principal returned to the Credit Pool immediately becomes available for new financing.

### Adding collateral

The owner may deposit additional NVDAc into an active position. Credit only the actual received amount to that position's stock accounting. Adding collateral does not draw credit, automatically change principal, or require oracle pricing. Any displayed valuation or leverage remains unavailable until a `LIVE` observation returns.

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
NAV = oracle value of recorded NVDAc raw units using the Chainlink total-return price
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

Financed positions with zero or negative equity are also liquidatable when the oracle state is `LIVE`. Implement health checks without unsigned-subtraction or division failures at zero NAV/equity. A negative equity display does not create personal recourse against the owner.

A zero-debt `1.0x` position is not liquidatable for lender solvency.

### Risk-increasing actions

Before opening a financed position or increasing leverage, verify:

- for an increase, caller is owner or executor and the position is active;
- for an opening, the caller supplies the initial stock and receives the new NFT;
- target leverage is within `1.0x-1.5x`;
- oracle state is `LIVE` under the schedule-aware policy below;
- current debt includes elapsed interest;
- resulting position remains above maintenance;
- actual leverage after a successful opening/increase is at most 1.5x;
- sufficient Credit Pool USDC is available;
- execution buys only NVDAc and satisfies caller-supplied bounds.

### Risk-reducing actions

Risk-reducing behavior is explicit rather than delegated to an implementation-specific "when safe" rule:

- external-USDC repayment is always oracle-independent;
- adding NVDAc collateral is oracle-independent;
- an intermediate leverage target requires `LIVE` pricing because the target is valuation-based;
- full deleverage to `1.0x` may execute without a live price only through a caller-bounded sale that repays **all** current debt or reverts;
- financed close may execute without a live price only through a caller-bounded sale that repays **all** current debt or reverts;
- liquidation always requires `LIVE` pricing;
- lack of Credit Pool liquidity never blocks an action that returns capital to the pool.

### Oracle states and schedule-aware freshness

Chainlink is the solvency oracle. Uniswap spot price is never used to decide NAV, leverage, health, or liquidation.

The Coinbase NVDA feed is a total-return feed that intentionally holds its last value outside supported update windows and while the Coinbase oracle registry reports a corporate-action pause. Therefore `now - updatedAt` is **not**, by itself, a valid freshness rule.

`OracleAdapter` classifies every observation into exactly one state:

```text
LIVE
HELD
INVALID
```

`LIVE` means all of the following are true:

1. the Chainlink round is complete, has a positive answer, nonzero `updatedAt`, and no future timestamp;
2. the Coinbase oracle-registry pause flag is false;
3. the adapter can prove the current timestamp is inside a supported feed update window;
4. `updatedAt` satisfies the configured live-age bound for that update window; and
5. after any prior held/pause period, the feed has published a new qualifying round after the hold ended. Clearing a pause flag alone does not make the pre-pause value live.

`HELD` means the latest round is the last known good total-return mark but the feed is intentionally not updating because either:

- the current timestamp is in a documented scheduled hold window (for example nights, weekends, or a recognized market holiday); or
- the Coinbase oracle registry reports the feed paused for a corporate action.

A held mark may be displayed with its timestamp and reason, but it is never treated as a current solvency price. The adapter must not relabel an arbitrarily old round as `HELD`: for a scheduled hold, the round must be consistent with the most recent expected live window; for a corporate-action hold, it must be the last valid pre-pause round observed under the registry semantics.

`INVALID` means the adapter cannot prove `LIVE` or a legitimate `HELD` state. This includes a bad/incomplete round, non-positive answer, inconsistent/future timestamp, unavailable registry status, an unexpectedly old round during a supported update window, an unrecognized holiday/session state, or failure to establish the required post-hold fresh round.

The V1 schedule configuration and live-age constants are immutable deployment inputs pinned from the verified Base/Coinbase feed semantics. The adapter fails closed: if the implementation cannot prove the session/hold state, it returns `INVALID`, not `LIVE`. Do not infer `LIVE` merely because the feed contract remains callable.

### Per-function oracle-state matrix

`HELD` and `INVALID` have the same permissions for risk decisions; `HELD` additionally exposes a last-known-good mark for informational display.

| Function / action | `LIVE` | `HELD` | `INVALID` | Required execution bound / note |
| --- | --- | --- | --- | --- |
| Open zero-debt `1.0x` | Yes | Yes | Yes | No borrow or swap; pricing may be unavailable in UI. |
| Open financed position | Yes | No | No | Caller supplies `minNvdaOut` + `deadline`; post-execution leverage rechecked on same live observation. |
| Increase leverage | Yes | No | No | Caller supplies `minNvdaOut` + `deadline`. |
| Transfer active NFT | Yes | Yes | Yes | Must not call oracle or apply health gate. |
| Repay with external USDC | Yes | Yes | Yes | No swap required. |
| Add NVDAc collateral | Yes | Yes | Yes | Subject only to token-transfer availability. |
| Reduce to intermediate leverage target | Yes | No | No | Caller supplies `minUsdcOut` + `deadline`; target sizing requires live valuation. |
| Reduce fully to `1.0x` | Yes | Yes | Yes | Must repay all current debt. Prefer exact-output debt repayment with caller `maxNvdaIn` + `deadline`; otherwise bounded exact-input path must prove full repayment or revert. |
| Close zero-debt position | Yes | Yes | Yes | Subject only to token-transfer availability. |
| Close financed position | Yes | Yes | Yes | Must repay all current debt through caller-bounded execution; otherwise revert. |
| Liquidate | Yes | No | No | Eligibility is oracle-derived; execution also remains bounded. |
| Read current debt | Yes | Yes | Yes | Debt is time-based and does not need stock price. |
| Read NAV / equity / leverage / health | Current | Unavailable; may show held mark separately | Unavailable | UI/API must label state and timestamp explicitly. |

Interest continues to accrue while pricing is `HELD` or `INVALID`. Liquidation may therefore be delayed even as debt grows. NFT transfers and sale settlement are not paused by that condition.

Token pauses, policy restrictions, or execution failures may separately prevent moving underlying NVDAc. Those are distinct from oracle state and do not create a Margin Call oracle/health gate on NFT transfer.

### NVDAc valuation and total-return units

The Chainlink Coinbase NVDA feed already publishes **underlying equity price × B20 multiplier** as its total-return value. Margin Call must value the raw NVDAc balance directly against that total-return price and must **never apply the B20 multiplier a second time**.

Let:

```text
stockAmountRaw = recorded NVDAc base units
stockDecimals = NVDAc.decimals()
priceRaw = Chainlink total-return answer
feedDecimals = Chainlink feed decimals (documented as 8 for Coinbase stock feeds)
usdcDecimals = USDC decimals
```

Conceptually:

```text
valueUsdcBase =
    stockAmountRaw
    * priceRaw
    * 10^usdcDecimals
    / 10^stockDecimals
    / 10^feedDecimals
```

Implementation should use overflow-safe fixed-point math such as `Math.mulDiv` and one documented rounding direction. The exact same normalization helper must be used for opening, post-swap leverage checks, NAV, health, liquidation eligibility, and displayed protocol valuation.

Do **not** use `scaledBalanceOf`, `toScaledBalance`, or `multiplier()` as an additional valuation factor when using this total-return feed. The multiplier may be read separately only for non-valuation informational purposes such as showing underlying-share equivalents. Multiplying a scaled token balance by a total-return price would double-count the corporate-action multiplier.

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

Position pages and sale presentations must expose current debt and indicate `LIVE`, `HELD`, or `INVALID` pricing state plus the last price timestamp where available. A displayed held estimate is not a promise that stock, debt, or health is current. V1 proves transferability, not protected purchase settlement for a mutable position.

---

## Liquidation

Liquidation is permissionless for financed positions.

Conceptually:

```text
liquidate(tokenId)
```

V1 full liquidation:

1. accrue interest and snapshot the position's remaining principal, accrued interest, and current owner;
2. require a `LIVE` Chainlink observation and validate liquidation eligibility with it;
3. sell only this position's entire recorded NVDAc amount to USDC through the approved Uniswap path, subject to protocol and caller execution bounds;
4. apply the realized proceeds using the sufficient-proceeds or shortfall waterfall below;
5. remove the position's entire remaining principal from global `outstandingPrincipal` exactly once;
6. clear the active stock/debt/executor state and mark the position liquidated, retaining historical outcome data;
7. burn the NFT and emit the liquidation outcome.

Finalization cannot fail merely because realized proceeds are insufficient to repay debt. Execution must still succeed within bounds. If the token transfer or swap fails, oracle state is not `LIVE`, or slippage bounds are violated, the transaction reverts atomically and leaves the position active and unchanged for a later attempt. "Unconditional finalization" applies to the debt shortfall after successful execution; it is not permission to bypass those prerequisites.

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

The first-party keeper must submit these zero-reward liquidations when `LIVE` pricing and execution permit. It cannot guarantee immediate liquidation during an oracle, token, or execution outage or an expected feed hold.

No `$MARGINCALL` token incentive is required for liquidation.

---

## Normal close

The NFT owner may close subject to execution availability and full debt repayment. A normal close cannot write off debt; if the position cannot repay in full, it must receive external repayment/collateral or use the eligible liquidation path.

Default close preserves as much stock as possible.

For zero debt, `closePosition(tokenId)` simply returns all recorded NVDAc and burns the NFT.

For a financed position, the preferred V1 close is exact-output debt settlement:

```text
closePosition(tokenId, maxNvdaIn, deadline)
```

1. accrue interest and calculate `currentDebt()` in USDC;
2. request exactly that debt amount from the approved NVDAc -> USDC execution path;
3. allow the caller to cap stock sold with `maxNvdaIn` and bound time with `deadline`;
4. revert if the exact debt amount cannot be obtained within those bounds;
5. repay the Credit Pool in full;
6. return all remaining recorded NVDAc plus any residual USDC to the NFT owner;
7. mark the position closed;
8. burn the NFT.

Because the debt output is known without a stock price, this full-debt close is permitted while the oracle is `HELD` or `INVALID`. It must never use a held mark to calculate `maxNvdaIn`; that protection comes from the caller's execution bound. If the verified route cannot provide bounded exact-output execution, the fallback path must use caller-supplied stock input and `minUsdcOut` and must prove full debt repayment before finalization. Otherwise it reverts.

Example with a live display mark:

```text
Before close
NVDAc value           $180
Principal              $50
Accrued interest        $2
Current debt           $52
Net equity            $128

Close
sell at most caller-approved NVDAc to receive exactly $52 USDC
repay $52 to Credit Pool
return remaining NVDAc to owner
burn NFT
```

### External repayment

The owner may send USDC through `repay(tokenId, amount)` before closing in any oracle state.

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

For V1, expose a single NVDAc observation rather than a bare price:

```text
getNvdaObservation()
  -> priceRaw
  -> updatedAt
  -> state: LIVE | HELD | INVALID
  -> holdReason: NONE | SCHEDULED | CORPORATE_ACTION | UNKNOWN
```

Responsibilities:

- read the Coinbase NVDA Chainlink proxy through `latestRoundData()`;
- read the Coinbase onchain oracle-registry pause state required to distinguish a corporate-action hold;
- apply the immutable V1 supported-window/live-age policy;
- require a new qualifying round after a hold before returning `LIVE`;
- return `HELD` only when the adapter can prove a legitimate scheduled or corporate-action hold;
- fail closed to `INVALID` when state cannot be established;
- normalize raw NVDAc units against the total-return feed using the single valuation rule in this PRD;
- never multiply the total-return feed by the B20 multiplier again.

### Documented Base integration facts and feasibility gate

The [official Base integration documentation](https://docs.base.org/build-on-base/integrate-defi/list-tokenized-stocks) documents:

- NVDAc: `0xb20000000000000000000078ee7ce2fE4908108C`.
- Coinbase NVDA Chainlink proxy: `0x04689a41629776563E6822F76f2e57D148d28513`.
- Coinbase onchain oracle registry: `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD`.
- The feed has 8 decimals and publishes total-return values. It reads the B20 multiplier itself, so Margin Call values **raw NVDAc units × total-return price** and never applies the multiplier separately.
- The registry exposes the multiplier plus a pause flag. When paused, the feed stops publishing and holds the last known good value.
- During supported update hours the feed updates on a 0.5% deviation or at least every 24 hours; outside those hours, on weekends/holidays, and during corporate actions, `updatedAt` may stop advancing while the feed contract remains callable.
- During a corporate action the feed remains frozen until Coinbase confirms both the underlying price and multiplier are coherent; the adapter must require a new qualifying post-pause round before returning `LIVE`.
- B20 tokens are native precompiles with no deployed bytecode. Transfer policies and function pauses may reject underlying-token transfers independently of allowance.

These are documented facts checked during review, not verified deployment results. Before completing the mock-based core, perform a read-only/fork feasibility check that pins the exact supported update-window interpretation, live-age/grace constants, registry ABI/pause semantics, token decimals/units, and an executable USDC/NVDAc Uniswap route in both directions at the intended size.

The integration record must include observed transitions for at least:

- a qualifying `LIVE` round;
- a scheduled held period;
- registry `paused == true` or a forked/mock equivalent of the corporate-action state;
- return from held to `LIVE` only after a new round;
- a live-window observation older than the permitted live-age bound becoming `INVALID`.

In particular, prove that stock-preserving close/full deleverage can repay an exact USDC debt amount under caller-supplied `maxNvdaIn` bounds, or explicitly use the documented bounded exact-input fallback. A conventional mock ERC-20 does not prove compatibility with native B20 tokens.

Pin verified results and the tested block in an integration record. Mocks must reflect those semantics. This feasibility gate does not authorize deployment, funding, or live trades.

No generalized asset registry is required.

### `ExecutionAdapter`

For V1, only two directions exist:

```text
USDC -> NVDAc
NVDAc -> USDC
```

Requirements:

- fixed approved tokens;
- fixed recipient/settlement path;
- no arbitrary output token;
- no arbitrary recipient;
- no unrestricted caller-supplied route;
- every owner/executor swap includes caller-supplied amount/deadline bounds;
- risk-increasing exact-input USDC -> NVDAc uses caller `minNvdaOut`;
- intermediate deleverage exact-input NVDAc -> USDC uses caller `minUsdcOut`;
- oracle-independent full-debt close/deleverage prefers exact-output USDC with caller `maxNvdaIn`;
- protocol liquidation has its own immutable/configured slippage floor derived from a `LIVE` oracle and may additionally accept a stricter caller bound, but may never execute unbounded.

The adapter returns actual input/output amounts so Margin Call updates per-position stock and debt accounting from realized execution, not quoted amounts.

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
- calculate debt/equity/leverage/health only from `LIVE` solvency marks;
- increase/reduce leverage;
- accept direct repayment;
- manage one executor per position;
- clear executor on transfer without consulting pricing or health;
- close positions with full-debt caller-bounded execution when financed;
- liquidate positions only with `LIVE` pricing;
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

Single NVDAc Chainlink total-return pricing/state adapter.

### `ExecutionAdapter`

Single NVDAc/USDC Uniswap execution adapter with bounded exact-input/exact-output paths required by the matrix above.

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
- `MockOracleAdapter` with `LIVE`, scheduled `HELD`, corporate-action `HELD`, and `INVALID` states
- `MockExecutionAdapter` supporting bounded exact-input and exact-output execution

### Canonical lifecycle test

The amounts below assume a fee-free mock execution rate equal to the oracle price. The execution-cost tests separately cover real post-execution leverage.

1. Fund Credit Pool with `500 USDC`.
2. Give owner mock NVDAc worth `100 USDC`.
3. Open at `1.5x` with a `LIVE` observation and caller `minNvdaOut`.
4. Verify Margin Call receives the original NVDAc.
5. Verify `50 USDC` is drawn from Credit Pool.
6. Verify mock execution converts it into more NVDAc held by Margin Call.
7. Verify position accounting shows approximately `150 USDC` of NVDAc, `50 USDC` principal, and `100 USDC` equity.
8. Verify Credit Pool liquid USDC falls by `50`.
9. Warp time and verify interest grows lazily.
10. Transfer the NFT to a second wallet and verify stock/debt remain unchanged, the old executor clears, and the previous owner/executor can no longer manage it.
11. Reduce leverage with caller bounds and verify NVDAc is sold and principal returns to Credit Pool.
12. Increase leverage again if capacity and `LIVE` pricing exist.
13. Put oracle into `HELD`, close with caller `maxNvdaIn`, and verify only enough NVDAc is sold to repay current debt while remaining NVDAc returns to the owner.
14. Open another position, push a `LIVE` oracle price below maintenance, liquidate, repay Credit Pool first, pay liquidator reward, return residual equity, and burn NFT.

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
4. Reduce through an intermediate target with `LIVE` pricing and `minUsdcOut`.
5. Reduce to `1.0x` and verify exact current debt is repaid under `maxNvdaIn` without replacing the NFT.
6. Verify targets below `1.0x` or above `1.5x` revert.
7. Verify a valid non-preset target works.

### Interest test

1. Open with `50 USDC` principal at `10% APR`.
2. Warp `30 days`.
3. Verify `currentDebt()` is approximately `50.411 USDC` subject to rounding.
4. Verify no keeper transaction was needed.
5. Partially repay and verify interest is repaid before principal.
6. Verify health uses current debt when pricing is `LIVE` and is unavailable rather than stale when pricing is not live.

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
2. Repeat with `HELD`, `INVALID`, and reverting oracle responses; transfer must not call the oracle.
3. Cover owner, approved-address, and operator authorization through `transferFrom` and both `safeTransferFrom` variants.
4. Verify executor appointment alone cannot transfer and NFT approval alone cannot manage or close a position.
5. Verify old owner/executor lose management authority and executor clearing precedes recipient callbacks.
6. Transfer a liquidatable position, then liquidate it after `LIVE` pricing returns. Eligibility is unchanged, and any residual goes to the new owner.
7. Verify transfer after close/liquidation fails because the NFT has been burned.

### Oracle-state, schedule, and valuation tests

1. Exercise every row of the per-function `LIVE` / `HELD` / `INVALID` matrix.
2. During a supported update window, accept a qualifying recent round as `LIVE`; reject an observation older than the configured live-age bound as `INVALID`.
3. During a recognized scheduled hold, classify the last qualifying close as `HELD` rather than pretending it is live merely because `updatedAt` is old.
4. With registry pause asserted, classify the last known good observation as corporate-action `HELD` and block opening financed positions, increases, intermediate target deleverage, and liquidation.
5. Clear the pause flag without publishing a new round and verify the adapter does **not** return `LIVE`; publish a new qualifying post-pause round and then allow `LIVE`.
6. Use an unrecognized holiday/session condition and verify the adapter fails closed to `INVALID` rather than guessing `LIVE`.
7. Verify debt reads, external repayment, collateral addition, zero-debt close/open, NFT transfer, full deleverage, and financed full-debt close behave exactly as the matrix specifies while held/invalid.
8. Test full-debt close and full deleverage with adversarial execution. A caller `maxNvdaIn` or `minUsdcOut` violation must revert atomically; a held oracle price must never be used as the execution bound.
9. Test intermediate deleverage with `LIVE` pricing and caller `minUsdcOut`; held/invalid pricing must revert before execution.
10. Choose a mock non-1 B20 multiplier and a total-return price that already includes it. Verify `raw stock units × total-return price` produces the expected NAV and that any second multiplier application would fail the test. Cover token/feed decimal normalization and rounding explicitly.
11. Verify opening, post-swap leverage, health, and liquidation all use the same raw-unit total-return valuation helper.

### Loss realization and failed-execution tests

1. Liquidate with proceeds above debt, exactly equal to debt, between principal and total debt, below principal, and zero if a successful bounded execution can produce that result.
2. Verify shortfall proceeds repay principal first, whereas ordinary repayments pay interest first.
3. Verify each settlement-table row, including $30 principal / $2 interest / $25 proceeds: pool receives $25, global principal falls by exactly $30, and the event records $5 principal loss, $2 unpaid interest, and $7 total shortfall in USDC base units. Verify one event for each shortfall, including interest-only loss, and none for exact/full coverage.
4. Verify zero reward and owner payout for shortfalls, no personal claim, terminal status, and NFT burn.
5. Verify unrelated positions' stock, principal, interest, and executors remain unchanged.
6. Verify removed principal is counted exactly once; realized loss does not create available credit and does not leave phantom principal blocking APR updates.
7. Force oracle, token, swap, and slippage failures. Verify atomic rollback with no burn, loss event, or accounting change.
8. Verify the keeper retries transient failures within configured bounds and surfaces persistent failures; zero reward does not exclude a position from its work. Run the same invalid-price, token-restriction, and slippage cases as both keeper and public caller: both must revert with identical accounting preservation.

### Execution and administration tests

1. Reject the $100 deposit / $50 loan / $49 purchased-stock example because actual leverage exceeds 1.5x.
2. Verify cost-aware sizing can open/increase within the ceiling and failed post-execution validation rolls back the entire draw and swap.
3. Allow market/interest-driven leverage above 1.5x without automatic liquidation until maintenance is breached under a `LIVE` observation.
4. Cover zero NAV, zero equity, and negative equity without unsigned subtraction or division errors hiding liquidation eligibility; zero-debt positions remain exempt.
5. Verify immutable deployment parameters and absence of a protocol-admin NFT transfer pause.

### History and performance acceptance

1. Contributions and repayments affect the performance baseline; borrowed principal does not count as an owner contribution.
2. Transfer changes ownership without resetting position performance or inventing the buyer's purchase cost.
3. Closing/liquidation retains a historical page with final owner, asset flows, and outcome despite NFT burn.
4. `HELD` marks are labeled with timestamp/reason and never presented as current P&L/health; `INVALID` valuation is shown as unavailable.

---

## Live Base spike

After local tests are green, validate only the plumbing required for the demo.

### 1. NVDAc + Chainlink

Verify and pin in an integration record:

- NVDAc token address and decimals;
- selected Chainlink proxy and 8-decimal answer normalization;
- Coinbase oracle-registry address/ABI and pause flag behavior;
- the exact supported update-window/session interpretation used onchain;
- live-age/grace constants consistent with the documented deviation/heartbeat behavior;
- a scheduled held period and the age/timestamp of its last close;
- corporate-action held behavior or an equivalent forked registry state;
- requirement for a new round after a hold before returning to `LIVE`;
- raw-units × total-return-price valuation with no second multiplier application;
- native B20 transfer/policy/pause compatibility.

### 2. Uniswap

Verify:

- minimal USDC -> NVDAc exact-input swap with `minNvdaOut`;
- minimal NVDAc -> USDC exact-input swap with `minUsdcOut`;
- bounded exact-output NVDAc -> USDC for a known debt amount with `maxNvdaIn`, if supported by the selected route;
- Margin Call custody/approvals;
- practical bounds/slippage at the intended demo size.

If bounded exact-output is unavailable, record the exact bounded fallback used for held/invalid full-debt close/deleverage and prove it cannot finalize with unpaid debt.

### 3. Credit Pool

- fund with a small amount of real USDC;
- verify available credit;
- draw for one tiny position;
- repay/close and verify USDC returns.

### 4. Tiny end-to-end position

Wallet A opens the smallest practical real NVDAc position and appoints an executor. After interest has accrued, A transfers the NFT to wallet B. Display the unchanged stock/debt, verify A and its executor can no longer manage the position, then have B manage and close it and receive the residual stock/USDC. Record receipts and accounting before and after transfer.

If the demo crosses a `HELD` feed period, the UI must visibly show that state. Financing increases/liquidation remain disabled, while the bounded full-debt close path remains usable if the execution integration has passed its acceptance test.

This is the required transferability demonstration. A purchase payment is not part of this acceptance test; no functioning secondary market is claimed from the transfer alone.

A live liquidation can be demonstrated on a fork/local environment if intentionally pushing a real position into liquidation is impractical.

---

## Human and agent interface

### Human app

The primary open-position UI should show:

```text
NVDAc deposit value
Oracle state + last update
Leverage presets
Currently available credit
Current financeable max leverage
Borrow APR
Estimated gross exposure
Estimated principal
Estimated health
```

Example while live:

```text
Oracle                LIVE
Deposit               $100 NVDAc
Credit available       $20 USDC
Protocol max           1.50x
Available max          1.20x
Borrow APR             10%
```

When state is `HELD`, show the last mark, timestamp, and hold reason as informational and disable any action that the matrix marks unavailable. When state is `INVALID`, do not display stale NAV/P&L/health as current.

Disable leverage choices that cannot currently be financed.

### Position page

Show:

- living NFT/character art;
- owner;
- executor;
- NVDAc raw amount and value when live;
- oracle state, last update, and hold reason;
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

Show `HELD`/`INVALID` pricing and known liquidation risk while keeping transfer actions available. Never use a held-health display as an implicit transfer block.

### Agent interface

Keep the agent surface small:

- `get_credit_pool`
- `get_position`
- `get_health`
- `open_position`
- `increase_leverage`
- `reduce_leverage`
- `reduce_to_one`
- `repay`
- `set_executor`
- `close_position`

Position/health responses include oracle state, price timestamp, and hold reason. Agent actions that execute swaps require the same caller-supplied bounds as direct contract calls.

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

Character state can be derived from P&L, health, and lifecycle status only when valuation is live; while the oracle is held/invalid, preserve the last known visual state and visibly mark pricing unavailable/held rather than implying a current risk state.

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
- All financed health/liquidation decisions require a `LIVE`, schedule-aware oracle observation; held marks are informational only.
- A callable Chainlink feed is not necessarily live. Registry pause state, supported update window, round age, and post-hold new-round requirements are all enforced by `OracleAdapter`.
- NVDAc valuation is raw token units × Chainlink total-return price with decimal normalization. The B20 multiplier is never applied a second time.
- Chainlink determines solvency; Uniswap is execution only.
- Every owner/executor swap is caller-bounded; oracle-free full-debt close/deleverage may never use a held oracle mark as a slippage bound.
- Owner/executor permissions are narrow.
- NFT transfer clears the old executor.
- Active NFT transfer is independent of oracle availability and health, including when liquidatable or underwater; transfer never resets debt or liquidation eligibility.
- NFT approvals and executor permissions are distinct; all transfer entry points clear the executor before recipient callbacks.
- Credit Pool repayment is senior to liquidator reward and owner residual equity.
- Successful shortfall liquidation applies proceeds to principal first, realizes treasury bad debt, removes remaining principal exactly once, and creates no claim against any owner or other position.
- Failed execution leaves the position unchanged; the required first-party keeper retries within bounds.
- Normal close repays current debt in full and preserves remaining stock.
- Opening and leverage increase enforce the 1.5x ceiling after execution costs.
- APR cannot change while any principal is outstanding.
- Other deployment parameters are fixed; there is no protocol-admin transfer pause.
- Full liquidation only in V1.
- Prefer simple, restrictive functions over generalized call execution.

---

## Build order

### Phase 0 — Integration feasibility

- Verify documented token/feed/registry addresses and units through read-only/fork checks.
- Pin the schedule-aware `LIVE` / `HELD` / `INVALID` state machine, including supported update windows, live-age/grace constants, registry pause detection, and post-hold new-round requirement.
- Verify raw-unit × total-return-price normalization and prove the multiplier is not applied twice.
- Verify native B20 transfer/approval compatibility.
- Prove both execution directions, caller-supplied bounds, and bounded exact-debt close/full-deleverage at intended sizes.
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
- Stock-preserving bounded close.
- Permissionless liquidation + 1% liquidator reward.
- Shortfall finalization, treasury loss accounting, and unrestricted active NFT transfer.
- First-party keeper with bounded retries, gas funding requirements, and failure visibility.
- Full Foundry lifecycle plus oracle-state/valuation/bounds tests.

### Phase 2 — Base plumbing

- Real NVDAc.
- Schedule-aware Chainlink/registry adapter.
- Bounded Uniswap adapter.
- Real-USDC Credit Pool.
- Tiny live open, interest accrual, transfer to a second wallet, management, and close.

### Phase 3 — App/agent demo

- Human onboarding.
- Capacity-aware leverage UI.
- Oracle-state-aware position dashboard/page.
- Agent tools with explicit execution bounds.
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

1. Read-only/fork confirmation of documented token/feed/registry addresses, token decimals, total-return normalization, and native B20 compatibility.
2. Exact executable Uniswap pool/route, practical slippage, exact-output support, and bounded debt-covering close behavior.
3. Exact immutable supported-window/session source plus live-age/grace constants used by `OracleAdapter`. The behavior is already fixed: unproven state is `INVALID`, scheduled/corporate-action holds are never solvency marks, and return to `LIVE` requires a new qualifying round.
4. Validate the starting 30% maintenance equity ratio with a simulation before deployment, then fix the selected value for that deployment.
5. Integer precision and rounding for leverage, raw-unit total-return valuation, accrual, repayment, loss accounting, and fractional-interest remainder handling. Accrual frequency must not allow material interest avoidance.
6. Keeper polling/retry settings, gas budget, and persistent-failure reporting.
7. Demo Credit Pool funding amount and receipt-based live acceptance evidence.
8. Performance valuation conventions for contributions/withdrawals and held/invalid-price handling, consistent with the since-inception definition.

These verification items do not reopen the oracle action matrix, raw-unit total-return valuation rule, transfer availability, loss allocation, permission separation, or the two-owner demonstration. Any integration evidence that requires changing those decisions must be surfaced explicitly.

---

## Product statement

> **Margin Call finances real NVDAc spot exposure and makes the financed position transferable. Deposit NVDAc, choose leverage from `1.0x` through `1.5x`, and Margin Call uses finite protocol-owned USDC to buy more NVDAc. The position accrues transparent borrow interest and can change owners without unwinding the trade, regardless of oracle availability or position health. Solvency actions use only a schedule-aware live total-return mark; held/frozen marks are informational, and bounded full-debt repayment paths remain available without relying on stale prices.**
