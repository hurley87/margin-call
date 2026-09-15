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
directions through the direct **Aerodrome Slipstream Gauges V3** USDC/NVDAc pool
at the pinned block. Aerodrome is retained as the strongest measured benchmark,
not selected as the V1 venue:

| Contract        | Address                                      | Pinned evidence                                                |
| --------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Pool factory    | `0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef` | Factory recognizes and returns the benchmark pool              |
| Swap router     | `0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F` | Router bytecode exists and reports the benchmark factory       |
| Quoter          | `0x514c8B5f54112481E28028F1166Bd78501089259` | Direct exact-input quotes succeed                              |
| USDC/NVDAc pool | `0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9` | Token pair, factory, tick spacing, fee, and state are asserted |

The path is direct: `USDC --tick spacing 10--> NVDAc`, reversed for sales. The
factory's dynamic fee and the pool's `fee()` both resolve to **500 pips (5 bps)**
at block `51356323`. This is the actual fee at the snapshot, not a promise that a
dynamic fee can never change.

The router, quoter, and factory addresses come from Aerodrome's
[upstream Slipstream deployment list](https://github.com/aerodrome-finance/slipstream#gauges-v3-deployment).
The pool is not taken on trust from a market-data site: the deployed factory's
`getPool(USDC, NVDAc, 10)` returns it on the fork. Test interfaces are minimal
subsets of the corresponding upstream interfaces.

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

### Demo-size execution results

All rows start from the unchanged pinned pool state. Positive deviation is worse
than the oracle mark; negative deviation is favorable. For a buy,
`oracleFairValue` is the USDC input and `actualExecutionValue` is the received raw
NVDAc valued once with `NvdaValuation` at the pinned feed answer
`21178500000`. For a sale, fair value is the input raw NVDAc's oracle USDC value
and actual value is the USDC received.

| USDC buy input | Actual NVDAc received | Actual oracle value | Total oracle deviation |
| -------------: | --------------------: | ------------------: | ---------------------: |
|   `$10.000000` |          `0.04711543` |         `$9.978341` |            `21.65 bps` |
|   `$50.000000` |          `0.23557695` |        `$49.891664` |            `21.66 bps` |
|  `$100.000000` |          `0.47115338` |        `$99.783218` |            `21.67 bps` |
|  `$250.000000` |          `1.17787951` |       `$249.457212` |            `21.71 bps` |

| Approximate sale notional |              Raw NVDAc input | Oracle fair value | Actual USDC received | Total oracle deviation |
| ------------------------: | ---------------------------: | ----------------: | -------------------: | ---------------------: |
|                     `$10` |   `4,721,769` (`0.04721769`) |       `$9.999998` |         `$10.011679` |           `-11.68 bps` |
|                     `$50` |  `23,608,848` (`0.23608848`) |      `$49.999998` |         `$50.058359` |           `-11.67 bps` |
|                    `$100` |  `47,217,697` (`0.47217697`) |      `$99.999999` |        `$100.116610` |           `-11.66 bps` |
|                    `$250` | `118,044,242` (`1.18044242`) |     `$249.999997` |        `$250.290682` |           `-11.62 bps` |

The Aerodrome benchmark fee is **5 bps of input**. Separately, comparing each quote
with the pool's pre-swap spot output after that fee gives measured price impact of
approximately **0.0021, 0.0110, 0.0222, and 0.0558 bps** for the four sizes in
each direction. The remainder of total oracle-relative deviation is primarily
the difference between the live pool price and the pinned Chainlink mark; it is
not AMM slippage and is not relabeled as such.

Tests seed only the test contract's USDC balance with Foundry's local `deal`
fixture. Sale tests impersonate the already documented NVDAc holder and transfer
the exact raw input through the native B20 contract. The router then spends that
raw `balanceOf` delta through `transferFrom`. No pool/token/router bytecode,
liquidity, reserve, issuer policy, or quote result is mocked or overwritten, and
no mainnet transaction is submitted.

### Uniswap benchmark and V1 decision

The PRD names Uniswap, so the test also quotes its direct 0.30% V3 pool
`0x60661b315553eB81872DeEA9a66D567cF0CCd33b` through official Base QuoterV2
`0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`. The official factory is
`0x33128a8fC17869897dcE68Ed026d694621f6FDfD` and SwapRouter02 is
`0x2626664c2603336E57B271c5C0b26F421741e481`; see
[Uniswap's Base deployment list](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments).
The deployed factory returns the comparison pool for fee tier `3000`.

Uniswap's buy deviations for `$10/$50/$100/$250` are
**25.96/27.39/29.17/34.52 bps**. Its equivalent sale deviations are
**34.98/37.31/40.21/48.92 bps**. Aerodrome returns more output for every tested
trade in both directions, charges 5 bps rather than 30 bps at the snapshot, and
has materially stronger pinned liquidity. This is useful evidence that execution
quality was independently evaluated; it does not override the external product
constraint below.

Margin Call is entering Runtime's Uniswap **New Assets, New Agents** track, whose
requirements call for integrating Uniswap's API, AMM, or CCA for tokenized
real-world assets or trading agents. Uniswap therefore remains the intended
V1/hackathon execution venue, consistent with the PRD. The production
`ExecutionAdapter` must use the approved Uniswap path and enforce the stricter of
caller `minOut` and a protocol oracle-derived minimum so materially poor
execution fails closed.

The protocol's maximum adverse oracle-relative execution deviation is
**unresolved**. The previously proposed 30 bps bound is incompatible with this
snapshot: Uniswap reached `34.52 bps` on the `$250` buy and `48.92 bps` on the
equivalent sale. Calibration must precede `ExecutionAdapter` implementation and
must account separately for the 30 bps venue fee, AMM price impact, and normal
oracle/pool basis. Testing should include whether a bound around **100 bps**
provides enough tolerance for normal basis while remaining appropriately
protective; 100 bps is a candidate to test, not a selected constant. Divergence
beyond the eventual evidence-backed bound must halt execution.

The current fork fixture executes the Aerodrome benchmark and quotes the
deployed Uniswap path; production Uniswap integration must retain executable
fork coverage in both directions. Before Runtime submission, the final public
repository README must point reviewers directly to that Uniswap integration
code, and the repository will need `FEEDBACK.md`. Those submission documents are
outside this #420 verification correction and are not created here.

Current `NvdaExecutionRoutesTest` expected result:
**12 passed, 0 failed, 0 skipped**.

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
`NvdaOracleCadenceTest` **5 passed**, and `NvdaExecutionRoutesTest` **12 passed**.
RPC-free policy, cadence-helper, and valuation tests run in the normal suite.
