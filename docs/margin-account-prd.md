# Margin Call — Agent Margin Accounts PRD

## Summary

Margin Call is a margin brokerage for AI agents. It gives Claude, Codex, Bankr agents, custom bots, and other wallet-enabled agents a controlled USDC credit line for trading tokenized equities on Base.

A user or agent supplies USDC equity, Margin Call extends a capped amount of USDC credit, and the resulting financed position is represented by a transferable ERC-721. The NFT is not a receipt or collectible wrapper around an unrelated account: it is the ownership/control primitive for a live, isolated margin account containing assets, debt, and risk state.

The initial product is deliberately narrow:

- Base only.
- Long only.
- One stock per margin position.
- USDC collateral and USDC credit.
- Up to 1.5x gross exposure.
- Approved Coinbase B20 tokenized equities only.
- Uniswap for spot execution.
- Chainlink for risk pricing.
- Full liquidation only in V1.
- Protocol-funded credit vault initially; no public LPs required for launch.

The hackathon objective is to prove the entire primitive end to end with local tests first, then execute a small real position on Base.

---

## Product thesis

AI agents increasingly have wallets, market data, and execution tools, but they generally operate with only the capital already in those wallets. Margin Call adds a missing primitive: controlled credit.

The product should feel like opening a margin brokerage account for an agent:

1. Bring an existing agent wallet, or sign up as a human and provision a wallet through Dynamic.
2. Deposit USDC equity.
3. Open a Margin Call position and request credit.
4. Margin Call creates an isolated position account and mints a Position NFT to the owner.
5. The owner or an authorized agent executor trades the approved stock through Uniswap.
6. Margin Call continuously enforces solvency rules on risk-increasing actions and exposes the position health onchain.
7. The owner may transfer the NFT, thereby transferring control of the live financed account without unwinding it.
8. Closing the position repays the credit vault, returns residual equity to the current NFT owner, and burns the NFT.
9. If the position breaches maintenance requirements, anyone may liquidate it; the vault is repaid first, a liquidation reward is paid, remaining equity goes to the NFT owner, and the NFT is burned.

Margin Call is not the trading brain. The agent decides what to do. Margin Call supplies the balance sheet, permissions, custody boundaries, and risk engine.

---

## Goals

### Primary goals

- Give any wallet-enabled agent a simple margin-account primitive.
- Prove that protocol-owned USDC can safely finance long B20 equity exposure.
- Make each financed account isolated and independently liquidatable.
- Represent account ownership as a standard ERC-721 that can be transferred or sold.
- Support both human-owned positions with delegated agent execution and fully agent-owned positions.
- Use standard, boring primitives where possible, especially OpenZeppelin ERC-721 and ERC-4626.
- Keep integrations modular so Dynamic, Uniswap, Flash, and other providers remain adapters rather than protocol dependencies.

### Hackathon success criteria

A complete demo must prove:

1. A credit vault is seeded with USDC.
2. A wallet deposits owner equity.
3. Margin Call extends credit up to the configured leverage limit.
4. A Position NFT and isolated Position Account are created.
5. The position buys an approved tokenized stock.
6. The live position page shows equity, debt, P&L, health, thesis, and dynamic NFT art.
7. The NFT can be transferred and the new owner gains control of the unchanged account.
8. The old executor loses permission after transfer.
9. The owner can close the account, causing assets to be unwound, debt repaid, residual equity returned, and the NFT burned.
10. A test price decline can make the account liquidatable; a permissionless liquidator repays the vault and receives the configured reward.
11. At least one tiny live trade runs end to end on Base using real USDC, a supported B20 stock, Chainlink pricing, and Uniswap execution.

---

## Non-goals for V1

The following are intentionally out of scope for the hackathon build:

- Short positions.
- Borrowing B20 stock inventory.
- Multi-stock baskets inside one position.
- Cross-margin across multiple positions.
- Public permissionless LP deposits.
- Variable interest-rate curves.
- Partial liquidations.
- Portfolio margin.
- Governance.
- Using `$MARGINCALL` as collateral.
- Requiring `$MARGINCALL` to use the protocol.
- A full first-party NFT marketplace.
- Autonomous strategy generation or scheduled trading logic inside Margin Call.

These can be layered on after the core margin primitive is proven.

---

## Actors

### Position owner

The wallet that owns the Position NFT.

The owner has the economic claim on the account and may:

- add collateral;
- appoint or revoke an executor;
- transfer or sell the Position NFT while the account is transferable;
- repay debt;
- reduce exposure;
- close the account and receive residual equity.

The owner may be:

- a human user's Dynamic embedded wallet;
- an existing externally managed wallet;
- an AI agent wallet directly.

### Executor

An optional wallet authorized to manage trading actions for a position.

The executor may:

- buy the position's approved stock;
- sell the position's approved stock;
- reduce risk;
- repay debt;
- place supported advanced orders when that integration is enabled.

The executor may not:

- transfer the NFT;
- change ownership;
- withdraw residual owner equity;
- change the configured asset;
- move borrowed funds outside approved execution paths;
- loosen protocol risk limits.

A position may be self-managed by setting the owner and executor to the same wallet.

### Liquidator

Any address that calls `liquidate(positionId)` while the account is below the liquidation threshold.

Liquidation correctness is enforced by the contracts; the liquidator is not trusted.

### Credit-vault depositor

For V1, this is the Margin Call protocol treasury only.

The vault should still use ERC-4626 so public LPs can be enabled later without replacing the core credit primitive.

---

## Account model

### One NFT = one margin position

Each position contains exactly:

- USDC;
- one approved B20 stock;
- USDC-denominated debt to the Credit Vault;
- risk/accounting state;
- an optional executor;
- metadata pointers/state used by the application.

A user may own many Position NFTs simultaneously.

Example:

```text
User wallet 0xUSER
  |
  |-- NFT #184 -> NVDAc PositionAccount
  |-- NFT #231 -> AAPLc PositionAccount
  `-- NFT #402 -> COINc PositionAccount
```

This preserves isolation. A bad position cannot consume collateral from another position unless cross-margin is deliberately added in a later version.

### Position account

Each NFT maps to an isolated `PositionAccount` contract, preferably deployed as a minimal clone from a factory.

The Position Account is a custody/execution container, not the risk engine.

It holds the account's assets and may only execute calls authorized through Margin Call's approved execution path.

Conceptually:

```text
PositionNFT #184
      |
      v
PositionAccount #184
  - USDC
  - NVDAc
      |
      v
Debt record -> CreditVault
```

### Transfer semantics

Transferring the NFT transfers control of the account without moving its assets or refinancing its debt.

On successful NFT transfer:

- the new `ownerOf(tokenId)` becomes the economic owner;
- the existing debt remains attached to the position;
- the Position Account does not move;
- any previous executor authorization is cleared;
- the new owner may appoint a new executor.

Transfers must revert when the account is below the configured transfer-health threshold. A position already eligible for liquidation cannot be dumped into another wallet to interfere with liquidation.

### Burn semantics

There is no unrestricted public `burn()` operation.

The NFT is burned only when the financed account reaches a terminal state:

- owner-initiated close; or
- protocol liquidation.

Therefore, an existing Margin Call Position NFT always corresponds to a live financed account.

---

## Credit model

### Credit Vault

Use an OpenZeppelin ERC-4626 vault backed by USDC.

For V1:

- the protocol treasury is the only intended depositor;
- external LP UX is not exposed;
- vault shares still exist according to ERC-4626;
- Margin Call is the only protocol component authorized to draw position credit;
- repayments return USDC to the vault.

This gives us a standard vault interface now while preserving a clean path to external LPs later.

### Initial leverage

V1 maximum gross leverage: **1.5x**.

Example:

```text
Owner equity:       100 USDC
Max protocol credit: 50 USDC
Gross buying power: 150 USDC
```

Borrowed USDC is not freely withdrawable. Credit only becomes usable through an approved Margin Call trade path and the resulting assets remain inside the Position Account.

### Capacity

New credit may only be extended when the Credit Vault has sufficient free USDC.

The application should surface:

- vault assets;
- outstanding credit;
- available credit;
- protocol reserves.

If available credit is exhausted, users may still open unleveraged positions or wait for capacity to return.

---

## Risk model

### Core accounting

For one stock position:

```text
NAV = USDC balance + oracle value(stock balance)
Debt = principal owed to CreditVault + any accrued protocol debt fees
Equity = NAV - Debt
Equity Ratio = Equity / NAV
```

Risk parameters should be configurable by governance/admin for the hackathon rather than permanently hard-coded.

### Initial defaults

Use these as implementation defaults, subject to adjustment before live capital:

- Maximum leverage: `1.5x`.
- Maximum debt at open: `50%` of contributed owner equity.
- Maintenance equity ratio: `30%`.
- Full liquidation when the maintenance condition is breached.
- No partial liquidation in V1.

A convenient displayed health factor is:

```text
Health Factor = Equity Ratio / Maintenance Equity Ratio
```

`Health Factor < 1.0` means the account is liquidatable.

### Risk-increasing actions

Before any action that increases exposure or debt, Margin Call must verify:

- caller is owner or current executor;
- position is active;
- requested asset matches the position's approved stock;
- oracle price is fresh;
- trade uses an approved executor/venue;
- resulting leverage remains within the position limit;
- resulting account remains above the required health threshold;
- sufficient vault credit is available.

### Risk-reducing actions

Repay, sell, add collateral, and close should remain possible whenever technically safe, including when the oracle is stale.

### Stale oracle behavior

If the approved price feed is stale or invalid:

Block:

- new borrowing;
- opening new leveraged exposure;
- trades that increase stock exposure.

Allow:

- adding USDC collateral;
- repaying debt;
- selling stock;
- closing the account.

Liquidation during oracle failure should only proceed using a valid price according to the adapter's configured freshness rules.

---

## Oracle model

Use an `OracleAdapter` abstraction.

For Coinbase B20 stocks on Base, V1 should prefer approved Chainlink total-return feeds that account for the token's economic relationship to the underlying equity.

The adapter must return:

- price in USDC/USD-compatible units;
- update timestamp;
- validity/freshness status.

The protocol must not use Uniswap spot price as the solvency oracle.

Local Foundry tests should use a `MockOracleAdapter` so tests can deterministically drive a position through healthy, warning, and liquidatable states.

---

## Execution model

### Spot execution

Use an `ExecutionAdapter` abstraction.

V1 live adapter: Uniswap on Base.

The adapter must support:

- USDC -> approved B20 stock;
- approved B20 stock -> USDC;
- bounded slippage;
- recipient fixed to the Position Account;
- no arbitrary output recipient;
- no arbitrary token path exposed directly to the agent.

The agent chooses the desired economic action; Margin Call validates and executes it through the adapter.

### Advanced orders

Flash is a planned execution/risk-management integration after the basic Uniswap loop works.

Target features:

- stop-loss;
- take-profit;
- bracket order;
- potentially TWAP/other advanced execution where appropriate.

Flash should be treated as an execution layer, not as the Margin Call account lifecycle manager.

If a full-exit Flash order sells all stock into USDC, Margin Call must still finalize the account by:

1. repaying the Credit Vault;
2. paying any protocol fees;
3. sending residual equity to the current NFT owner;
4. burning the Position NFT.

---

## Liquidation

Liquidation is permissionless.

Anyone may call:

```text
liquidate(positionId)
```

when the account is below the configured liquidation threshold.

V1 liquidation is full liquidation:

1. Validate the position is liquidatable using a fresh approved oracle price.
2. Sell the entire stock balance for USDC through the approved execution adapter.
3. Repay the Credit Vault in full, including any protocol debt charges.
4. Pay the configured liquidation reward/penalty split from remaining account equity.
5. Send all remaining equity to the current NFT owner.
6. Mark the position closed/liquidated.
7. Burn the Position NFT.

The Credit Vault is senior to protocol revenue and owner equity.

### Initial liquidation fees

Use configurable parameters with initial targets:

- Liquidator reward: `1%`.
- Protocol liquidation fee: `1%`.

The exact basis for these fees should be implemented clearly and tested so the vault is always repaid before either fee is paid.

Margin Call may run its own keeper/liquidation bot initially, but the protocol must not depend on that bot being trusted or exclusive.

---

## Normal close

The owner may close an active position at any time, subject to execution availability.

`closePosition(tokenId)` should:

1. unwind the stock balance into USDC;
2. repay all outstanding debt to the Credit Vault;
3. pay any configured closing/protocol fee;
4. transfer residual USDC to the current NFT owner;
5. burn the Position NFT.

Closing must never send proceeds to the original opener if the NFT has since been transferred. The current owner receives residual equity.

---

## NFT design

Use OpenZeppelin ERC-721.

The NFT is the ownership/control primitive for the financed account.

### Dynamic image

The application should serve dynamic token metadata and a dynamic image/OG image based on current position state.

The art should act like a live financial trading card.

Suggested visual state:

- green treatment when P&L is positive;
- red treatment when P&L is negative;
- warning treatment as health deteriorates;
- final frozen state for a historical closed/liquidated position page even though the live ERC-721 has been burned.

Image content should include:

- token/position ID;
- ticker;
- P&L;
- sparkline/equity chart;
- owner equity;
- debt;
- leverage;
- health factor;
- position status.

### Metadata

Metadata should include both exact values for display and bucketed values for marketplace filtering.

Example traits:

- `Ticker = NVDAc`
- `Status = Active`
- `P&L Direction = Up`
- `Return Bucket = +20% to +50%`
- `Health = Healthy | Warning | Critical`
- `Leverage Bucket = 1.0x-1.2x | 1.2x-1.5x`
- `Manager = Claude | Codex | Agent | Manual` where known

The metadata architecture should be compatible with third-party NFT marketplaces such as OpenSea.

### Thesis

Each position may expose a current thesis in its NFT description and position page.

The thesis explains why the agent currently holds the trade, not merely what it holds.

Example:

> NVDA remains my highest-conviction position because AI infrastructure spending continues to accelerate. I am maintaining 1.4x leverage while keeping a USDC buffer. My thesis is invalidated if momentum breaks below the current support range.

For V1, thesis text may live offchain in the application/Convex and be authenticated to the position owner/executor. It does not need to be stored fully onchain.

The position page should retain historical theses and trades as a journal even after the NFT is burned.

---

## Human onboarding and Dynamic

Dynamic is a wallet/onboarding adapter, not a protocol dependency.

### Human flow

Target flow:

```text
Email signup
  -> Dynamic user account
  -> one primary embedded EVM owner wallet
  -> many Margin Call Position NFTs
```

A human may then delegate execution to an agent while keeping NFT ownership in the user wallet.

Dynamic wallet policies should be used where useful to constrain delegated agent signing to approved contracts and transaction types.

Margin Call contracts remain the authoritative financial enforcement layer even when wallet-level policies exist.

### Bring-your-own-agent flow

Existing agents do not need Dynamic.

An existing agent wallet may directly:

- deposit USDC;
- open a Margin Call position;
- own the Position NFT;
- act as its own executor.

This is a first-class protocol path.

### Human owner + external agent executor

A human may also own the NFT while approving an existing external agent wallet as executor.

Conceptually:

```text
ownerOf(184)   = 0xUSER
executorOf(184)= 0xAGENT
```

This lets users bring existing trading infrastructure without giving the agent ownership of the financial asset itself.

---

## Agent interface

Margin Call should expose an agent-friendly API/MCP layer over the protocol.

Initial tool surface:

- `get_markets`
- `get_credit_vault`
- `open_position`
- `get_position`
- `get_buying_power`
- `set_executor`
- `buy`
- `sell`
- `add_collateral`
- `repay`
- `update_thesis`
- `close_position`

The MCP/API should remain a convenience layer. Existing agents that can construct EVM transactions should also be able to call the contracts directly.

---

## Social and secondary-market loop

Position NFTs are both financial ownership objects and distribution objects.

The intended loop is:

```text
Agent opens leveraged position
  -> dynamic Position NFT
  -> position gains/loses value or approaches liquidation
  -> owner shares live position page/OG image
  -> attention flows to Margin Call
  -> users browse, follow, copy, or buy positions
  -> more positions are opened
```

A future first-party experience may add:

- trending positions;
- leaderboards;
- position follows;
- one-click copy position;
- distressed-position discovery;
- strategy/manager reputation.

For V1, standard ERC-721 transferability plus high-quality public position pages is sufficient.

---

## `$MARGINCALL` token and Bankr flywheel

The token is not required for the core protocol to function.

Planned token:

- Name: `Margin Call`
- Symbol: `$MARGINCALL`
- Launch venue: Bankr

The preferred economic role is to convert product attention into protocol-owned credit capacity.

Target flywheel:

```text
More agents open positions
  -> more dynamic NFTs and shareable stories
  -> more attention to Margin Call
  -> more $MARGINCALL trading volume
  -> Bankr creator fees accrue to Margin Call
  -> fees are converted to USDC
  -> USDC increases protocol-owned Credit Vault capital/reserves
  -> more agent credit becomes available
  -> more positions can open
```

Do not use `$MARGINCALL` as position collateral in V1.

Do not promise token holders direct ownership of Credit Vault assets or lending revenue as part of the hackathon build.

Potential future utility includes fee discounts, LP incentives, or other benefits, but none are required for V1.

---

## Fee model

V1 should optimize for simplicity and clear seniority rather than maximizing revenue.

### Priority of funds

On close or liquidation:

1. Credit Vault debt is repaid first.
2. Required execution costs/fees are settled.
3. Protocol/liquidator fees are paid according to the configured action.
4. Residual equity belongs to the current NFT owner.

### Initial revenue sources

Potential V1 sources:

- configurable position-opening/origination fee;
- liquidation protocol fee;
- integrator/execution fees where available;
- Bankr creator fees from `$MARGINCALL`.

Continuous borrow interest is intentionally deferred unless it proves trivial to add cleanly.

Longer term, borrow interest should become the most natural credit-product revenue source.

---

## Contract architecture

Initial contract set:

### `CreditVault`

- OpenZeppelin ERC-4626.
- Underlying asset: USDC.
- Protocol-funded at launch.
- Supplies and receives Margin Call credit.

### `PositionNFT`

- OpenZeppelin ERC-721.
- One token per live margin account.
- Transfer hook clears executor authorization.
- Transfer hook checks transfer-health requirement.
- Burn restricted to Margin Call terminal lifecycle.

### `PositionAccount`

- Isolated custody/execution account for one position.
- Holds USDC and one approved B20 token.
- Prefer factory-deployed minimal clones.
- Cannot make arbitrary owner withdrawals while debt exists.
- Execution restricted to Margin Call-approved paths.

### `PositionAccountFactory`

- Creates deterministic or indexed Position Accounts.
- Initializes account against a Position NFT/token ID.

### `MarginCall`

Primary protocol coordinator and risk engine.

Responsibilities:

- create/open positions;
- assign approved stock;
- extend and account for credit;
- validate owner/executor authorization;
- validate risk on trades;
- add collateral;
- repay debt;
- set/revoke executors;
- close positions;
- liquidate positions;
- coordinate NFT mint/burn;
- coordinate Credit Vault draw/repayment.

### `OracleAdapter`

- Asset -> approved price feed configuration.
- Freshness validation.
- Normalized price interface.

### `ExecutionAdapter`

- Approved swap interface.
- Mock implementation locally.
- Uniswap implementation for Base.

---

## Events and indexing

Emit enough protocol events for the app to reconstruct the account lifecycle and trading journal.

Suggested events:

- `PositionOpened`
- `CreditDrawn`
- `TradeExecuted`
- `CollateralAdded`
- `DebtRepaid`
- `ExecutorUpdated`
- `PositionTransferred` or derive from ERC-721 `Transfer`
- `PositionClosed`
- `PositionLiquidated`

Convex can index/enrich this data for product UI, charts, theses, sharing, and historical pages.

The contracts remain the source of truth for financial state.

---

## Local protocol spike

Before building the full application, prove the contracts locally with Foundry/Anvil.

### Local mocks

Implement:

- `MockUSDC`
- `MockB20Stock` (start with NVDA-like semantics)
- `MockOracleAdapter`
- `MockExecutionAdapter`

### Required end-to-end test

1. Seed Credit Vault with 500 mock USDC.
2. Owner starts with 100 mock USDC.
3. Owner opens an NVDA position with 100 USDC equity and 50 USDC requested credit.
4. Position NFT is minted to owner.
5. Position Account receives/uses 150 USDC buying power.
6. Execute a purchase into mock NVDA.
7. Verify:
   - position assets;
   - debt = 50 USDC;
   - vault outstanding credit accounting;
   - owner/executor permissions;
   - healthy risk state.
8. Transfer NFT to a second owner and verify:
   - account assets/debt do not move;
   - old owner loses control;
   - previous executor is revoked;
   - new owner controls the position.
9. Manipulate the mock oracle downward.
10. Verify risk-increasing actions revert once constraints are breached.
11. Push price below maintenance threshold.
12. Third-party liquidator calls liquidation.
13. Sell stock to mock USDC.
14. Repay Credit Vault first.
15. Pay liquidator/protocol fees.
16. Send remaining equity to current NFT owner.
17. Burn NFT.
18. Verify no residual debt or stranded assets remain.

### Normal-close test

Separately prove owner-initiated close:

1. Open and trade a healthy position.
2. Call `closePosition`.
3. Sell all stock.
4. Repay vault.
5. Return residual USDC to current owner.
6. Burn NFT.

---

## Live integration spike

After the local loop is green, validate the real Base plumbing with the smallest practical capital amount.

### Spike 1 — B20 asset and oracle

For one target asset, initially NVDAc unless integration constraints suggest another:

- verify token address and decimals;
- verify approved Chainlink feed;
- verify normalization to USDC-compatible price units;
- verify freshness behavior;
- verify any B20 multiplier/total-return semantics needed for correct NAV.

### Spike 2 — Uniswap execution

- obtain a live quote for USDC -> selected B20 asset;
- execute a minimal-size swap;
- execute the reverse swap;
- measure slippage and gas;
- confirm Position Account can be the recipient/custodian;
- ensure adapter can constrain tokens and recipient safely.

### Spike 3 — Position Account compatibility

- deploy the Position Account implementation on Base;
- confirm Uniswap approvals/calls work from the account;
- verify ERC-1271 or other smart-wallet requirements only where needed by later integrations.

### Spike 4 — Flash compatibility

After spot execution works:

- determine signing/account requirements for bracket/stop-loss orders;
- prove an order can be associated with a Position Account safely;
- define how a full-exit fill triggers Margin Call finalization.

### Spike 5 — Dynamic

- email signup;
- one embedded owner wallet per user account;
- delegated agent execution flow;
- test wallet-policy restrictions against Margin Call/Uniswap paths;
- ensure Dynamic is optional for bring-your-own-wallet agents.

---

## App experience

### Home/dashboard

Show:

- total user equity;
- total debt;
- count of open positions;
- available Margin Call credit;
- position cards.

Each position card should include ticker, equity, debt, leverage, health, and P&L.

### Open position

Human flow:

1. Select stock.
2. Enter owner equity.
3. Choose requested leverage up to 1.5x.
4. Review expected buying power and risk.
5. Open position.
6. NFT and Position Account are created.
7. User or agent executes the first trade.

Agent flow should expose the equivalent primitive directly through MCP/API/contracts.

### Position page

Show:

- dynamic NFT art;
- current thesis;
- owner;
- executor/manager;
- stock amount;
- USDC balance;
- NAV;
- debt;
- equity;
- leverage;
- health;
- P&L;
- chart;
- trade/thesis journal;
- close/repay/add-collateral actions;
- share link.

### Historical page

Even after the NFT is burned, preserve a read-only historical position page and final image state for closed/liquidated positions.

---

## Security principles

V1 should favor restrictive and legible rules.

- Borrowed USDC cannot be withdrawn to arbitrary addresses.
- Financed stock cannot leave the Position Account while debt exists except through approved sell/close/liquidation paths.
- Uniswap is an execution venue, not a pricing oracle.
- Agent executors never receive NFT ownership merely by being authorized to trade.
- NFT transfer invalidates prior executor permissions.
- Vault repayment is senior to protocol revenue and owner withdrawals.
- Oracle freshness is checked before risk-increasing actions and liquidation.
- Risk parameters are configurable but changes should be admin-controlled and explicit for the hackathon.
- Prefer OpenZeppelin implementations for standards and access-control building blocks.

---

## Build order

### Phase 1 — Protocol core

- OpenZeppelin ERC-4626 Credit Vault.
- OpenZeppelin ERC-721 Position NFT.
- Position Account + factory.
- Margin Call coordinator/risk engine.
- Oracle and execution interfaces.
- Local mocks.
- Full Foundry lifecycle tests.

### Phase 2 — Base execution

- B20 + Chainlink spike.
- Uniswap adapter.
- Tiny real Base open/trade/close test.
- Tiny real liquidation test if practical; otherwise deterministic fork/integration test.

### Phase 3 — Agent surface

- Agent-friendly contract wrappers/API.
- MCP tools.
- Bring-your-own-agent-wallet flow.

### Phase 4 — Human app

- Dynamic email onboarding.
- Embedded owner wallet.
- Position dashboard.
- Delegated executor flow.

### Phase 5 — NFT/social layer

- Dynamic metadata endpoint.
- Dynamic OG image.
- Thesis/history.
- Marketplace-compatible traits.
- Shareable position page.

### Phase 6 — Sponsor/product extensions

- Flash advanced orders.
- Bankr `$MARGINCALL` launch.
- Creator-fee -> treasury -> USDC Credit Vault reporting.

---

## Remaining implementation questions

These should not block starting the protocol core, but must be resolved before meaningful live capital:

1. Exact B20 launch asset list and liquidity quality on Base.
2. Exact Chainlink feed addresses/freshness thresholds per asset.
3. Final maintenance equity ratio and transfer-health threshold after simulation.
4. Exact liquidation-fee basis and edge-case behavior when residual equity is too small to pay all fees.
5. Whether V1 charges an origination/closing fee or keeps normal usage fee-free during the hackathon.
6. Position Account implementation choice: minimal custom account vs a heavier standard smart-account implementation. Default recommendation: minimal custom account.
7. Uniswap adapter implementation details and route allowlisting.
8. Flash smart-account/order-signing requirements.
9. Whether thesis updates are signed offchain records only or also commit a hash/URI onchain.
10. Exact Bankr fee-beneficiary and fee-conversion flow for `$MARGINCALL`.

---

## Product statement

> Margin Call is a margin brokerage for AI agents. Bring a wallet, post USDC equity, and get controlled credit to trade tokenized stocks on Base. Every live account is an isolated, transferable NFT-backed position with transparent debt, health, and liquidation rules.
