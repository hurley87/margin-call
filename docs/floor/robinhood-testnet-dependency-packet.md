# Robinhood Chain testnet dependency packet — The Floor (#248)

> **Network:** Robinhood Chain testnet only — chain ID `46630`.  
> **Status:** Dependency preflight for issue [#248](https://github.com/hurley87/margin-call/issues/248).  
> **Forbidden:** Robinhood Chain mainnet `4663`, bridges, and real-value funds.

Machine-readable source of truth: [`contracts/deployments/robinhood-testnet.dependencies.json`](../../contracts/deployments/robinhood-testnet.dependencies.json)  
Typed loader: [`scripts/floor/dependencies.ts`](../../scripts/floor/dependencies.ts)  
Offline checks: `pnpm floor:preflight`  
Live probe: `pnpm floor:preflight:live`  
Sponsorship / signing proof: `pnpm floor:sponsorship-proof`

Parent: [#247](https://github.com/hurley87/margin-call/issues/247) · Next slice: [#249](https://github.com/hurley87/margin-call/issues/249)

## Attestation

- [x] **No mainnet deployment, bridge, or real-value funds** are authorized by this packet.
- [x] Test assets and test ETH are treated as **valueless**.
- [x] Canonical Robinhood assets are never labelled as Margin Call Test Assets, and Test Asset fallbacks are always visibly labelled.

## Chain facts

| Field                      | Value                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Name                       | Robinhood Chain Testnet                                                            |
| Slug                       | `robinhood-testnet`                                                                |
| Chain ID                   | `46630`                                                                            |
| CAIP-2                     | `eip155:46630`                                                                     |
| Native gas asset           | ETH (18 decimals) — labelled test ETH (no real value)                              |
| Public RPC                 | `https://rpc.testnet.chain.robinhood.com`                                          |
| Alchemy RPC template       | `https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}`                             |
| Env key                    | `ROBINHOOD_TESTNET_RPC_URL` (required for live scripts; no silent public fallback) |
| Sequencer HTTP             | `https://sequencer.testnet.chain.robinhood.com`                                    |
| Sequencer feed WS          | `wss://feed.testnet.chain.robinhood.com`                                           |
| Explorer                   | `https://explorer.testnet.chain.robinhood.com`                                     |
| Verify API                 | `https://explorer.testnet.chain.robinhood.com/api/` (`blockscout`)                 |
| Faucet                     | `https://faucet.testnet.chain.robinhood.com`                                       |
| Confirmation assumption    | Arbitrum Nitro L2; recommend waiting for 1 receipt confirmation on testnet smoke   |
| Forbidden mainnet chain ID | `4663`                                                                             |

Docs:

- Connecting: https://docs.robinhood.com/chain/connecting/
- Oracles: https://docs.robinhood.com/chain/oracles-and-price-feeds/
- Token contracts: https://docs.robinhood.com/chain/contracts/

## Address and interface matrix

Statuses:

- `canonical` — confirmed on Robinhood Chain testnet with bytecode (and expected interface probes where applicable)
- `test-asset-fallback` — no confirmed canonical testnet deployment; Floor uses a visibly labelled Margin Call Test Asset
- `unverified` — capability or infra path not yet proved

| ID                               | Kind                   | Status              | Address                                      | Label                                                           | Expected interfaces                                    |
| -------------------------------- | ---------------------- | ------------------- | -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `erc6551-registry`               | registry               | **canonical**       | `0x000000006551c19487814612e58FE06813775758` | ERC-6551 Token Bound Account Registry                           | `IERC6551Registry`                                     |
| `erc6551-account-implementation` | account-implementation | test-asset-fallback | _null — deploy under Floor_                  | Margin Call Test Asset — TBA account implementation (to deploy) | `IERC6551Account`, `IERC6551Executable`                |
| `usdg`                           | payment-token          | test-asset-fallback | _null_                                       | Margin Call Test Asset — test USDG                              | `IERC20`, `IERC20Metadata`                             |
| `stock-token-aapl`               | stock-token            | test-asset-fallback | _null_                                       | Margin Call Test Asset — AAPL                                   | `IERC20`, `IERC20Metadata`, `IERC8056`, `oraclePaused` |
| `stock-token-nvda`               | stock-token            | test-asset-fallback | _null_                                       | Margin Call Test Asset — NVDA                                   | `IERC20`, `IERC20Metadata`, `IERC8056`, `oraclePaused` |
| `price-feed-aapl`                | price-feed             | test-asset-fallback | _null_                                       | Margin Call Test Asset — AAPL price feed                        | `AggregatorV3Interface`                                |
| `price-feed-nvda`                | price-feed             | test-asset-fallback | _null_                                       | Margin Call Test Asset — NVDA price feed                        | `AggregatorV3Interface`                                |
| `sequencer-uptime-feed`          | sequencer-uptime-feed  | test-asset-fallback | _null_                                       | Margin Call Test Asset — sequencer uptime feed                  | `AggregatorV3Interface`                                |
| `erc8056-multiplier`             | interface-capability   | unverified          | _null_                                       | ERC-8056 uiMultiplier support on Stock Tokens                   | `IERC8056`                                             |
| `gas-sponsorship`                | infra                  | unverified          | _null_                                       | Privy gas sponsorship path                                      | —                                                      |

### Registry bytecode evidence

Live `eth_getCode` against `ROBINHOOD_TESTNET_RPC_URL` / public testnet RPC on **2026-07-25** returned **non-empty** bytecode at the canonical ERC-6551 registry `0x000000006551c19487814612e58FE06813775758`. The offline matrix marks this entry `canonical`. Re-run:

```bash
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com pnpm floor:preflight:live
```

### Account implementation decision

Do **not** assume Base Sepolia Tokenbound AccountV3 at `0x55266d75D1a14E4572138116aF39863Ed6596E7F` exists on Robinhood Chain testnet. Live `eth_getCode` returned empty. Floor must **deploy and verify** a compatible audited ERC-6551 account implementation and record its address in a later deployment packet (#250). Until then the matrix status remains `test-asset-fallback` with a visible Margin Call Test Asset label.

### Test Asset fallback list

These substitutes are required because canonical Robinhood testnet bytecode was not found for the corresponding mainnet-documented assets:

| Fallback label                                      | Replaces                                                  | Notes                                                                  |
| --------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Margin Call Test Asset — test USDG                  | Mainnet USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | Mainnet address has empty code on testnet                              |
| Margin Call Test Asset — AAPL / NVDA                | Canonical Stock Tokens                                    | Mainnet registry is live-generated; no confirmed testnet addresses yet |
| Margin Call Test Asset — AAPL / NVDA price feeds    | Chainlink equity feeds                                    | No confirmed testnet feed proxies yet                                  |
| Margin Call Test Asset — sequencer uptime feed      | Chainlink L2 sequencer feed                               | Arbitrum-style address empty on this testnet                           |
| Margin Call Test Asset — TBA account implementation | Cross-chain Tokenbound impl                               | Must be deployed locally to Robinhood testnet                          |

Mocks and fallbacks **must never** be presented as real Robinhood Stock Tokens or real USDG.

## Sponsorship / signing proof

Script: [`scripts/floor/sponsorship-proof.ts`](../../scripts/floor/sponsorship-proof.ts)

```bash
ROBINHOOD_TESTNET_RPC_URL=... \
FLOOR_PROOF_PRIVATE_KEY=0x... \
  pnpm floor:sponsorship-proof --allow-self-funded
```

Evidence (gitignored): `.floor-evidence/sponsorship-proof.json`

| Field     | Expectation                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Sender    | Independently controlled test wallet (`FLOOR_PROOF_PRIVATE_KEY`) — must not equal `OPERATOR_PRIVATE_KEY` |
| Call      | Harmless 0-value self-transfer                                                                           |
| Sponsored | `false` until Privy gas sponsorship on Robinhood Chain testnet is proved                                 |
| Chain ID  | `46630` only                                                                                             |
| Artifact  | tx hash, block number, sender, gas payer                                                                 |

Floor gas sponsorship uses **Privy** (`sendTransaction` with `{ sponsor: true }`), matching the existing Base Sepolia desk path — not Alchemy Gasless Transaction Infrastructure (even though Robinhood/Alchemy document that option). Privy must have Robinhood Chain testnet sponsorship enabled in the dashboard before product wiring (#249+) can prove a sponsored receipt. Until then `FLOOR_SPONSORSHIP_MODE=privy` fails closed, and this packet records sponsorship as `unverified`.

## Executable checks

| Command                        | When               | What it proves                                               |
| ------------------------------ | ------------------ | ------------------------------------------------------------ |
| `pnpm floor:preflight`         | Every PR / local   | Matrix parses; labelling, interface shape, registry presence |
| `pnpm floor:preflight:live`    | Opt-in / scheduled | Live chain ID, bytecode, interfaces, feed staleness          |
| `pnpm floor:sponsorship-proof` | Operator evidence  | Independent wallet can sign + submit on testnet              |

Failure modes that must exit non-zero:

- Missing bytecode for a `canonical` address
- Unsupported required interface on a probed address
- Stale `AggregatorV3Interface` feed when an address is set
- Canonical / mock labelling mismatch
- Missing `ROBINHOOD_TESTNET_RPC_URL` on live scripts
- Robinhood mainnet chain ID or mainnet RPC host

## Handoff to #249

#249 may expand chain / intent boundaries using this packet as the pinned dependency source. It must:

1. Keep Base Sepolia green until cutover.
2. Resolve active chain, explorer, assets, contracts, confirmation policy, and Test Asset labels without scattering hard-coded network values.
3. Refuse Robinhood mainnet `4663` the same way Base mainnet `8453` is refused today.
4. Treat every `test-asset-fallback` label as user-visible copy, not an internal comment.
