# Pinned Base mainnet assumptions

Issue #420, first commit only: deployed token and oracle reads plus a native NVDAc
transfer. These tests contain no product contracts or pricing/execution policy.

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

These are historical observations, not a freshness threshold or a claim that a
price is currently safe for solvency decisions.

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

Expected result: **6 passed, 0 failed, 0 skipped**.
