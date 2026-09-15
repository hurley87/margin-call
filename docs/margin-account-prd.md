# Margin Call — Transferable Financed Spot Positions PRD

## Summary

Margin Call finances real tokenized equities on Base and turns each financed spot position into a transferable ERC-721.

The canonical V1 flow is deliberately narrow:

1. A user or agent already owns an approved Coinbase B20 stock such as NVDAc.
2. They deposit that stock into Margin Call.
3. They choose leverage up to the configured maximum, initially `1.5x`.
4. Margin Call values the deposited stock with the approved oracle.
5. Margin Call draws USDC from its Credit Vault.
6. That USDC is atomically swapped through Uniswap into **more of the same stock**.
7. The resulting stock remains inside an isolated Position Account.
8. The USDC financing accrues simple interest at the current protocol APR while debt is outstanding.
9. Margin Call mints a Position NFT representing ownership/control of the entire live financed account.
10. The NFT may be transferred or sold without selling the stock or refinancing the debt; accrued interest remains attached to the position.
11. On a normal close, Margin Call sells only enough stock to repay principal, accrued interest, and required fees, returns the remaining stock to the current NFT owner, and burns the NFT. If debt was already repaid with external USDC, the stock can be returned without a sale. Liquidation remains a full unwind.

The user never receives borrowed USDC as freely spendable capital. Margin Call exposes **leveraged spot ownership**, not a general-purpose credit line.

The core product thesis is:

> **Margin Call creates a secondary market for financed spot positions.**

This is distinct from perpetual futures. Perps provide synthetic price exposure that is ultimately opened and closed on the derivatives venue. Margin Call finances ownership of the actual onchain stock token, and the entire asset-plus-debt position can change owners without being unwound.

---

## Product thesis

Tokenized equities make real financial assets composable onchain. Existing agents can already hold wallets, discover markets, and execute trades. Existing derivatives venues can also give those agents leveraged synthetic exposure.

Margin Call should not compete by merely offering another way to obtain leveraged stock exposure.

Its differentiator is **financed spot ownership plus transferability**.

```text
Perpetual position

collateral
   -> synthetic leveraged exposure
   -> close position
   -> settle P&L
```

```text
Margin Call position

real tokenized stock
   -> deposit stock
   -> finance more of the same stock
   -> live financed spot position
   -> ERC-721 ownership
              |
              +-> hold
              +-> deleverage
              +-> repay
              +-> close
              `-> sell the entire live position to another owner
```

A Margin Call NFT is therefore not just a receipt or collectible wrapper. It is the ownership/control primitive for a live account containing:

- actual B20 stock;
- USDC-denominated principal;
- accrued borrow interest;
- current equity;
- liquidation state;
- an optional agent executor;
- thesis/history used by the product layer.

The debt, including accrued interest, remains attached to the account when the NFT changes hands.

---

## V1 scope

V1 is intentionally restrictive:

- Base only.
- Long only.
- One stock per position.
- Position opens by depositing an approved B20 stock.
- Margin Call lends USDC only to buy **more of that same stock**.
- Borrowed USDC is never freely withdrawable.
- Maximum gross leverage initially `1.5x`.
- One protocol-wide borrow APR, initially `10%` for the hackathon/demo.
- The contract owner/admin may update the borrow APR prospectively, subject to a hard V1 maximum of `50% APR`.
- APR changes never retroactively reprice elapsed time.
- Simple linear interest; no compounding.
- Interest accrues lazily using a cumulative rate accumulator; no periodic onchain keeper transaction is required.
- Approved Coinbase B20 tokenized equities only.
- Chainlink-approved pricing for solvency.
- Uniswap for spot execution.
- Full liquidation only.
- Protocol-funded USDC Credit Vault initially.
- Standard ERC-721 position ownership.
- Human-owned, agent-managed, and fully agent-owned positions all supported.

The hackathon goal is to prove the primitive end to end locally and then execute a minimal real position on Base.

---

## Goals

### Primary goals

- Finance actual tokenized-stock ownership rather than synthetic exposure.
- Let a stock holder increase spot exposure without selling their original stock first.
- Ensure borrowed USDC can only acquire more of the position's configured stock.
- Charge a legible financing cost while debt remains outstanding.
- Keep every financed position isolated and independently liquidatable.
- Represent ownership as a standard transferable ERC-721.
- Allow the entire financed position to change owners without unwinding stock or refinancing debt.
- Support any wallet-enabled agent, not only one specific agent runtime.
- Use OpenZeppelin standards where possible, especially ERC-721 and ERC-4626.
- Keep Dynamic, Uniswap, Flash, Bankr, and other providers as modular adapters rather than protocol dependencies.

### Hackathon success criteria

A complete demo must prove:

1. The Credit Vault is seeded with USDC.
2. A wallet starts with an approved B20 stock.
3. The wallet deposits that stock into Margin Call.
4. Margin Call values the deposit using the approved oracle.
5. Margin Call draws USDC credit from the Credit Vault according to the chosen leverage.
6. The borrowed USDC is atomically swapped into more of the **same** B20 stock.
7. A Position Account holds the combined stock inventory and records USDC principal.
8. Borrow interest accrues over elapsed time without requiring periodic write transactions.
9. The owner/admin can update the borrow APR and the new rate applies only from the update timestamp forward.
10. A Position NFT is minted to the owner.
11. The live position page shows stock exposure, principal, accrued interest, current debt, APR, equity, P&L, leverage, health, thesis, and dynamic NFT art.
12. The NFT can be transferred to a second wallet while the underlying stock and debt remain unchanged.
13. The old owner and old executor lose control after transfer.
14. The new NFT owner gains control of the same financed account and inherits its current debt obligation.
15. The owner can reduce leverage, repay, or close the position while preserving as much of the underlying stock exposure as possible.
16. A simulated price decline or enough elapsed interest can make the account liquidatable.
17. A permissionless liquidator can unwind the account, repay the vault first, collect the configured reward, return residual equity, and burn the NFT.
18. At least one tiny live Base position uses real USDC, a supported B20 stock, Chainlink pricing, and Uniswap execution.

---

## Non-goals for V1

The following are intentionally out of scope:

- Short positions.
- Borrowing B20 stock inventory.
- Multi-stock positions or baskets.
- Cross-margin between positions.
- Letting borrowed USDC purchase a different stock.
- Letting borrowed USDC leave the Position Account.
- General-purpose lending.
- Public permissionless LP deposits.
- Utilization-based or automatically variable interest-rate curves.
- Per-stock borrow rates.
- Compounding interest.
- Partial liquidations.
- Portfolio margin.
- Governance.
- Using `$MARGINCALL` as collateral.
- Requiring `$MARGINCALL` to use the protocol.
- A full first-party NFT marketplace.
- Autonomous strategy generation or cron-driven trading inside Margin Call.

---

## Actors

### Position owner

The wallet that owns the Position NFT.

The owner may:

- deposit the initial approved stock;
- add more of the same stock as collateral;
- add USDC for repayment/deleveraging;
- increase leverage within protocol limits;
- reduce leverage;
- appoint or revoke an executor;
- transfer or sell the Position NFT while the account is transferable;
- repay debt;
- close the account and receive residual stock/equity.

The owner may be:

- a human user's Dynamic embedded wallet;
- any external wallet;
- an AI agent wallet directly.

### Executor

An optional wallet authorized to manage trading actions for a position.

The executor may:

- increase exposure within the configured leverage limit;
- reduce exposure;
- repay debt;
- place supported advanced orders where enabled;
- update the application-layer thesis.

The executor may not:

- transfer the NFT;
- change ownership;
- withdraw residual equity;
- change the configured stock;
- borrow USDC for another asset;
- transfer borrowed USDC elsewhere;
- loosen protocol risk limits.

A position may be self-managed by setting owner and executor to the same wallet.

### Liquidator

Any address may call `liquidate(positionId)` when the account is below the liquidation threshold.

The contracts, not the liquidator, determine whether liquidation is valid.

### Credit Vault depositor

For V1, the Margin Call treasury is the intended depositor.

The vault still uses ERC-4626 so external LPs can be enabled later without replacing the core credit primitive.

### Protocol owner/admin

For the hackathon, the deployed protocol owner/admin controls explicit risk/economic configuration including the global borrow APR.

The owner/admin may:

- update the borrow APR up to the hard `50% APR` V1 ceiling;
- configure other explicitly admin-controlled risk parameters described by the protocol.

APR changes are forward-looking only. The admin cannot rewrite interest that has already accrued under a previous rate.

Longer term this authority should move behind a timelock and/or a dedicated risk-admin role rather than remain an unrestricted hot-wallet owner action.

---

## Position model

### One NFT = one stock = one isolated financed position

Each live position contains exactly:

- one approved B20 stock;
- an optional transient USDC balance from execution/deleveraging;
- USDC principal owed to the Credit Vault;
- accrued borrow interest;
- risk/accounting state;
- an optional executor;
- application-layer metadata/thesis/history.

A user may own many positions simultaneously.

```text
Owner 0xUSER
  |
  |-- NFT #184 -> NVDAc PositionAccount
  |-- NFT #231 -> AAPLc PositionAccount
  `-- NFT #402 -> COINc PositionAccount
```

Positions do not share collateral.

### Position Account

Each NFT maps to an isolated `PositionAccount`, preferably factory-deployed as a minimal clone.

The Position Account is a custody/execution container. It is not the risk engine.

It holds the financed stock and any temporary USDC generated by approved execution.

```text
PositionNFT #184
      |
      v
PositionAccount #184
  - NVDAc
  - temporary USDC if needed
      |
      v
Debt record -> CreditVault
```

### Debt state

V1 keeps the debt model deliberately simple while still allowing forward-looking APR updates.

Per position, track conceptually:

```text
principal
accruedInterestStored
rateAccumulatorSnapshot
```

Protocol-wide rate state tracks conceptually:

```text
borrowApr
cumulativeRateSeconds
lastRateUpdateAt
```

For the hackathon/demo, `borrowApr` starts at `10% APR`.

The cumulative rate accumulator lets a position account for multiple historical APR periods without iterating over every position when the admin changes the global rate.

When the APR changes, the protocol first advances `cumulativeRateSeconds` from `lastRateUpdateAt` to the current timestamp using the **old** APR, then stores the new APR and timestamp. Positions therefore preserve all interest earned under prior rates and begin accruing at the new rate only from that point forward.

### Why the account may temporarily hold USDC

USDC may exist transiently when:

- selling stock to reduce leverage;
- selling only enough stock to repay debt during a normal close;
- selling stock during liquidation;
- receiving proceeds from an advanced order.

That USDC is not general-purpose user cash while debt is outstanding. It is used through Margin Call's approved lifecycle to repay debt or settle the account.

---

## Canonical opening flow

The default V1 opening experience starts with stock, not cash.

Example:

```text
User owns            $100 NVDAc
Target leverage      1.5x
Maximum new debt      $50 USDC
Current borrow APR         10%
```

The user calls conceptually:

```text
openPosition(
  asset = NVDAc,
  stockAmount = ...,
  targetLeverage = 1.5x
)
```

Margin Call atomically:

1. Transfers the deposited NVDAc into a new Position Account.
2. Values the deposited NVDAc using the approved oracle.
3. Calculates maximum allowable USDC debt for the chosen leverage.
4. Draws the required USDC from the Credit Vault.
5. Swaps that USDC through the approved execution adapter into NVDAc.
6. Sends the purchased NVDAc to the same Position Account.
7. Records the USDC principal and current rate-accumulator snapshot.
8. Mints the Position NFT to the owner.

Expected result:

```text
Position #184

NVDAc gross value       $150
USDC principal           $50
Accrued interest          $0
Current debt             $50
Borrow APR               10%
Net equity              $100
Gross leverage          1.50x
```

If the swap cannot execute within the configured slippage bound, the leveraged opening should revert rather than leave a partially financed position.

### No visible borrow step

The owner/agent should not experience:

```text
borrow 50 USDC
-> wallet receives USDC
-> choose what to buy
```

Instead, the economic action is:

```text
increase NVDAc exposure to 1.5x
```

USDC debt exists internally because the Credit Vault is denominated in USDC, but the protocol immediately routes that credit into the configured stock.

---

## Increasing and reducing leverage

### Increase leverage

A healthy position may increase exposure up to the configured maximum.

Conceptually:

```text
increaseLeverage(tokenId, targetLeverage)
```

Margin Call:

1. accrues interest through the current global rate accumulator;
2. values the account using current debt;
3. calculates additional allowable principal;
4. draws USDC from the Credit Vault;
5. swaps USDC into the position's configured stock;
6. keeps the purchased stock in the Position Account;
7. records the additional principal and updated rate-accumulator snapshot.

Credit cannot be redirected to another token.

### Reduce leverage

Conceptually:

```text
reduceLeverage(tokenId, targetLeverage)
```

Margin Call:

1. accrues interest through the current global rate accumulator;
2. calculates how much debt must be repaid;
3. sells the required quantity of the configured stock into USDC;
4. applies repayment to accrued interest first, then principal;
5. returns repayment to the Credit Vault;
6. leaves the remaining stock in the Position Account.

### Add collateral

The owner may add:

- more of the configured stock; or
- USDC specifically for debt repayment/deleveraging.

V1 should not treat arbitrary other tokens as collateral.

---

## Borrow interest

Borrow interest is Margin Call's primary V1 protocol revenue and the natural price of the financing product.

### Initial model

Use a single protocol-wide APR with an initial hackathon/demo value of **10% APR**.

The protocol owner/admin may update that APR prospectively using an owner-restricted setter, subject to `MAX_BORROW_APR = 50%` in V1.

Interest is:

- denominated in USDC;
- simple, not compounding;
- charged only while principal is outstanding;
- calculated from elapsed time and the rate schedule implied by the global accumulator;
- attached to the position and transferred with the NFT;
- repaid before principal when a repayment occurs.

Conceptually, the protocol maintains a cumulative rate-time accumulator:

```text
currentRateAccumulator =
  cumulativeRateSeconds
  + currentBorrowApr * (now - lastRateUpdateAt)

newInterest =
  principal
  * (currentRateAccumulator - rateAccumulatorSnapshot)
  / 365 days

currentDebt = principal + accruedInterestStored + newInterest
```

The exact implementation uses scaled fixed-point APR units and explicit integer rounding rules.

For example, a position with `50 USDC` principal held entirely at `10% APR` has approximately:

```text
At open       50.000 USDC debt
After 1 day   50.014 USDC debt
After 30 days 50.411 USDC debt
After 1 year  55.000 USDC debt
```

### Admin APR updates

V1 exposes conceptually:

```text
setBorrowApr(newApr)
```

restricted to the protocol owner/admin.

Before changing the rate, the contract must checkpoint the global rate accumulator through the current timestamp using the old APR. It then stores the new APR and the current timestamp.

Example:

```text
Day 0-10     10% APR
Admin update at Day 10
Day 10+      12% APR
```

A position open across that boundary owes 10% annualized interest for the first interval and 12% annualized interest only for time after the update. The new rate never applies retroactively.

Requirements:

- `newApr <= MAX_BORROW_APR`;
- initial V1 hard maximum: `50% APR`;
- emit `BorrowAprUpdated(oldApr, newApr, effectiveAt)`;
- rate changes do not require iterating over open positions;
- rate changes do not reset a position's principal, accrued interest, or ownership;
- all UI and agent surfaces should display the current protocol APR.

Longer term, APR administration should move behind a timelock and/or dedicated `RISK_ADMIN_ROLE`.

### Lazy accrual

Do not write interest to each position every block or run a keeper merely to accrue interest.

`currentDebt(positionId)` should be a view calculation based on stored position debt state and the current global rate accumulator.

Before any state-changing action that depends on debt, Margin Call should checkpoint position interest conceptually via `_accrue(positionId)`:

- increase leverage;
- reduce leverage;
- repay;
- close;
- liquidation;
- any other debt-changing operation.

The checkpoint adds earned interest to `accruedInterestStored` and updates the position's `rateAccumulatorSnapshot` to the current global accumulator.

Transfer-health checks must use `currentDebt()` including uncheckpointed elapsed interest even if the transfer itself does not write a position accrual checkpoint.

### Repayment ordering

USDC repayments apply in this order:

1. accrued interest;
2. principal.

This keeps lender earnings explicit and avoids principal being reduced while earned financing charges remain unpaid.

### Interest and position health

Interest is part of the solvency calculation.

Even if the stock price is flat, debt slowly grows while the position remains financed:

```text
Stock value    $150
Debt            $50
Equity          $100

          time passes

Stock value    $150
Debt            $55
Equity           $95
```

Therefore all leverage, transfer, close, and liquidation checks must use **current debt including accrued interest**, never principal alone.

---

## Credit Vault

Use OpenZeppelin ERC-4626 backed by USDC.

For V1:

- the protocol treasury is the intended depositor;
- external LP UX is not exposed;
- vault shares still exist according to ERC-4626;
- Margin Call is the only protocol component authorized to draw position credit;
- principal repayments and borrow interest return USDC to the vault;
- while Margin Call itself owns the vault capital, lending interest economically accrues to Margin Call.

### Initial leverage

Maximum gross leverage: **1.5x**.

For a deposit worth $100:

```text
Deposited stock value    $100
Maximum USDC principal    $50
Gross stock exposure     $150
Initial USDC debt          $50
Net equity                $100
```

This is economically equivalent to financing 50% additional spot exposure against the contributed stock value.

### Capacity

Credit may only be extended while the vault has sufficient free USDC.

The application should surface:

- vault liquid USDC;
- outstanding principal;
- accrued interest receivable;
- available credit;
- protocol reserves.

### ERC-4626 accounting

Lent USDC remains an asset of the Credit Vault as a receivable; it must not appear to vanish merely because it has been drawn into positions.

Conceptually:

```text
totalAssets = liquidUSDC + outstandingPrincipal + accruedInterestReceivable
```

Because V1 uses one global APR for all outstanding principal at any moment, aggregate receivable interest can also be checkpointed in O(1): before principal changes or the APR changes, accrue aggregate interest through the current timestamp using total outstanding principal and the old/current APR, then update aggregate principal or the rate.

On repayment, receivable decreases while vault cash increases. On interest payment, vault assets increase by the earned interest. Any future bad-debt path must explicitly write off unrecoverable receivables.

Public LP deposits are still out of scope for the hackathon, but this accounting boundary should be correct from the start so ERC-4626 share pricing does not need to be redesigned later.

---

## Risk model

### Core accounting

For a single-stock position:

```text
NAV = oracle value(stock balance) + USDC balance
Current Debt = principal + current accrued interest
Equity = NAV - Current Debt
Equity Ratio = Equity / NAV
Gross Leverage = NAV / Equity
```

### Initial defaults

Use configurable parameters with these starting values:

- Maximum gross leverage: `1.5x`.
- Maximum principal at open: `50%` of oracle-valued contributed stock equity.
- Borrow APR: `10%` initially, owner/admin configurable prospectively.
- Maximum borrow APR: `50%` hard V1 ceiling.
- Maintenance equity ratio: `30%`.
- Full liquidation below maintenance.
- No partial liquidation in V1.

Displayed health factor:

```text
Health Factor = Equity Ratio / Maintenance Equity Ratio
```

`Health Factor < 1.0` means liquidatable.

### Risk-increasing actions

Before opening or increasing leverage, Margin Call must verify:

- caller is owner or current executor;
- position is active;
- asset is approved;
- credit is used only for the position's configured stock;
- oracle price is valid and fresh;
- execution uses an approved venue;
- current debt includes all accrued interest;
- resulting leverage stays within the configured maximum;
- resulting account remains above the required health threshold;
- sufficient Credit Vault liquidity is available.

### Risk-reducing actions

Repay, sell, add collateral, reduce leverage, and close should remain possible whenever technically safe, including during a stale oracle state where an action does not require a new risk valuation.

### Stale oracle behavior

If the approved price feed is stale or invalid:

Block:

- opening new leveraged positions;
- increasing leverage;
- other actions that increase risk.

Allow where technically safe:

- adding stock collateral;
- adding USDC for repayment;
- repaying debt;
- selling stock;
- reducing leverage;
- closing the account.

Liquidation requires a valid price under the adapter's configured freshness rules.

---

## Oracle model

Use an `OracleAdapter` abstraction.

For Coinbase B20 stocks on Base, prefer approved Chainlink total-return feeds that correctly represent the token's economic relationship to the underlying equity.

The adapter returns:

- normalized price;
- update timestamp;
- freshness/validity state.

Uniswap spot price must not be used as the solvency oracle.

Local Foundry tests use a deterministic `MockOracleAdapter`.

---

## Execution model

### Uniswap spot execution

Use an `ExecutionAdapter` abstraction.

V1 live adapter: Uniswap on Base.

The adapter supports only the configured pair direction needed by the lifecycle:

- USDC -> configured B20 stock when increasing leverage;
- configured B20 stock -> USDC when reducing, closing, or liquidating.

Requirements:

- bounded slippage;
- recipient fixed to the Position Account or settlement path;
- no arbitrary output recipient;
- no arbitrary output token;
- no agent-supplied unrestricted route that bypasses Margin Call's asset constraint.

The core invariant is:

> **USDC debt drawn for an NVDAc position can only create additional NVDAc exposure.**

### Flash advanced orders

Flash is an execution/risk-management extension after the basic Uniswap loop works.

Target features:

- stop-loss;
- take-profit;
- bracket orders;
- other advanced execution where useful.

Flash manages execution. Margin Call remains responsible for debt repayment and account lifecycle.

A full-exit Flash fill should eventually be finalized by Margin Call:

1. settle stock into USDC;
2. repay principal and accrued interest to the Credit Vault;
3. pay applicable fees;
4. return residual equity to current NFT owner;
5. burn NFT.

---

## NFT ownership and secondary market

### The NFT is the position ownership primitive

Use OpenZeppelin ERC-721.

The NFT represents control of the entire financed account.

If Position #184 contains:

```text
NVDAc value           $180
USDC principal         $50
Accrued interest        $2
Current debt           $52
Net equity            $128
```

selling NFT #184 transfers ownership of that same live account.

The transfer does **not**:

- sell NVDAc;
- repay the loan;
- create a new loan;
- reset accrued interest;
- move the Position Account's assets;
- reset cost basis/history at the protocol layer.

Only control changes.

### Transfer semantics

On successful NFT transfer:

- the new `ownerOf(tokenId)` becomes the economic owner;
- stock and current debt remain unchanged;
- accrued interest remains attached to the position;
- the Position Account address remains unchanged;
- the previous executor authorization is cleared;
- the new owner may appoint a new executor.

Transfers revert when the account is below the configured transfer-health threshold using current debt including elapsed interest.

### Why a secondary market matters

The owner can choose between:

```text
Close
  -> sell only enough stock to repay principal + interest + fees
  -> receive the remaining stock
```

or:

```text
Sell NFT
  -> buyer acquires the existing financed spot account
  -> buyer inherits current debt
  -> no stock unwind
  -> no debt refinance
```

A healthy position may trade around its realizable net equity, at a premium, or at a discount depending on market expectations, history, incentives, execution costs, accrued financing cost, and liquidation risk.

This secondary market is a core differentiator from conventional perp positions.

### Burn semantics

There is no unrestricted public burn.

The NFT is burned only after a terminal lifecycle event:

- normal close; or
- liquidation.

Therefore, an existing Position NFT always maps to a live financed account.

---

## Liquidation

Liquidation is permissionless.

Anyone may call:

```text
liquidate(positionId)
```

when the account is below the configured liquidation threshold.

V1 uses full liquidation:

1. Accrue interest through the liquidation timestamp using the current rate accumulator.
2. Validate liquidatability using a fresh approved oracle price and current debt.
3. Sell the entire stock balance into USDC through the approved execution adapter.
4. Repay the Credit Vault in full, including accrued borrow interest.
5. Pay the configured liquidation reward and protocol liquidation fee from remaining equity.
6. Send all remaining equity to the current NFT owner.
7. Mark the account liquidated.
8. Burn the Position NFT.

The Credit Vault is senior to protocol revenue and owner equity.

### Initial liquidation fees

Configurable starting targets:

- Liquidator reward: `1%`.
- Protocol liquidation fee: `1%`.

If remaining equity is insufficient, the vault is paid before either fee.

Margin Call may run its own keeper initially, but the protocol must not depend on an exclusive trusted bot.

---

## Normal close

The current NFT owner may close an active position at any time, subject to execution availability.

The default V1 close should preserve the owner's underlying stock exposure rather than unnecessarily converting the entire position to USDC.

`closePosition(tokenId)` should:

1. accrue borrow interest through the current rate accumulator;
2. calculate the USDC required to repay principal, accrued interest, and any required closing/protocol fees;
3. sell only the minimum required quantity of the configured stock into USDC, subject to slippage bounds;
4. repay the Credit Vault in full;
5. settle any applicable fees;
6. return all remaining configured stock and any residual USDC to the current NFT owner;
7. burn the NFT.

Example:

```text
Before close
NVDAc value           $180
USDC principal         $50
Accrued interest        $2
Current debt           $52
Net equity            $128

Default close
sell ~ $52 of NVDAc (plus required fees)
repay $52 current debt
return ~ $128 of NVDAc to current owner
burn NFT
```

This is distinct from liquidation, where the protocol performs a full unwind because lender protection takes priority.

### Repay externally and keep all stock

`repay()` remains a normal debt-reduction primitive rather than a separate bespoke close mode.

If the owner supplies external USDC and repays the account's current debt before closing, `closePosition` should not force a stock sale merely to recreate USDC the account no longer owes. Once debt and required fees are fully settled, closing releases the entire remaining stock balance to the current NFT owner and burns the NFT.

Conceptually:

```text
Position holds      $180 NVDAc
Current debt         $52 USDC

owner repays         $52 USDC externally
Current debt           $0

close
-> sell no NVDAc for debt repayment
-> return $180 NVDAc
-> burn NFT
```

The current owner receives the remaining stock/equity even if they were not the original opener.

---

## Fees and protocol revenue

V1 should prioritize simple and explicit economics.

### Primary revenue: borrow interest

Borrow interest is the core Margin Call business model.

The initial protocol-funded Credit Vault earns the full financing interest because Margin Call provides the capital itself. When external LPs are introduced later, a reserve factor can split borrower interest between LP yield and protocol revenue.

Example future structure:

```text
Borrower APR:             10%
LP/vault yield:       8.5-9%
Protocol reserve:       1-1.5%
```

The exact future split is out of scope for V1.

### Priority of funds

On close or liquidation:

1. Credit Vault principal and accrued borrow interest.
2. Required execution costs.
3. Protocol/liquidator fees.
4. Residual equity to current NFT owner.

### Other V1 revenue

Secondary/supplemental sources may include:

- liquidation protocol fee;
- integrator/execution fees where explicitly available;
- Bankr creator fees from `$MARGINCALL`.

V1 should **not** add separate origination, normal close, repayment, or NFT transfer fees unless implementation constraints require them. Uniswap LP fees and slippage are user execution costs, not Margin Call protocol revenue.

---

## Human and agent onboarding

Margin Call is agent-neutral.

### Existing agent wallet

An agent that already has an EVM wallet can interact directly with Margin Call.

It may:

- own the B20 stock;
- open the financed position;
- own the Position NFT;
- act as its own executor.

Dynamic is not required.

### Human flow with Dynamic

Target flow:

```text
email signup
  -> Dynamic user account
  -> one embedded owner wallet
  -> many Margin Call Position NFTs
```

The user's Dynamic wallet owns the NFT.

A delegated agent may act as executor while the user retains ownership.

Dynamic wallet policies may provide an additional pre-signing safety layer, but Margin Call contracts remain the authoritative financial enforcement layer.

### Human owner + external agent executor

A human may own the NFT while an existing agent wallet trades the account.

```text
ownerOf(184)    = 0xUSER
executorOf(184) = 0xAGENT
```

The executor does not receive ownership or withdrawal rights merely by being authorized to trade.

---

## Agent interface

The protocol should expose an agent-friendly MCP/API layer in addition to direct contract calls.

Initial tool surface:

- `get_markets`
- `get_credit_vault`
- `open_position`
- `get_position`
- `get_health`
- `increase_leverage`
- `reduce_leverage`
- `add_collateral`
- `repay`
- `set_executor`
- `update_thesis`
- `close_position`

Notice that the V1 agent interface does **not** expose a generic `borrow_usdc` tool.

The agent asks for an economic action such as increasing NVDAc leverage; Margin Call performs the internal USDC credit and same-asset purchase.

`get_position` and `get_health` must report current debt including uncheckpointed accrued interest.

---

## NFT metadata, art, and thesis

### Dynamic image

The application serves dynamic token metadata and dynamic image/OG image based on live position state.

The NFT should look like a live financial trading card.

Suggested state treatment:

- green when P&L is positive;
- red when negative;
- warning styling as health deteriorates;
- final frozen state on the historical web page after close/liquidation even though the live NFT is burned.

Image content:

- position ID;
- ticker;
- P&L;
- sparkline/equity chart;
- gross stock exposure;
- current debt;
- accrued interest;
- current borrow APR;
- equity;
- leverage;
- health;
- status.

### Marketplace metadata

Include exact display values plus bucketed filtering traits.

Examples:

- `Ticker = NVDAc`
- `Status = Active`
- `P&L Direction = Up`
- `Return Bucket = +20% to +50%`
- `Health = Healthy | Warning | Critical`
- `Leverage Bucket = 1.0x-1.2x | 1.2x-1.5x`
- `Current Borrow APR = 10%`
- `Manager = Claude | Codex | Agent | Manual`

Metadata should be compatible with marketplaces such as OpenSea.

### Thesis

The NFT description and public position page may expose the current investment thesis.

Example:

> NVDA remains my highest-conviction position because AI infrastructure spending continues to accelerate. I am maintaining 1.4x spot leverage. My thesis is invalidated if momentum breaks below the current support range.

For V1, full thesis text may live in Convex/application storage and be authenticated to the owner/executor.

The historical position page should preserve thesis changes and trades after the NFT is burned.

---

## Social and secondary-market loop

The position NFT is both a financial ownership object and a distribution object.

```text
holder deposits tokenized stock
  -> Margin Call finances more of the same stock
  -> dynamic Position NFT
  -> P&L / thesis / liquidation risk becomes shareable
  -> people discover the position
  -> position can itself be bought or sold
  -> attention flows back to Margin Call
  -> more positions open
```

Potential future product layers:

- trending positions;
- leaderboards;
- follows;
- one-click copy position;
- distressed-position discovery;
- agent/manager reputation.

A first-party marketplace is not required for V1 because standard ERC-721 transferability already proves the primitive.

---

## `$MARGINCALL` and Bankr flywheel

The token is not required for the protocol to function.

Planned token:

- Name: `Margin Call`
- Symbol: `$MARGINCALL`
- Launch venue: Bankr

Preferred economic role:

```text
more financed positions
  -> more dynamic NFTs and shareable stories
  -> more attention
  -> more $MARGINCALL trading volume
  -> Bankr creator fees accrue to Margin Call
  -> fees converted to USDC
  -> USDC grows protocol-owned Credit Vault capital/reserves
  -> more credit capacity
  -> more financed positions
```

Do not use `$MARGINCALL` as collateral in V1.

Do not promise token holders ownership of Credit Vault assets or lending revenue in the hackathon product.

Potential later utility may include LP incentives or fee benefits.

---

## Contract architecture

### `CreditVault`

- OpenZeppelin ERC-4626.
- Underlying asset: USDC.
- Protocol-funded initially.
- Supplies and receives Margin Call credit.
- Tracks lent principal as a receivable for `totalAssets()` accounting.
- Receives principal and interest repayments.

### `PositionNFT`

- OpenZeppelin ERC-721.
- One token per live financed position.
- Transfer clears executor authorization.
- Transfer checks transfer-health requirements using current debt including accrued interest.
- Burn restricted to terminal Margin Call lifecycle.

### `PositionAccount`

- Isolated custody/execution account for one configured stock.
- Holds the stock and temporary execution USDC.
- Prefer factory-deployed minimal clones.
- No arbitrary owner withdrawal while debt exists.
- Execution restricted to Margin Call-approved paths.

### `PositionAccountFactory`

- Creates indexed/deterministic Position Accounts.
- Initializes configured stock and associated token ID.

### `MarginCall`

Primary coordinator and risk engine.

Responsibilities:

- open positions from deposited B20 stock;
- value contributed stock;
- calculate allowable credit;
- atomically draw USDC and buy more of the same stock;
- account for principal and accrued interest;
- maintain the global rate accumulator;
- expose current debt as a time-aware view;
- checkpoint interest on debt-changing actions;
- allow the owner/admin to update borrow APR prospectively up to `MAX_BORROW_APR`;
- emit rate-update events;
- validate owner/executor authorization;
- increase/reduce leverage;
- add collateral;
- repay debt;
- set/revoke executors;
- enforce transfer/risk constraints using current debt;
- close positions while preserving remaining stock exposure;
- liquidate positions;
- coordinate NFT mint/burn;
- coordinate Credit Vault draws/repayments.

Conceptual admin surface:

```text
setBorrowApr(newApr) // onlyOwner, newApr <= MAX_BORROW_APR
```

For V1, use OpenZeppelin ownership/access-control building blocks rather than custom authorization.

### `OracleAdapter`

- asset -> approved feed configuration;
- freshness validation;
- normalized price interface.

### `ExecutionAdapter`

- approved same-asset financing swap interface;
- mock locally;
- Uniswap implementation on Base.

---

## Events and indexing

Emit enough events to reconstruct the financial lifecycle.

Suggested events:

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

Convex can index and enrich these events for charts, theses, sharing, and historical pages.

Contracts remain the source of truth for financial state.

---

## Local protocol spike

Before building the full application, prove the core lifecycle with Foundry/Anvil.

### Local mocks

Implement:

- `MockUSDC`
- `MockB20Stock` (NVDA-like first)
- `MockOracleAdapter`
- `MockExecutionAdapter`

### Required end-to-end test

1. Seed Credit Vault with 500 mock USDC.
2. Owner starts with mock NVDA worth 100 USDC at the mock oracle price.
3. Owner opens an NVDA position targeting 1.5x leverage.
4. Transfer the owner's mock NVDA into the Position Account.
5. Draw 50 USDC from the Credit Vault.
6. Mock execution swaps the 50 USDC into additional NVDA.
7. Verify the Position Account contains approximately 150 USDC of NVDA exposure and no freely withdrawable borrowed USDC.
8. Verify principal = 50 USDC, accrued interest = 0, and current debt = 50 USDC at open.
9. Mint Position NFT to owner.
10. Verify owner/executor permissions and healthy risk state.
11. Warp time forward and verify current debt increases according to the current APR without an accrual transaction.
12. Change the APR as owner/admin and verify elapsed interest before the update is preserved at the old rate while future time accrues at the new rate.
13. Verify health/equity calculations use current debt including interest.
14. Transfer the NFT to a second owner and verify transfer-health logic uses current debt.
15. Verify stock and debt do not move and accrued interest is not reset.
16. Verify old owner loses control.
17. Verify old executor is revoked.
18. Verify new owner controls the same Position Account.
19. Manipulate the oracle downward.
20. Verify increasing leverage reverts once constraints are breached.
21. Push price/current debt below maintenance.
22. Third-party liquidator calls liquidation.
23. Accrue interest through liquidation timestamp.
24. Sell stock into mock USDC.
25. Repay Credit Vault principal plus accrued interest first.
26. Pay liquidator/protocol fees if sufficient residual equity exists.
27. Send remaining equity to current NFT owner.
28. Burn NFT.
29. Verify no residual debt or stranded assets remain.

### Interest accrual test

Use deterministic time travel such as `vm.warp`.

1. Open a position with 50 USDC principal at 10% APR.
2. Warp 30 days.
3. Verify `currentDebt()` is approximately `50.411 USDC`, subject to exact integer rounding.
4. Verify no keeper/accrual transaction was required for the view result.
5. Call a debt-changing action and verify interest checkpoints correctly.
6. Repay partially and verify accrued interest is paid before principal.
7. Verify the resulting principal, accrued interest, vault accounting, equity, and health.

### APR update test

Use deterministic time travel to prove prospective repricing.

1. Set APR to 10% and open a position with 50 USDC principal.
2. Warp 10 days.
3. Owner calls `setBorrowApr(12%)`.
4. Verify the global accumulator checkpoints the first 10 days at 10% before storing 12%.
5. Warp another 10 days.
6. Verify `currentDebt()` includes 10 days at 10% plus 10 days at 12%, not 20 days at either single rate.
7. Verify the APR update emits `BorrowAprUpdated(10%, 12%, effectiveAt)`.
8. Verify a non-owner cannot update the APR.
9. Verify setting APR above `50%` reverts.
10. Verify an APR update does not require iterating over or mutating each open position.

### Normal close test

1. Open a healthy financed NVDA position.
2. Warp time so borrow interest accrues.
3. Optionally transfer the NFT.
4. Current owner calls `closePosition`.
5. Sell only enough NVDA to cover principal, accrued interest, and required fees.
6. Repay the Credit Vault in full.
7. Return all remaining NVDA and any residual USDC to the current NFT owner.
8. Burn the NFT.
9. Verify no debt remains and no unnecessary stock was sold.

### External repayment close test

1. Open a healthy financed NVDA position.
2. Warp time so borrow interest accrues.
3. Current owner supplies external USDC through `repay()` until current debt is zero.
4. Verify repayment clears accrued interest before principal.
5. Current owner calls `closePosition`.
6. Verify no NVDA is sold for debt repayment.
7. Return the entire remaining NVDA balance to the current owner.
8. Burn the NFT.

### Deleverage test

1. Open at 1.5x.
2. Warp time so interest accrues.
3. Reduce target leverage to 1.2x.
4. Accrue interest, sell the required amount of NVDA, and repay debt.
5. Verify remaining exposure and current debt match the requested leverage within rounding tolerance.

---

## Live Base integration spike

After the local loop is green, validate real plumbing with the smallest practical capital amount.

### Spike 1 — B20 asset and Chainlink oracle

For NVDAc initially unless another asset is materially easier:

- verify token address/decimals;
- verify approved Chainlink feed;
- verify price normalization;
- verify freshness behavior;
- verify B20 multiplier/total-return semantics required for correct NAV.

### Spike 2 — Uniswap execution

- quote USDC -> NVDAc;
- execute a minimal swap;
- execute NVDAc -> USDC;
- measure slippage/gas;
- confirm Position Account can custody the output;
- enforce same-asset route restrictions.

### Spike 3 — Position Account compatibility

- deploy Position Account implementation on Base;
- prove approvals/calls from the account;
- verify no arbitrary value can escape while debt exists.

### Spike 4 — Flash compatibility

After spot execution works:

- determine smart-account/order-signing requirements;
- prove bracket/stop-loss execution can be associated with the Position Account;
- define how full-exit fills trigger Margin Call finalization.

### Spike 5 — Dynamic

- email signup;
- one embedded owner wallet per user account;
- delegated agent executor flow;
- wallet-policy restrictions where useful;
- confirm bring-your-own-wallet agents remain first class.

---

## App experience

### Dashboard

Show:

- total user equity;
- total current debt;
- total accrued interest;
- current borrow APR;
- number of open positions;
- available Margin Call credit;
- position cards.

### Open position

Human flow:

1. Connect/sign in.
2. Select an approved stock already held by the owner wallet.
3. Enter how much stock to deposit.
4. Choose target leverage up to 1.5x.
5. Review estimated additional exposure, principal, current borrow APR, and risk.
6. Confirm.
7. Margin Call deposits stock, finances more of the same stock, creates the Position Account, and mints the NFT.

The user should not see a standalone USDC borrowing step.

### Position page

Show:

- dynamic NFT art;
- current thesis;
- owner;
- executor/manager;
- ticker and token amount;
- gross stock exposure;
- principal borrowed;
- accrued interest;
- current debt;
- current borrow APR;
- equity;
- leverage;
- health;
- P&L;
- chart;
- journal;
- increase/decrease leverage;
- add collateral/repay;
- close (sell only enough stock to settle current debt/fees and return the rest);
- share link.

The UI may update accrued interest and current debt continuously using the same deterministic accumulator formula and latest onchain state. This is display-only convenience; the contract's `currentDebt()` calculation is authoritative.

If the owner/admin changes APR, the UI should reflect the new current APR while historical debt remains correctly calculated across the prior rate interval.

### Historical page

After burn, preserve a read-only historical page and final image state, including total interest paid over the life of the position.

---

## Security principles

- Borrowed USDC never becomes freely withdrawable user capital.
- Credit drawn for a stock can only buy more of that same stock.
- Financed stock cannot leave the Position Account while debt exists except through approved reduce/close/liquidation paths.
- Every solvency calculation uses current debt including accrued interest.
- Normal close should not sell more stock than is required to settle current debt and fees.
- Uniswap is execution, never the solvency oracle.
- Agent executors do not gain NFT ownership merely by receiving trade authority.
- NFT transfer invalidates prior executor permissions.
- NFT transfer does not reset principal, accrued interest, or rate-accumulator state.
- Credit Vault repayment is senior to protocol revenue and owner withdrawals.
- Oracle freshness is checked before risk-increasing actions and liquidation.
- Interest math and rounding behavior must be deterministic and tested at APR-change boundaries.
- APR changes are owner/admin-only and forward-looking; elapsed time is never repriced retroactively.
- APR changes must checkpoint the global accumulator at the old rate before the new rate becomes effective.
- V1 enforces a hard `50% APR` maximum.
- Every APR update emits an explicit event.
- Risk parameters are explicit and admin-controlled for the hackathon.
- Prefer OpenZeppelin standards and restrictive adapters over custom generalized execution.

---

## Build order

### Phase 1 — Protocol core

- OpenZeppelin ERC-4626 Credit Vault.
- OpenZeppelin ERC-721 Position NFT.
- Position Account + factory.
- Margin Call coordinator/risk engine.
- Fixed-rate simple-interest accounting and `currentDebt()`.
- Global cumulative rate accumulator and owner-controlled prospective APR updates.
- Aggregate Credit Vault receivable accounting.
- Oracle and execution interfaces.
- Local mocks.
- Open-from-stock, finance-same-stock, interest accrual, APR update, transfer, deleverage, stock-preserving close, external-repayment close, and liquidation Foundry tests.

### Phase 2 — Base execution

- B20 + Chainlink validation.
- Uniswap same-asset financing adapter.
- Tiny real Base open/finance/accrue/close test.
- Tiny real liquidation test if practical; otherwise deterministic fork/integration test.

### Phase 3 — Agent surface

- agent-friendly wrappers/API;
- MCP tools;
- bring-your-own-agent-wallet flow.

### Phase 4 — Human app

- Dynamic email onboarding;
- embedded owner wallet;
- position dashboard;
- live current-APR/accrued-interest/current-debt display;
- delegated executor flow.

### Phase 5 — NFT/social layer

- dynamic metadata;
- dynamic OG image;
- thesis/history;
- marketplace-compatible traits;
- public shareable position page.

### Phase 6 — Sponsor/product extensions

- Flash advanced orders;
- Bankr `$MARGINCALL` launch;
- creator-fee -> treasury -> USDC Credit Vault reporting.

---

## Remaining implementation questions

These do not block starting the protocol core but must be resolved before meaningful live capital:

1. Exact B20 launch asset list and liquidity quality on Base.
2. Exact Chainlink feed addresses and freshness thresholds.
3. Final maintenance equity ratio and transfer-health threshold after simulation.
4. Exact liquidation-fee basis and insufficient-residual-equity behavior.
5. Final initial V1 borrow APR before live capital; `10%` is the initial hackathon/demo default.
6. Exact fixed-point precision and rounding rules for the cumulative rate accumulator and interest accrual.
7. Position Account implementation: minimal custom account vs heavier smart-account standard. Default: minimal custom account.
8. Exact Uniswap route/adapter implementation while preserving the same-stock invariant.
9. Flash account/signing requirements.
10. Whether thesis updates remain signed offchain records or also commit a hash/URI onchain.
11. Exact Bankr fee-beneficiary and conversion flow for `$MARGINCALL`.
12. Whether USDC-only position opening should be added later as a convenience path; it is not the canonical V1 thesis.
13. Future public-LP design: utilization curve, reserve factor, and bad-debt accounting.
14. Post-hackathon admin hardening: timelock, dedicated risk-admin role, and any delay/notice policy for APR updates.

---

## Product statement

> **Margin Call finances real tokenized equities and creates a secondary market for financed spot positions. Deposit an approved stock, choose your leverage, and Margin Call uses USDC credit to acquire more of that same stock. The financing accrues transparent borrow interest while open, the protocol APR can be updated prospectively by the admin, and the resulting live asset-plus-debt account is represented by a transferable NFT that can change owners without unwinding the trade.**