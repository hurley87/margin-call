# Pinned Base mainnet assumptions

Issue #420 verification. The first commit pins deployed token and oracle reads plus a
native NVDAc transfer. The second commit pins the test-only `LIVE` / `HELD` /
`INVALID` classifier and `MAX_LIVE_AGE`. The third commit pins raw NVDAc valuation
against the total-return feed. There is still no production `OracleAdapter` or
valuation implementation.

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

These first-commit values are historical observations. Freshness and state policy
are pinned below, not in the raw aggregator snapshot test.

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
round before returning `LIVE`. This commit does not implement `OracleAdapter`.

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

Fork profile expected result: `BaseMainnetTest` **6 passed** and
`NvdaOracleCadenceTest` **5 passed**. RPC-free policy and cadence-helper tests run
in the normal suite.
