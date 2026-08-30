# Margin Call Protocol Overview

## Executive Summary

**Margin Call is a permissionless inventory and execution protocol for tokenized equities.**

Stock holders make single-sided tokenized-equity positions available as **callable inventory**. Buyers and applications can request a firm quote for a block of stock and settle directly against that inventory. The stock provider receives USDC at the current execution price and earns compensation for making the position available.

The protocol separates three functions that are usually bundled together inside a dealer:

1. **Capital provision** — permissionless stock holders provide inventory.
2. **Pricing** — a quote engine determines a firm execution price.
3. **Settlement** — smart contracts atomically exchange stock for USDC.

This creates a market structure that is different from an AMM. Rather than requiring stock and USDC to sit continuously in a two-sided pool, Margin Call aggregates the stock that holders already own and brings in buyer capital only when demand arrives.

The initial target is tokenized equities on Base, particularly markets where AMM liquidity is thin and direct holder-to-buyer execution may be more capital efficient.

---

## 1. The Problem

Tokenized equities inherit the composability of crypto, but liquidity remains uneven.

For the largest names, deep AMMs and professional market makers can provide excellent execution. For the long tail of tokenized stocks, maintaining deep two-sided liquidity for every ticker can be expensive and capital inefficient.

A traditional AMM requires capital on both sides:

`STOCK + USDC -> liquidity pool`

Even when very little trading occurs, both sides of the pool must remain funded.

Margin Call asks a different question:

> If holders already own the stock, can their existing positions become the sell-side inventory for an onchain market?

The result is a single-sided inventory model:

`Stock holder -> callable stock inventory`

`Buyer -> USDC when a trade is requested`

The protocol crosses the two when there is demand.

---

## 2. Core Primitive: Callable Inventory

A tokenized-stock holder deposits or authorizes a stock position as **callable**.

Example:

- Asset: NVDAc
- Quantity: 2.32 NVDAc
- Current value: approximately $500
- Callable: 100%

While the position remains callable, it can earn protocol incentives. If a buyer consumes $100 of the position, that slice of NVDAc is transferred to the buyer and the provider receives approximately $100 USDC at the current execution price.

Afterward, the provider might hold:

- approximately $400 of NVDAc
- $100 USDC
- accrued $CALL
- accrued execution fees

The position is never represented as a permanently fixed $500 claim. The canonical inventory unit is always the underlying stock quantity.

---

## 3. Position Accounting

Each provider should have an individualized inventory position.

```solidity
struct InventoryPosition {
    uint256 id;
    address owner;
    address asset;
    uint256 amount;
    uint256 callableAmount;
    uint256 entryPrice;
    uint256 entryValueUsd;
    uint256 createdAt;
}
```

The **entry price** is a historical snapshot used for analytics and potentially initial reward accounting.

The **current oracle/reference price** is used for live inventory valuation and settlement.

Example:

```text
Position #1048

Asset                 NVDAc
Original quantity     2.3256
Entry price           $215.00
Entry value           $500.00

Current price         $240.00
Current value         $558.14

Callable quantity     2.3256
USDC settled          $0.00
CALL accrued          412 CALL
```

If $100 of inventory is called at the current price, the required NVDAc quantity is calculated at execution time and removed from the position.

---

## 4. Virtual Lots and Provenance

Margin Call does not need to create hundreds of literal onchain lot objects.

A large provider position can be treated as a collection of **virtual lots** that are created only when inventory is consumed.

A $50,000 NVDAc position can service requests for:

- $25
- $100
- $1,000
- $10,000
- or a larger block

When a fill occurs, the protocol records exactly which provider positions supplied it.

Example event:

```solidity
event InventoryCalled(
    uint256 indexed positionId,
    address indexed owner,
    address indexed asset,
    uint256 assetAmount,
    uint256 settlementAmount,
    uint256 executionFee
);
```

This preserves provenance: every unit of stock consumed can be traced back to the provider whose inventory supplied it.

---

## 5. How a Trade Works

A caller requests a block of stock.

Example:

> Buy $50,000 of NVDAc.

The flow:

1. The caller or agent submits an RFQ.
2. The quote engine checks:
   - callable NVDAc inventory
   - current reference price
   - executable DEX prices
   - requested size
   - inventory scarcity
   - volatility and risk parameters
3. The engine returns a firm quote.
4. The quote is signed and valid for a short period.
5. The caller accepts.
6. The smart contract verifies the quote and guardrails.
7. USDC and NVDAc settle atomically.
8. Provider positions are debited for the stock used.
9. Providers receive USDC settlement plus their share of execution economics.

Example:

```text
Reference stock value      $50,000
Execution spread              20 bps
Caller pays                $50,100

Stock delivered            $50,000 of NVDAc
Execution fee                 $100
```

The exact fee structure is a protocol parameter.

---

## 6. Pricing Architecture

Margin Call should not let an LLM invent execution prices.

A clean architecture is:

### LLM / Agent

Interprets intent.

> "Buy me $250,000 of Nvidia, but don't pay more than 30 bps over market."

### Offchain Quote Engine

Computes the actual quote using deterministic market inputs.

Potential inputs:

- Chainlink or other trusted reference feed
- DEX executable prices
- order size
- available callable inventory
- inventory concentration
- current volatility
- replacement/hedging cost
- protocol spread rules

### Smart Contract

Enforces settlement.

Possible checks:

- authorized quote-engine signature
- quote expiry
- maximum permitted deviation from oracle/reference
- maximum spread
- sufficient callable inventory
- minimum output
- pause state

The LLM is the interface. The quote engine is the pricing desk. The contract is the clearing and settlement layer.

---

## 7. Why This Can Beat an AMM

Margin Call is not intended to replace AMMs for every trade.

For a small trade in a deep market, an AMM may be cheaper.

Margin Call becomes more interesting when:

- the tokenized stock has thin onchain liquidity
- the requested order is large relative to AMM depth
- the buyer wants a firm block price
- an application needs guaranteed or reserved capacity

### Example

Suppose a tokenized small-cap stock has:

- $40,000 of AMM liquidity
- $600,000 of callable holder inventory

A buyer wants $75,000.

Executing $75,000 through the AMM could produce significant price impact.

Margin Call can instead aggregate the existing stock holders and return a firm quote against their inventory.

The key capital-efficiency difference:

**AMM**

`stock capital + quote capital must be pre-funded`

**Margin Call**

`stock inventory is pre-committed`

`buyer USDC arrives only when needed`

This may be especially valuable for the long tail of tokenized equities.

---

## 8. Relationship to Traditional OTC / RFQ Markets

Margin Call resembles an automated, decentralized OTC desk.

A traditional dealer bundles:

- balance sheet
- pricing
- risk management
- execution

Margin Call unbundles those functions.

```text
Permissionless providers -> dealer inventory
Quote engine             -> dealer pricing
Smart contracts          -> clearing and settlement
```

The buyer does not negotiate independently with every provider. Margin Call aggregates the inventory and returns one executable quote.

This makes the system closer to an electronic RFQ network than an AMM.

---

## 9. Inventory Providers

Inventory providers are stock holders who make positions callable.

They are not conventional two-sided AMM LPs.

Their value proposition is:

> Keep your stock exposure while it is available. Earn for making it executable. If a slice is called, receive USDC settlement for that slice.

Potential provider economics:

1. **$CALL availability incentives**
2. **Execution fees**
3. **Reservation fees** in future versions

The desired long-term progression is:

`token subsidy -> real execution/reservation revenue`

$CALL can bootstrap inventory, but real utilization should increasingly support provider yield.

---

## 10. $CALL: Inventory Coordination

The cleanest purpose for $CALL is:

> **$CALL coordinates the supply of callable stock inventory.**

Margin Call has a fixed emissions budget for an epoch and allocates it across whitelisted stock markets.

Example:

```text
Weekly CALL emissions: 100,000

NVDAc gauge     20%
AAPLc gauge     15%
COINc gauge     35%
TSLAc gauge     20%
CRCLc gauge     10%
```

If COINc inventory becomes scarce relative to demand, the protocol can direct more of the emissions budget toward COINc providers.

This creates an inventory feedback loop:

```text
Demand consumes inventory
        ↓
Inventory scarcity rises
        ↓
CALL allocation increases
        ↓
Provider yield increases
        ↓
More holders supply stock
        ↓
Inventory replenishes
```

In early versions, gauge allocations can be manually administered.

Later, they can become algorithmic based on measurable variables such as:

- inventory versus target
- utilization
- execution volume
- reservation demand
- concentration
- withdrawal rate

---

## 11. Inventory Targets

Each whitelisted stock can have a target inventory level.

Example:

```text
Asset     Target       Available       Status
NVDAc     $1,000,000     $940,000      Healthy
COINc       $500,000     $135,000      Scarce
AAPLc       $750,000     $910,000      Oversupplied
```

The protocol should not reward one stock because it is "better."

It rewards inventory according to how much the network currently needs that asset.

---

## 12. Execution Fee Model

A simple first execution model:

- provider receives spot/reference settlement for the stock
- caller pays an execution spread
- spread is split between the inventory actually used and the protocol

Example:

```text
Trade notional:       $10,000
Execution fee:          20 bps = $20

Provider share:          80% = $16
Protocol share:          20% = $4
```

If multiple provider positions fill the order, the provider portion is distributed according to actual contribution.

Later, the protocol can consider:

- pooled ticker-level fees
- dynamic spreads
- size-based pricing
- scarcity-based spreads
- reservation fees

---

## 13. Reservation Markets: Future Extension

A caller may want to guarantee inventory before it needs to execute.

Example:

> Reserve $500,000 of NVDAc for the next six hours.

Margin Call can lock the necessary callable inventory and charge a reservation fee.

This adds a third provider revenue stream:

- $CALL for availability
- reservation fees for committed capacity
- execution fees when inventory is consumed

Reservation is one of the strongest cases where pre-positioned inventory provides functionality that a spot AMM cannot guarantee.

---

## 14. Smart Accounts and Redeployment

Provider positions are path dependent.

One holder may have:

- 20% of NVDA called
- settlement left in USDC
- another provider may auto-rebuy NVDA
- another may rotate into COINc

For that reason, Margin Call should treat user positions individually even if inventory is aggregated for execution.

A smart-account-based experience could show:

```text
NVDA POSITION

NVDA remaining          $412
USDC settlement         $100
CALL earned             428
Execution fees          $1.42
```

Then:

> Redeploy $100

- Rebuy NVDA
- Supply COINc — higher current CALL allocation
- Supply AAPLc
- Keep USDC

Users can eventually opt into automated rules, such as:

- automatically rebuy the same stock after a call
- redeploy to the highest-incentive whitelisted stock
- keep a fixed cash allocation

---

## 15. Agentic Frontend

One first-party product can be an agentic trading interface.

The user says:

> "Buy me $25,000 of Nvidia."

The agent:

1. obtains a Margin Call quote
2. obtains DEX/router quotes
3. compares execution
4. chooses the best venue subject to user constraints
5. executes
6. reports settlement

For example:

```text
Aerodrome      41 bps estimated cost
Uniswap        33 bps estimated cost
Margin Call    18 bps firm quote

Route: Margin Call
```

For a small liquid trade, the agent may select a DEX instead.

The frontend therefore optimizes for the user rather than forcing every trade through Margin Call.

Potential commands:

- "Buy $5,000 of Nvidia."
- "Build me a $10,000 AI portfolio."
- "Sell half my Tesla and move it into Microsoft."
- "Don't execute above 25 bps."
- "Redeploy any Margin Call settlements back into the same stock."

---

# 16. Example Product: Stock Gacha / Randomized Stock Discovery

The original stock-gacha concept can exist as one application built on Margin Call.

It is not the protocol itself.

## Product Concept

A user pays a fixed amount of USDC to open a stock position.

Example:

> Pay $10 USDC -> receive a randomized amount of a whitelisted tokenized stock.

The payout distribution is positively skewed:

- most outcomes are modest
- occasional outcomes are larger
- a very small number are significant jackpots

Example distribution:

```text
Very common       $3-$8 stock
Common            approximately $10
Uncommon          $20-$50
Rare              $100-$250
Jackpot            $500+
```

The important psychological mechanic is not simply ticker randomness. It is the possibility of a large multiple.

Example reveal:

```text
POSITION FILLED

NVDA
$247.50

24.75x
```

The user receives the actual tokenized stock.

## How It Uses Margin Call

The gacha application does not need to maintain its own stock treasury.

It requests inventory from Margin Call.

Example:

1. User pays $10 USDC.
2. Randomness determines a $100 NVDAc payout.
3. The gacha application requests $100 of NVDAc from Margin Call.
4. Margin Call selects callable NVDAc inventory.
5. The provider's NVDAc is transferred to the winner.
6. Provider receives USDC settlement.
7. The provider's remaining callable position decreases.
8. The provider continues earning CALL on the remaining inventory.

This creates real demand for the underlying protocol.

```text
Gacha users
    ↓
consume stock inventory
    ↓
Margin Call utilization
    ↓
execution fees
    ↓
provider economics
```

## Why This Product Matters

The gacha product can serve as Margin Call's first demand engine.

Instead of launching a vault and waiting for third-party applications, Margin Call can prove that:

- inventory can be sourced
- inventory can be consumed repeatedly
- providers can be settled
- utilization can be measured
- stock-specific demand changes over time
- CALL gauges can respond to real scarcity

It also demonstrates something uniquely enabled by tokenized equities:

> A consumer application can deliver real stocks as programmable onchain rewards.

---

## 17. Other Products That Can Use Margin Call

Potential inventory consumers include:

### Block Trade / OTC Terminal

A direct RFQ interface for larger tokenized-equity trades.

### Agentic Brokerage

Natural-language portfolio construction and execution across Margin Call and DEX venues.

### Stock Rewards

Consumer apps can request actual stock for rewards or loyalty programs.

### Structured Settlement

Products that must deliver a specific stock upon an outcome.

### Portfolio / Basket Creation

Applications can assemble tokenized-equity baskets from firm inventory.

### Reservation Markets

Apps can reserve future execution capacity for a ticker.

### Autonomous Portfolios

Smart accounts can hold stocks, make them callable, collect settlements, and automatically redeploy capital.

---

## 18. Comparison: Margin Call vs AMM vs Twofold

### Conventional AMM

```text
LP capital -> stock + USDC pool
trade -> AMM curve
LP earns -> swap fees
```

Best at continuous, high-frequency liquidity.

### Twofold

```text
LP capital -> AMM
idle quote capital -> lending vault
trade arrives -> just-in-time AMM liquidity
LP earns -> lending yield + swap fees
```

Twofold improves the efficiency of AMM capital.

### Margin Call

```text
stock holder -> single-sided callable inventory
buyer -> USDC when demand arrives
protocol -> firm quote and direct settlement
provider earns -> CALL + execution/reservation fees
```

Margin Call asks whether some tokenized-equity markets need a continuously funded AMM at all.

The systems can coexist.

For a $100 NVDAc purchase, a deep AMM may win.

For a $100,000 purchase in a thin stock market, Margin Call may provide the better quote.

---

## 19. Initial V1

The first technical prototype should remain deliberately small.

### V1 Goal

Prove:

`Wallet A -> Margin Call -> Wallet B`

using a real B20 tokenized stock on Base.

### V1 Functions

- whitelist tokenized stock
- configure oracle/reference feed
- deposit stock
- create inventory position
- mark quantity callable
- read total callable inventory
- withdraw unconsumed inventory
- execute a controlled stock-for-USDC call
- settle provider
- emit provenance events

No token emissions are required to prove the core market structure.

The first economic test can be run with a manually configured execution spread.

---

## 20. Core Metrics

Margin Call should measure whether the inventory is actually useful.

### Inventory Utilization

`stock value called during period / average callable inventory`

### Quote Win Rate

`Margin Call quotes selected / total comparable RFQs`

### Execution Savings

Difference between Margin Call execution and best available DEX route.

### Provider Revenue Mix

Percentage of provider yield coming from:

- CALL incentives
- execution fees
- reservation fees

Over time, the protocol should want real fee revenue to represent a greater share of provider returns.

### Inventory Coverage

Available callable inventory relative to target inventory by ticker.

---

## 21. Protocol Thesis

The protocol thesis is not:

> Tokenized stocks need another yield farm.

It is:

> **The long tail of tokenized equities may be better served by single-sided holder inventory and direct RFQ execution than by requiring deep two-sided AMM liquidity for every ticker.**

Margin Call turns existing stock ownership into distributed dealer inventory.

The protocol separates:

- **capital** — supplied permissionlessly by stock holders
- **pricing** — produced by a deterministic quote engine
- **settlement** — enforced by smart contracts

AMMs remain an important execution venue. Margin Call competes where committed single-sided inventory can provide a firmer or more capital-efficient market.

---

## 22. One-Line Positioning

**Margin Call turns tokenized-stock holders into a permissionless dealer network.**

Alternative:

**Single-sided stock inventory. Firm onchain execution.**

For inventory providers:

**Keep your stocks. Get paid to make them callable.**

For traders and applications:

**Request a block. Get a firm quote. Settle onchain.**
