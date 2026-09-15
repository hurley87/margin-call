# Pinned Base mainnet assumptions

Issue #420 verification for Margin Call's Base-mainnet dependencies and risk
assumptions. The suite verifies deployed NVDAc, token, oracle, and execution
dependencies; oracle-state and feed-cadence assumptions; raw NVDAc valuation
against the Coinbase/Chainlink total-return feed; and demo-sized USDC/NVDAc swaps.
These are verification fixtures only; no production `OracleAdapter`, valuation
module, or execution adapter is implemented here.

## Run from the repository root

Restore the existing pinned Solidity libraries with `pnpm install:forge-deps`.
Install [Base's Foundry build](https://github.com/base/base-anvil#base-anvil-bases-foundry-build)
alongside stock Foundry, then select the harness version:

```sh
base-foundryup -i v1.1.1
export BASE_MAINNET_RPC_URL='https://mainnet.base.org'
pnpm test:contracts:fork
```

The public URL worked for this snapshot. An archive-capable provider can be supplied
through the same environment variable; never commit a credential-bearing URL.
The command fails if the variable is absent, the pinned executor is missing, or
any assertion fails. RPC errors are failures, not skipped tests. Add `-vvvv` for
the complete native transfer and aggregator call traces.

The executor is Base Foundry **v1.1.1**, commit
`dccbdfd0b37d364cc50e0e15f1686ab029543c6f` (reported Forge version
`1.6.0-v1.1.1`). The script checks that commit. Solidity `0.8.29`, compiler target
`cancun`, optimizer, and library pins inherit the existing workspace configuration.
The `base-mainnet` profile selects `contracts/fork/`; normal `pnpm test:contracts`
and `pnpm test:contracts:ci` retain the RPC-free suite and stock Foundry v1.4.3.

NVDAc is a **native B20 precompile**: `eth_getCode` returns `0xef`. Stock Forge
cannot execute that marker. Base Forge supplies Base's native implementation;
no Solidity stand-in is installed. See the upstream
[native precompile testing documentation](https://github.com/base/base-std#live-precompile-testing).

## Snapshot and verified facts

Block **51,356,323**, selected from the RPC's finalized head:

- UTC timestamp: **2026-09-15 19:53:13** (`1789501993`).
- Block hash: `0x289d275f39df2558084765b7f45204e96da26b7512e4d998144fcc9bde86add5`.
- Parent hash: `0xac0ed6b214824779a5b8f953a450dba91bdbebc261b760ccb81784570646b6a4`.
- Tests assert chain ID **8453**, block number, timestamp, and parent hash.

| Dependency        | Address                                      | Verified at the pinned block                                                                                  |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| NVDAc             | `0xb20000000000000000000078ee7ce2fE4908108C` | Native marker `0xef`, symbol `NVDAc`, decimals `8`, raw balance/transfer/supply reads                         |
| NVDA feed         | `0x04689a41629776563E6822F76f2e57D148d28513` | Code exists, decimals `8`, description `Coinbase NVDA`, complete positive non-future round                    |
| Coinbase registry | `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD` | Code exists; `getOracleParams(NVDAc)` returns `(1000000000000000000, false)`                                  |
| Sequencer feed    | `0xBCF85224fc0756B9Fa45aA7892530B47e10b6433` | Code exists, description `L2 Sequencer Uptime Status Feed`, standard `latestRoundData()` succeeds, answer `0` |
| USDC              | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Code exists, symbol `USDC`, decimals `6`                                                                      |

Exact `latestRoundData()` tuples are asserted in the test:

| Field             | NVDA                   | Sequencer              |
| ----------------- | ---------------------- | ---------------------- |
| `roundId`         | `36893488147419103594` | `18446744073709551636` |
| `answer`          | `21178500000`          | `0`                    |
| `startedAt`       | `1789483930`           | `1782491507`           |
| `updatedAt`       | `1789483945`           | `1789491993`           |
| `answeredInRound` | `36893488147419103594` | `18446744073709551636` |

These snapshot values are historical observations. Freshness and state policy are
pinned below, not in the raw aggregator snapshot test.

## Registry ABI provenance

The minimal test interface was checked against Blockscout's
[verified OracleRegistry source and ABI](https://base.blockscout.com/address/0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD?tab=contract)
([JSON source/ABI](https://base.blockscout.com/api/v2/smart-contracts/0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD)).
Both `src/interfaces/IOracleRegistry.sol` and the implementation specify:

```solidity
function getOracleParams(address token)
    external view returns (uint256 multiplier, bool paused);
```

The implementation reads its private per-token pause mapping and calls the token's
`multiplier()`. The fork trace exercises both reads. There is no assumed
`paused(address)` interface. No address or decimal discrepancy was found relative
to #420; the native B20 executor requirement is an additional tooling finding.

## Transfer setup and evidence

The test impersonates existing holder
`0xf8191D98ae98d2f7aBDFB63A9b0b812b93C873AA` using `vm.prank` **only inside the fork**.
Its pinned raw balance was `79781200000`. The native `transfer` sends `12345678`
raw units to the deterministic test recipient
`0x37e35053Ba27876893Ccd5693Cc0b767E01DBAd9` and returns `true`. Assertions check
the exact sender debit and recipient credit, with unchanged total supply
(`1989391807728` observed). This exercises the native transfer path with issuer
policy state inherited from mainnet. Success applies to this sender/recipient and
snapshot, not every future transfer.

No balances, roles, pause flags, policy storage, or bytecode are overwritten.
No mock calls, private keys, signatures, or mainnet transactions are used.

## Raw-unit valuation and B20 semantics

Test-only reference: `contracts/test/valuation/NvdaValuation.sol`. Its RPC-free tests
pin this exact formula for the verified decimal configuration:

```text
valueUsdcRaw =
    stockAmountRaw
    * feedAnswer
    * 10^6
    / 10^8
    / 10^8

equivalently:

valueUsdcRaw = floor(stockAmountRaw * feedAnswer / 10^10)
```

The implementation uses OpenZeppelin `Math.mulDiv` with explicit floor rounding.
For lender-risk valuation, rounding down is conservative: a sub-micro-USDC
remainder cannot overstate collateral NAV or delay liquidation. Full-precision
`mulDiv` also permits an intermediate `stockAmountRaw * feedAnswer` larger than
`uint256` when the normalized result fits.

`balanceOf` and `transfer` are the canonical raw custody/accounting surface. At the
pinned block, the holder's `balanceOf` is `79781200000` raw units and the native
transfer debits/credits exactly its requested raw amount. NVDAc returns `8` decimals.
The deployed B20 presentation reads `scaledBalanceOf`, `toScaledBalance`, and
`toRawBalance` are also exercised. The scaled values happen to equal the raw amount
at this snapshot because `multiplier()` is `1e18`; they must not replace raw custody
amounts when a future multiplier differs. Base documents that scaled/UI reads apply
`raw * multiplier / 1e18`, while raw balances and transfer amounts stay unchanged:
https://github.com/base/base-std/blob/main/docs/guides/scheduling-stock-splits.md

The pinned native runtime rejects the newer ERC-8056 aliases such as
`uiMultiplier()` even though current Base source documents them as aliases. The
legacy/canonical B20 methods above are the callable snapshot evidence. This ABI
version difference does not affect raw custody or valuation semantics.

The registry returns the same current `1e18` multiplier as NVDAc. Chainlink
documents that the Coinbase NVDA feed is already a Total Return Value:

```text
feed token price = underlying equity market price * B20 multiplier
```

Therefore the reference API accepts only the raw token amount and the already
multiplier-adjusted feed answer. Applying `multiplier()` again double counts the
corporate-action/dividend adjustment. The RPC-free invariant demonstrates that a
hypothetical `1.02e18` second application incorrectly changes `$220.00` to `$224.40`.
Today's `1e18` happens to hide that bug; this snapshot alone does not prove future
non-1 behavior. The no-double-application rule comes from the documented Base raw/UI
split and Chainlink total-return semantics:
https://docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase

Pinned examples:

- `1 NVDAc` at `$220.00` -> `220000000` USDC raw (`$220.00`).
- `1.25 NVDAc` (`125000000` raw) at `$220.00` (`22000000000`) ->
  `275000000` USDC raw (`$275.00`).
- `0.12345678 NVDAc` at the pinned `$211.785` answer -> `26146294`
  USDC raw (`$26.146294`), flooring the remaining `0.1523` base unit.
- `5.75 NVDAc` at the pinned answer -> `1217763750` USDC raw
  (`$1,217.763750`).
- One smallest NVDAc raw unit at `$220.00` -> `2` USDC raw; a value below
  one USDC base unit rounds to zero.

Current `BaseMainnetTest` expected result: **9 passed, 0 failed, 0 skipped**.

## Execution route

`contracts/fork/NvdaExecutionRoutes.t.sol` proves real exact-input swaps in both
directions through the selected direct **Uniswap V3** USDC/NVDAc pool at the
pinned block. It also preserves equivalent Aerodrome Slipstream execution as
benchmark evidence:

| Selected Uniswap contract | Address                                      | Pinned evidence                                                     |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| V3 factory                | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | Factory returns the selected pool for USDC/NVDAc at fee tier 3000   |
| SwapRouter02              | `0x2626664c2603336E57B271c5C0b26F421741e481` | Real swaps execute; router reports the selected V3 factory          |
| QuoterV2                  | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` | Direct exact-input quotes equal actual output from the same state   |
| USDC/NVDAc pool           | `0x60661b315553EB81872deEA9a66d567Cf0CCd33B` | Factory, pair, fee, tick spacing, liquidity, and state are asserted |

The selected path is direct: `USDC --fee 3000--> NVDAc`, reversed for sales.
The fee tier is **3000 pips (30 bps)**. Addresses are checked against
[Uniswap's Base deployment list](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments),
then verified against deployed code and factory/router getters on the fork.
The test's router struct is the exact no-deadline `ExactInputSingleParams` from
[Uniswap's `IV3SwapRouter`](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol).

The preserved Aerodrome benchmark uses factory
`0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef`, router
`0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F`, quoter
`0x514c8B5f54112481E28028F1166Bd78501089259`, and pool
`0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9`. These addresses come from
Aerodrome's
[upstream Slipstream deployment list](https://github.com/aerodrome-finance/slipstream#gauges-v3-deployment).
Its deployed factory returns that pool for tick spacing 10, and its dynamic fee
was **500 pips (5 bps)** at the snapshot.

### Pinned pool state

| Field                  |             Aerodrome benchmark pool |              Uniswap V3 V1 pool |
| ---------------------- | -----------------------------------: | ------------------------------: |
| Pool                   |                      `0x853F...7ab9` |                 `0x6066...d33b` |
| Factory                |                      `0xf8f2...61Ef` |                 `0x3312...FDfD` |
| Tick spacing           |                                 `10` |                            `60` |
| Fee                    |          `500` pips (5 bps, dynamic) |            `3000` pips (30 bps) |
| Active liquidity       |                 `30,696,200,673,999` |               `117,332,603,442` |
| Tick                   |                              `-7522` |                         `-7500` |
| `sqrtPriceX96`         |      `54396358618292584967209825687` | `54453769713070014786430184762` |
| Pool USDC balance      |                     `633,202.641509` |                 `10,841.574687` |
| Pool NVDAc raw balance | `747,987,245,703` (`7,479.87245703`) | `5,522,489,748` (`55.22489748`) |

Token balances are context, not constant-product reserves: both venues use
concentrated liquidity, and `liquidity()` is only currently active liquidity.

### Selected Uniswap demo-size execution results

All rows start from the unchanged pinned pool state. Positive deviation is worse
than the oracle mark; negative deviation is favorable. For a buy,
`oracleFairValue` is the USDC input and `actualExecutionValue` is the received raw
NVDAc valued once with `NvdaValuation` at the pinned feed answer
`21178500000`. For a sale, fair value is the input raw NVDAc's oracle USDC value
and actual value is the USDC received. Each QuoterV2 quote is taken immediately
before the swap from the same state and equals both SwapRouter02's return value
and the recipient's output-token balance delta exactly.

| USDC input | QuoterV2 / actual NVDAc output | Output oracle value | Total oracle-relative deviation |
| ---------: | -----------------------------: | ------------------: | ------------------------------: |
|      `$10` |                   `0.04709509` |         `$9.974033` |                     `25.96 bps` |
|      `$50` |                   `0.23544184` |        `$49.863050` |                     `27.39 bps` |
|     `$100` |                   `0.47079948` |        `$99.708267` |                     `29.17 bps` |
|     `$250` |                   `1.17636750` |       `$249.136990` |                     `34.52 bps` |

| Approx. notional |              Raw NVDAc input | Oracle fair value | QuoterV2 / actual USDC output | Total oracle-relative deviation |
| ---------------: | ---------------------------: | ----------------: | ----------------------------: | ------------------------------: |
|            `$10` |   `4,721,769` (`0.04721769`) |       `$9.999998` |                   `$9.965010` |                     `34.98 bps` |
|            `$50` |  `23,608,848` (`0.23608848`) |      `$49.999998` |                  `$49.813432` |                     `37.31 bps` |
|           `$100` |  `47,217,697` (`0.47217697`) |      `$99.999999` |                  `$99.597805` |                     `40.21 bps` |
|           `$250` | `118,044,242` (`1.18044242`) |     `$249.999997` |                 `$248.776805` |                     `48.92 bps` |

The total is **total oracle-relative deviation**, not “slippage.” For reporting,
the test evidence is decomposed as:

```text
total oracle-relative deviation
= venue fee + AMM price impact + pool/oracle basis
```

The fee is the fixed 30 bps tier. Price impact compares actual output with the
pre-swap spot output after that fee. Pool/oracle basis is the signed residual, so
the rounded components sum to the total:

| Direction / size | Venue fee | AMM price impact | Pool/oracle basis |     Total |
| ---------------- | --------: | ---------------: | ----------------: | --------: |
| Buy `$10`        | 30.00 bps |         0.37 bps |         -4.41 bps | 25.97 bps |
| Buy `$50`        | 30.00 bps |         1.80 bps |         -4.41 bps | 27.39 bps |
| Buy `$100`       | 30.00 bps |         3.59 bps |         -4.42 bps | 29.17 bps |
| Buy `$250`       | 30.00 bps |         8.95 bps |         -4.43 bps | 34.52 bps |
| Sell `~$10`      | 30.00 bps |         0.59 bps |          4.40 bps | 34.99 bps |
| Sell `~$50`      | 30.00 bps |         2.92 bps |          4.40 bps | 37.31 bps |
| Sell `~$100`     | 30.00 bps |         5.83 bps |          4.39 bps | 40.22 bps |
| Sell `~$250`     | 30.00 bps |        14.57 bps |          4.35 bps | 48.93 bps |

Tests seed only the test contract's USDC balance with Foundry's local `deal`
fixture. Sale tests impersonate the already documented NVDAc holder and transfer
the exact raw input through the native B20 contract. The router then spends that
raw `balanceOf` delta through `transferFrom`. No pool/token/router bytecode,
liquidity, reserve, issuer policy, or quote result is mocked or overwritten, and
no mainnet transaction is submitted. Every demo size is a separate Foundry test,
so every quote and swap begins from block `51356323`; no prior trade contaminates
the pool. Both directions also prove that `amountOutMinimum = quote + 1` reaches
the real SwapRouter02 revert path.

### Aerodrome benchmark comparison

Aerodrome's executable results remain **21.65/21.66/21.67/21.71 bps** for buys
and **-11.68/-11.67/-11.66/-11.62 bps** for sales at the same sizes. Its 5 bps
fee, approximately `0.0021/0.0110/0.0222/0.0558 bps` price impact, and stronger
pinned liquidity produced more output than Uniswap in every comparison. This
result is retained; it is benchmark evidence, not the V1 route.

### Historical Uniswap sampling and V1 bound

The public Base RPC reproduced three additional historical blocks where the
deployed pool existed and `OracleStatePolicy` classified the onchain feed,
registry, and sequencer observation as `LIVE`. These are quote samples, not
executed historical transactions:

|      Block |    Timestamp |                Feed / age | `$250` buy output / deviation | Fixed `1.18044242 NVDAc` sale output / deviation |
| ---------: | -----------: | ------------------------: | ----------------------------: | -----------------------------------------------: |
| `51314900` | `1789419147` |  `$211.95000000` / `820s` |    `1.17550642` / `34.05 bps` |                      `$249.050711` / `45.72 bps` |
| `51345000` | `1789479347` |  `$213.02895000` / `594s` |    `1.16898055` / `38.93 bps` |                      `$250.440186` / `40.88 bps` |
| `51351200` | `1789491747` | `$211.78500000` / `7802s` |    `1.17600276` / `37.61 bps` |                      `$248.898525` / `44.05 bps` |

At `$250`, the sampled price impacts were `8.94–10.72 bps` for buys and
`9.16–12.80 bps` for sales. The signed pool/oracle-basis residual ranged from
`-4.88` to `-1.33 bps` on buys and `+1.26` to `+4.82 bps` on sales. Together
with the pinned executable snapshot, the largest observed total adverse
deviation was the executable `$250` sale at **48.92 bps**.

Margin Call is entering Runtime's Uniswap **New Assets, New Agents** track, whose
requirements call for integrating Uniswap's API, AMM, or CCA for tokenized
real-world assets or trading agents. Uniswap therefore remains the intended
V1/hackathon execution venue, consistent with the PRD. The production
`ExecutionAdapter` must use the approved Uniswap path and enforce the stricter of
caller `minOut` and a protocol oracle-derived minimum so materially poor
execution fails closed.

The selected V1 maximum adverse oracle-relative execution deviation is
**100 bps (1.00%)**. The rejected 30 bps proposal would fail normal observed
Uniswap execution. The selected bound is just over twice the 48.92 bps observed
maximum, leaving about 51 bps of headroom for ordinary basis and demo-size impact
while still rejecting a pool price more than 1% adverse to the live oracle. It
includes the 30 bps venue fee and applies to the complete realized deviation,
not to price impact alone. This is a conservative V1 hackathon/demo assumption
for the verified `$10–$250` range, not a permanent production risk parameter;
recalibrate it before larger trades, liquidity changes, or meaningful capital.

Current `NvdaExecutionRoutesTest` expected result:
**25 passed, 0 failed, 0 skipped**.

## Reusable V1 test fixtures

`contracts/test/fixtures/BaseV1Constants.sol` is the test-support source of truth
for the verified Base chain ID, NVDAc/USDC/oracle/sequencer addresses, selected
Uniswap factory/router/quoter/pool and fee, decimal configuration, 8-hour live
age, 3600-second sequencer grace period, and 100 bps execution bound. Fork tests,
oracle policy, and valuation references consume those constants rather than
copying the values.

`OracleFixtures.sol` builds representative RPC-free `LIVE`, explicit `HELD`,
stale `INVALID`, sequencer-down, sequencer-recovery-grace, and both post-hold
recovery observations. Each observation is classified by `OracleStatePolicy`;
the fixture does not duplicate or replace the policy.

`ExecutionFixtures.sol` pins the approved bidirectional USDC/NVDAc pair and fee
and provides test-only reference calculations for the protocol oracle floor:

```text
effectiveMinOut = max(callerMinOut, protocolOracleMinOut)

buy min NVDAc =
    ceil(usdcInRaw * 10^10 * 9900 / (liveFeedAnswer * 10000))

sell min USDC =
    ceil(nvdaInRaw * liveFeedAnswer * 9900 / (10^10 * 10000))
```

Both minimum outputs round up. This is conservative for execution enforcement:
integer truncation cannot permit a realized output fractionally worse than the
maximum 100 bps adverse oracle-relative deviation. This differs intentionally
from collateral valuation, which rounds NAV down to avoid overstating collateral.

## Oracle-state policy

Test-only reference: `contracts/test/oracle/OracleStatePolicy.sol`. RPC-free tests
live in `contracts/test/oracle/` and run with `pnpm test:contracts`. Fork cadence
evidence is `contracts/fork/NvdaOracleCadence.t.sol`, which scans all phase-2 rounds
through `NvdaFeedCadence`.

This is not `OracleAdapter`, `MarginCall`, or any production contract.

### Proven semantics

| State     | Onchain proof                                                                                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HELD`    | Coinbase registry `getOracleParams(NVDAc).paused == true`. Stale `updatedAt` alone is not `HELD`.                                                                                                                                                                                              |
| `LIVE`    | Registry not paused; sequencer answer `0`; `block.timestamp - sequencer.startedAt > 3600`; complete positive non-future round; age `<= MAX_LIVE_AGE`; after an explicit hold, `roundId` and `updatedAt` are both strictly newer than the held round.                                           |
| `INVALID` | Anything that cannot prove `LIVE` or explicit issuer `HELD`, including failed feed/registry/sequencer reads, sequencer down, sequencer recovery grace, stale unpaused data, weekend/off-hours stale data, zero/negative/incomplete/future rounds, and unpause without a newer post-hold round. |

Pause is classified before sequencer and freshness checks: an explicit issuer pause is
`HELD` even if the last mark is stale. A failed registry read cannot prove that pause
and is `INVALID`.

The reference classifier is stateless. The eventual production `OracleAdapter` must
retain enough state to enforce the post-`HELD` fresh-round rule: persist
`heldRoundId` / `heldUpdatedAt` (or an equivalent frozen-round identity) while the
registry is paused, and after unpause require a strictly newer qualifying Chainlink
round before returning `LIVE`. This verification suite does not implement
`OracleAdapter`.

### Sequencer grace period

Pinned to **3600 seconds**, matching Chainlink's current Base sequencer consumer
example (`GRACE_PERIOD_TIME = 3600` and `timeSinceUp <= GRACE_PERIOD_TIME` reverts):
https://docs.chain.link/data-feeds/l2-sequencer-feeds

The classifier fails closed while the sequencer answer is not `0`, while
`startedAt == 0`, and for the full 3600 seconds after `startedAt`. At 3601 seconds
a qualifying price round may become `LIVE`.

### Historical sampling

`NvdaOracleCadenceTest` loads every phase-2 NVDA round through `getRoundData` on the
pinned fork and `NvdaFeedCadence.summarize` reproduces the aggregates below
(block `51356323`, **362** local rounds, `updatedAt` `1785964885`–`1789483945`).
No heartbeat constant is published on the aggregator. **336 / 361** consecutive
moves were 0.40–0.70% (median 0.52%), so quiet periods can last hours between
updates.

| Statistic              |              Value | Meaning                                                  |
| ---------------------- | -----------------: | -------------------------------------------------------- |
| Rounds scanned         |                362 | Phase-2 local rounds 1–362                               |
| Consecutive gaps       |                361 | `updatedAt[i+1] - updatedAt[i]`                          |
| Min gap                |              `30s` | Tightest consecutive update                              |
| Median gap             |     `2102s` (~35m) | Middle gap after sorting                                 |
| Max gap                | `280578s` (~77.9h) | Labor Day weekend silence                                |
| Max gap `<= 8h`        |  `27196s` (~7.55h) | Longest silence still inside `MAX_LIVE_AGE`              |
| Min gap `> 8h`         |  `28936s` (~8.04h) | Shortest silence that an age-only policy treats as stale |
| Gaps `> 8h`            |                 24 | Including overnight, weekend, and holiday silences       |
| Gaps `> 24h` / `> 48h` |              6 / 6 | All six are weekend or Labor Day gaps                    |
| Pinned snapshot age    |  `18048s` (~5.01h) | Latest round vs block `51356323`                         |

Selected rounds remain useful examples. Session labels are offchain interpretation
of those timestamps, not an onchain calendar:

| Local round |              `roundId` |  `updatedAt` | ET (UTC-4)           | Notes                                             |
| ----------: | ---------------------: | -----------: | -------------------- | ------------------------------------------------- |
|         313 | `36893488147419103545` | `1788545055` | Fri 2026-09-04 14:04 | Last Friday tick before Labor Day                 |
|         314 | `36893488147419103546` | `1788825633` | Mon 2026-09-07 20:00 | Holiday weekend resume (`280578s`)                |
|         327 | `36893488147419103559` | `1788961817` | Wed 2026-09-09 09:50 | Start of a 5.23h same-day regular-hours quiet gap |
|         328 | `36893488147419103560` | `1788980639` | Wed 2026-09-09 15:03 | End of that gap (`18822s`)                        |
|         334 | `36893488147419103566` | `1789050187` | Thu 2026-09-10 10:23 | Start of a 6.74h regular → post quiet gap         |
|         335 | `36893488147419103567` | `1789074441` | Thu 2026-09-10 17:07 | End of that gap (`24254s`)                        |
|         346 | `36893488147419103578` | `1789155215` | Fri 2026-09-11 15:33 | Last Friday tick                                  |
|         347 | `36893488147419103579` | `1789344035` | Sun 2026-09-13 20:00 | Sunday reopen (`188820s`, 52.45h)                 |
|         360 | `36893488147419103592` | `1789418327` | Mon 2026-09-14 16:38 | Last Monday post-market tick                      |
|         361 | `36893488147419103593` | `1789478753` | Tue 2026-09-15 09:25 | Tuesday pre-market (`60426s`, 16.79h)             |
|         362 | `36893488147419103594` | `1789483945` | Tue 2026-09-15 10:52 | Latest at the pinned block (age `18048s`)         |

Additional `latestRoundData()` calls at other historical blocks, with the registry
unpaused in both cases:

|      Block | Timestamp                              | Latest local round |               Age | Classification under this policy |
| ---------: | -------------------------------------- | -----------------: | ----------------: | -------------------------------- |
| `51262927` | `1789315201` (Sun 2026-09-13 12:00 ET) | 346 (Friday close) | `159986s` (44.4h) | `INVALID`                        |
| `51334926` | `1789459199` (Mon 2026-09-14 22:00 ET) |  360 (Monday post) |  `40872s` (11.4h) | `INVALID`                        |

Sampled blocks never showed `paused == true`. `HELD` is therefore proven from the
verified registry ABI plus classifier fixtures, not from a mainnet pause snapshot.

### Selected `MAX_LIVE_AGE`

**28800 seconds (8 hours).**

This is a V1 risk/availability tradeoff from the scanned cadence, not a precise
session boundary. Eight hours is longer than the pinned Tuesday age (5.01h) and
longer than many quiet multi-hour update gaps, including the 6.74h regular → post
example, so financed actions can still see `LIVE` during a quiet open session. It
is shorter than typical weekday overnight silence (12–18h) and weekend/holiday
last-close (52–78h), so those unpaused last prints become `INVALID` rather than
`HELD` or `LIVE`.

An age-only policy can still treat a last price as `LIVE` for up to 8 hours into
a quiet or closed period. The longest scanned gap still `<= 8h` is 7.55h; the
shortest scanned gap `> 8h` is 8.04h. Solidity intentionally does not consult an
offchain NYSE/NASDAQ calendar, so V1 cannot know that a silence is "overnight"
versus "quiet regular hours." Offchain UI/Convex may annotate weekends and
holidays. A 6h bound would reject more quiet open-session marks; a 12h bound
would keep overnight last-close `LIVE`.

Chainlink documents these feeds as 24/5 with no off-hours heartbeat. Unpaused
weekend, holiday, and overnight last-close is `INVALID`, not `HELD`. That matches
issue #420 and does not manufacture a corporate-action hold from staleness.

### How to run

```sh
pnpm test:contracts
BASE_MAINNET_RPC_URL='https://mainnet.base.org' pnpm test:contracts:fork
```

Use an archive-capable URL through the same environment variable for historical
`getRoundData` / extra-block checks. Never commit a credential-bearing URL.

Fork profile expected result: `BaseMainnetTest` **9 passed**,
`NvdaOracleCadenceTest` **5 passed**, and `NvdaExecutionRoutesTest` **25 passed**.
RPC-free policy, cadence-helper, and valuation tests run in the normal suite.
