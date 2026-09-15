# Pinned Base mainnet assumptions

Issue #420 verification. The first commit pins deployed token and oracle reads plus a
native NVDAc transfer. The second commit pins the test-only `LIVE` / `HELD` /
`INVALID` classifier and `MAX_LIVE_AGE`. There is still no production `OracleAdapter`.

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

First-commit `BaseMainnetTest` expected result: **6 passed, 0 failed, 0 skipped**.

## Oracle-state policy

Test-only reference: `contracts/test/oracle/OracleStatePolicy.sol`. RPC-free tests
live in `contracts/test/oracle/OracleStatePolicy.t.sol` and run with
`pnpm test:contracts`. Fork cadence evidence is `contracts/fork/NvdaOracleCadence.t.sol`.

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

### Sequencer grace period

Pinned to **3600 seconds**, matching Chainlink's current Base sequencer consumer
example (`GRACE_PERIOD_TIME = 3600` and `timeSinceUp <= GRACE_PERIOD_TIME` reverts):
https://docs.chain.link/data-feeds/l2-sequencer-feeds

The classifier fails closed while the sequencer answer is not `0`, while
`startedAt == 0`, and for the full 3600 seconds after `startedAt`. At 3601 seconds
a qualifying price round may become `LIVE`.

### Historical sampling

All phase-2 NVDA rounds were read through `getRoundData` on the pinned fork
(block `51356323`, 362 local rounds, 2026-08-05 through 2026-09-15). No heartbeat
constant is published on the aggregator. Consecutive same-session moves clustered
near **0.5%**, so quiet regular hours can go hours between updates.

| Local round |              `roundId` |  `updatedAt` | ET (UTC-4)           | Notes                                            |
| ----------: | ---------------------: | -----------: | -------------------- | ------------------------------------------------ |
|         313 | `36893488147419103545` | `1788545055` | Fri 2026-09-04 14:04 | Last Friday tick before Labor Day                |
|         314 | `36893488147419103546` | `1788825633` | Mon 2026-09-07 20:00 | Holiday weekend resume                           |
|         327 | `36893488147419103559` | `1788961817` | Wed 2026-09-09 09:50 | Start of longest same-day RTH quiet gap          |
|         328 | `36893488147419103560` | `1788980639` | Wed 2026-09-09 15:03 | End of that RTH gap (`18822s`, 5.23h)            |
|         334 | `36893488147419103566` | `1789050187` | Thu 2026-09-10 10:23 | Start of longest expected-session quiet gap      |
|         335 | `36893488147419103567` | `1789074441` | Thu 2026-09-10 17:07 | End of that gap (`24254s`, 6.74h, RTH → post)    |
|         346 | `36893488147419103578` | `1789155215` | Fri 2026-09-11 15:33 | Last Friday tick                                 |
|         347 | `36893488147419103579` | `1789344035` | Sun 2026-09-13 20:00 | 24/5 Sunday reopen (`188820s`, 52.45h)           |
|         360 | `36893488147419103592` | `1789418327` | Mon 2026-09-14 16:38 | Last Monday post-market tick                     |
|         361 | `36893488147419103593` | `1789478753` | Tue 2026-09-15 09:25 | Tuesday pre-market (`60426s`, 16.79h overnight)  |
|         362 | `36893488147419103594` | `1789483945` | Tue 2026-09-15 10:52 | Latest at the pinned block (age `18048s`, 5.01h) |

Additional `latestRoundData()` calls at other historical blocks, with the registry
unpaused in both cases:

|      Block |                              Timestamp | Latest local round |               Age | Classification under this policy |
| ---------: | -------------------------------------: | -----------------: | ----------------: | -------------------------------- |
| `51262927` | `1789315201` (Sun 2026-09-13 12:00 ET) | 346 (Friday close) | `159986s` (44.4h) | `INVALID`                        |
| `51334926` | `1789459199` (Mon 2026-09-14 22:00 ET) |  360 (Monday post) |  `40872s` (11.4h) | `INVALID`                        |

Observed cadence:

- Same-day regular-hours intervals: min 32s, median ~23m, max **5.23h**.
- Expected 04:00–20:00 ET sessions without an overnight in the middle: max **6.74h**.
- Shortest overnight-style gap: **8.04h** (Sun 20:00 → Mon 04:02 ET).
- Typical weekday overnight silence: **12–18h**.
- Ordinary weekends: **52–55h**, resume Sunday 20:00 ET; Labor Day 2026: **77.94h**, resume Monday 20:00 ET.
- Saturday had no phase-2 updates. Sunday updates were the 20:00 ET reopen, not midday.
- Sampled blocks never showed `paused == true`. `HELD` is therefore proven from the
  verified registry ABI plus classifier fixtures, not from a mainnet pause snapshot.

### Selected `MAX_LIVE_AGE`

**28800 seconds (8 hours).**

Rationale: it is above the longest observed quiet stretch while updates are expected
(6.74h regular → post) and above the pinned Tuesday afternoon age (5.01h), and it is
below the shortest overnight-style gap (8.04h), weekday overnight silence (12h+), and
weekend/holiday holds (52h+). A shorter 6h bound would reject the 6.74h expected-session
observation. A 12h bound would treat overnight last-close as `LIVE`.

Chainlink documents these feeds as 24/5 with no off-hours heartbeat. V1 therefore
treats unpaused weekend, holiday, and overnight last-close as `INVALID`, not `HELD`.
That matches issue #420 and does not manufacture a corporate-action hold from staleness.

### How to run

```sh
pnpm test:contracts
BASE_MAINNET_RPC_URL='https://mainnet.base.org' pnpm test:contracts:fork
```

Use an archive-capable URL through the same environment variable for historical
`getRoundData` / extra-block checks. Never commit a credential-bearing URL.

Fork profile expected result: `BaseMainnetTest` **6 passed** and
`NvdaOracleCadenceTest` **4 passed**. RPC-free policy tests run in the normal suite.
