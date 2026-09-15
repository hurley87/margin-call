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
8. Margin Call mints a Position NFT representing ownership/control of the entire live financed account.
9. The NFT may be transferred or sold without selling the stock or refinancing the debt.
10. Closing or liquidation unwinds the position, repays the Credit Vault first, distributes residual equity, and burns the NFT.

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
              +-> close
              `-> sell the entire live position to another owner
```

A Margin Call NFT is therefore not just a receipt or collectible wrapper. It is the ownership/control primitive for a live account containing:

- actual B20 stock;
- USDC-denominated debt;
- current equity;
- liquidation state;
- an optional agent executor;
- thesis/history used by the product layer.

The debt remains attached to the account when the NFT changes hands.

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
7. A Position Account holds the combined stock inventory and records the USDC debt.
8. A Position NFT is minted to the owner.
9. The live position page shows stock exposure, debt, equity, P&L, leverage, health, thesis, and dynamic NFT art.
10. The NFT can be transferred to a second wallet while the underlying stock and debt remain unchanged.
11. The old owner and old executor lose control after transfer.
12. The new NFT owner gains control of the same financed account.
13. The owner can reduce leverage or close the position.
14. A simulated price decline can make the account liquidatable.
15. A permissionless liquidator can unwind the account, repay the vault first, collect the configured reward, return residual equity, and burn the NFT.
16. At least one tiny live Base position uses real USDC, a supported B20 stock, Chainlink pricing, and Uniswap execution.

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
- Variable interest-rate curves.
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
- close the account and receive residual equity.

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

---

## Position model

### One NFT = one stock = one isolated financed position

Each live position contains exactly:

- one approved B20 stock;
- an optional transient USDC balance from execution/deleveraging;
- USDC-denominated debt to the Credit Vault;
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

### Why the account may temporarily hold USDC

USDC may exist transiently when:

- selling stock to reduce leverage;
- selling stock during close;
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
7. Records the USDC debt.
8. Mints the Position NFT to the owner.

Expected result:

```text
Position #184

NVDAc gross value       $150
USDC debt                $50
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

1. values the account;
2. calculates additional allowable debt;
3. draws USDC from the Credit Vault;
4. swaps USDC into the position's configured stock;
5. keeps the purchased stock in the Position Account;
6. records the additional debt.

Credit cannot be redirected to another token.

### Reduce leverage

Conceptually:

```text
reduceLeverage(tokenId, targetLeverage)
```

Margin Call:

1. calculates how much debt must be repaid;
2. sells the required quantity of the configured stock into USDC;
3. repays the Credit Vault;
4. leaves the remaining stock in the Position Account.

### Add collateral

The owner may add:

- more of the configured stock; or
- USDC specifically for debt repayment/deleveraging.

V1 should not treat arbitrary other tokens as collateral.

---

## Credit Vault

Use OpenZeppelin ERC-4626 backed by USDC.

For V1:

- the protocol treasury is the intended depositor;
- external LP UX is not exposed;
- vault shares still exist according to ERC-4626;
- Margin Call is the only protocol component authorized to draw position credit;
- repayments return USDC to the vault.

### Initial leverage

Maximum gross leverage: **1.5x**.

For a deposit worth $100:

```text
Deposited stock value    $100
Maximum USDC credit       $50
Gross stock exposure     $150
USDC debt                 $50
Net equity               $100
```

This is economically equivalent to financing 50% additional spot exposure against the contributed stock value.

### Capacity

Credit may only be extended while the vault has sufficient free USDC.

The application should surface:

- vault assets;
- outstanding credit;
- available credit;
- protocol reserves.

---

## Risk model

### Core accounting

For a single-stock position:

```text
NAV = oracle value(stock balance) + USDC balance
Debt = USDC principal owed to CreditVault + accrued protocol debt fees
Equity = NAV - Debt
Equity Ratio = Equity / NAV
Gross Leverage = NAV / Equity
```

### Initial defaults

Use configurable parameters with these starting values:

- Maximum gross leverage: `1.5x`.
- Maximum debt at open: `50%` of oracle-valued contributed stock equity.
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
2. repay Credit Vault;
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
NVDAc value       $180
USDC debt          $50
Net equity        $130
```

selling NFT #184 transfers ownership of that same live account.

The transfer does **not**:

- sell NVDAc;
- repay the $50 loan;
- create a new loan;
- move the Position Account's assets;
- reset cost basis/history at the protocol layer.

Only control changes.

### Transfer semantics

On successful NFT transfer:

- the new `ownerOf(tokenId)` becomes the economic owner;
- stock and debt remain unchanged;
- the Position Account address remains unchanged;
- the previous executor authorization is cleared;
- the new owner may appoint a new executor.

Transfers revert when the account is below the configured transfer-health threshold.

### Why a secondary market matters

The owner can choose between:

```text
Close
  -> sell stock
  -> repay debt
  -> receive residual USDC
```

or:

```text
Sell NFT
  -> buyer acquires the existing financed spot account
  -> no stock unwind
  -> no debt refinance
```

A healthy position may trade around its realizable net equity, at a premium, or at a discount depending on market expectations, history, incentives, execution costs, and liquidation risk.

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

1. Validate liquidatability using a fresh approved oracle price.
2. Sell the entire stock balance into USDC through the approved execution adapter.
3. Repay the Credit Vault in full first.
4. Pay the configured liquidation reward and protocol liquidation fee from remaining equity.
5. Send all remaining equity to the current NFT owner.
6. Mark the account liquidated.
7. Burn the Position NFT.

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

`closePosition(tokenId)`:

1. sells the stock balance into USDC;
2. repays outstanding Credit Vault debt;
3. pays any configured closing/protocol fee;
4. sends residual USDC to the current NFT owner;
5. burns the NFT.

The current owner receives the residual equity even if they were not the original opener.

---

## Fees

V1 should prioritize simple and explicit seniority.

### Priority of funds

On close or liquidation:

1. Credit Vault debt.
2. Required execution costs.
3. Protocol/liquidator fees.
4. Residual equity to current NFT owner.

### Potential V1 revenue

- configurable origination/opening fee;
- liquidation protocol fee;
- integrator/execution fees where available;
- Bankr creator fees from `$MARGINCALL`.

Continuous borrow interest may be deferred for the hackathon if it adds unnecessary complexity. Longer term, borrow interest is the natural credit-product revenue source.

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
- debt;
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

### `PositionNFT`

- OpenZeppelin ERC-721.
- One token per live financed position.
- Transfer clears executor authorization.
- Transfer checks transfer-health requirements.
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
- account for debt;
- validate owner/executor authorization;
- increase/reduce leverage;
- add collateral;
- repay debt;
- set/revoke executors;
- enforce transfer/risk constraints;
- close positions;
- liquidate positions;
- coordinate NFT mint/burn;
- coordinate Credit Vault draws/repayments.

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
8. Verify debt = 50 USDC.
9. Mint Position NFT to owner.
10. Verify owner/executor permissions and healthy risk state.
11. Transfer the NFT to a second owner.
12. Verify stock and debt do not move.
13. Verify old owner loses control.
14. Verify old executor is revoked.
15. Verify new owner controls the same Position Account.
16. Manipulate the oracle downward.
17. Verify increasing leverage reverts once constraints are breached.
18. Push price below maintenance.
19. Third-party liquidator calls liquidation.
20. Sell stock into mock USDC.
21. Repay Credit Vault first.
22. Pay liquidator/protocol fees if sufficient residual equity exists.
23. Send remaining equity to current NFT owner.
24. Burn NFT.
25. Verify no residual debt or stranded assets remain.

### Normal close test

1. Open a healthy financed NVDA position.
2. Optionally transfer the NFT.
3. Current owner calls `closePosition`.
4. Sell all NVDA into USDC.
5. Repay vault.
6. Return residual USDC to current NFT owner.
7. Burn NFT.

### Deleverage test

1. Open at 1.5x.
2. Reduce target leverage to 1.2x.
3. Sell the required amount of NVDA.
4. Repay the corresponding debt.
5. Verify remaining exposure and debt match the requested leverage within rounding tolerance.

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
- total debt;
- number of open positions;
- available Margin Call credit;
- position cards.

### Open position

Human flow:

1. Connect/sign in.
2. Select an approved stock already held by the owner wallet.
3. Enter how much stock to deposit.
4. Choose target leverage up to 1.5x.
5. Review estimated additional exposure, debt, and risk.
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
- debt;
- equity;
- leverage;
- health;
- P&L;
- chart;
- journal;
- increase/decrease leverage;
- add collateral/repay;
- close;
- share link.

### Historical page

After burn, preserve a read-only historical page and final image state.

---

## Security principles

- Borrowed USDC never becomes freely withdrawable user capital.
- Credit drawn for a stock can only buy more of that same stock.
- Financed stock cannot leave the Position Account while debt exists except through approved reduce/close/liquidation paths.
- Uniswap is execution, never the solvency oracle.
- Agent executors do not gain NFT ownership merely by receiving trade authority.
- NFT transfer invalidates prior executor permissions.
- Credit Vault repayment is senior to protocol revenue and owner withdrawals.
- Oracle freshness is checked before risk-increasing actions and liquidation.
- Risk parameters are explicit and admin-controlled for the hackathon.
- Prefer OpenZeppelin standards and restrictive adapters over custom generalized execution.

---

## Build order

### Phase 1 — Protocol core

- OpenZeppelin ERC-4626 Credit Vault.
- OpenZeppelin ERC-721 Position NFT.
- Position Account + factory.
- Margin Call coordinator/risk engine.
- Oracle and execution interfaces.
- Local mocks.
- Open-from-stock, finance-same-stock, transfer, deleverage, close, and liquidation Foundry tests.

### Phase 2 — Base execution

- B20 + Chainlink validation.
- Uniswap same-asset financing adapter.
- Tiny real Base open/finance/close test.
- Tiny real liquidation test if practical; otherwise deterministic fork/integration test.

### Phase 3 — Agent surface

- agent-friendly wrappers/API;
- MCP tools;
- bring-your-own-agent-wallet flow.

### Phase 4 — Human app

- Dynamic email onboarding;
- embedded owner wallet;
- position dashboard;
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
5. Whether V1 charges an origination/closing fee or keeps normal usage fee-free during the hackathon.
6. Position Account implementation: minimal custom account vs heavier smart-account standard. Default: minimal custom account.
7. Exact Uniswap route/adapter implementation while preserving the same-stock invariant.
8. Flash account/signing requirements.
9. Whether thesis updates remain signed offchain records or also commit a hash/URI onchain.
10. Exact Bankr fee-beneficiary and conversion flow for `$MARGINCALL`.
11. Whether USDC-only position opening should be added later as a convenience path; it is not the canonical V1 thesis.

---

## Product statement

> **Margin Call finances real tokenized equities and creates a secondary market for financed spot positions. Deposit an approved stock, choose your leverage, and Margin Call uses USDC credit to acquire more of that same stock. The resulting live asset-plus-debt account is represented by a transferable NFT that can change owners without unwinding the trade.**
