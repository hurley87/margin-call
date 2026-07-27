# Contracts workspace

Foundry workspace for Margin Call's on-chain Pack economy (issue [#274](https://github.com/hurley87/margin-call/issues/274)). Initialized from [LazerForge](https://github.com/LazerTechnologies/LazerForge) `minimal`, adapted to this repo's profile conventions — see [REPRODUCIBILITY.md](./REPRODUCIBILITY.md).

Target network: **Robinhood Chain testnet** (chain id `46630`).

## Prerequisites

1. [Foundry](https://book.getfoundry.sh/getting-started/installation) — pin `v1.4.3` to match CI:

   ```bash
   foundryup -i v1.4.3
   forge --version   # forge Version: 1.4.3-stable
   ```

2. Node / pnpm as for the rest of the monorepo (`pnpm install` at the repo root).

3. Forge libraries (gitignored under `lib/`):

   ```bash
   pnpm install:forge-deps
   ```

## Install, build, test

```bash
pnpm install:forge-deps
cd contracts
forge build
forge test                          # default profile (fast local)
FOUNDRY_PROFILE=ci forge test       # CI suite (more fuzz/invariant runs)
forge fmt --check
```

From the repo root:

```bash
pnpm test:contracts                 # default
pnpm test:contracts:ci              # CI profile
```

### Profiles

| Profile   | Purpose                    | Notable settings              |
| --------- | -------------------------- | ----------------------------- |
| `default` | Fast local development     | fuzz 256, invariant 64 × 32   |
| `ci`      | Complete suite (CI job)    | fuzz 512, invariant 128 × 32  |
| `ci-fuzz` | Higher-run campaign        | fuzz 1024, invariant 256 × 64 |
| `gas`     | Gas analysis and snapshots | `via_ir`, 1_000_000 runs      |

## MockUSD

Protocol-deployed mock USD stablecoin for the Season:

- Name / symbol: `Margin Call Mock USD (Test Asset)` / `MOCKUSD`
- 6 decimals (mirrors mainnet USDG — mainnet is a fresh config, not a migration)
- `MINTER_ROLE`-gated `mint` (Desk Grants and refills)
- On-chain disclosure via `IS_TEST_ASSET` and `TEST_ASSET_NOTICE`

This is a **valueless test asset**. It has no USD backing and nothing about it carries over to mainnet.

## Deploy (Robinhood Chain testnet)

1. Fund a deployer with testnet ETH from the [Robinhood faucet](https://faucet.testnet.chain.robinhood.com).
2. Set in `.env.local` (see repo `.env.example`):

   ```bash
   ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
   DEPLOYER_PRIVATE_KEY=0x…          # or export from a Foundry keystore:
                                     # cast wallet private-key --account <name>
   # Optional:
   MOCKUSD_ADMIN=0x…                 # defaults to deployer
   MOCKUSD_MINTER=0x…                # granted MINTER_ROLE when admin == deployer
   ```

3. Deploy and record the address:

   ```bash
   pnpm deploy:mockusd
   ```

   Writes `contracts/deployments/robinhood-testnet.mockusd.json` (address, admin, chain id, build fingerprint, tx hash) and patches `MOCKUSD_ADDRESS` / `NEXT_PUBLIC_MOCKUSD_ADDRESS` in `.env.local`.

4. Verify on Blockscout:

   ```bash
   pnpm verify:mockusd
   ```

### Explorer

- Browser: https://explorer.testnet.chain.robinhood.com
- **MockUSD (testnet):** [`0xfC9A4952A2d5c5ba6e2F968bAcBc65FE5EAdCF86`](https://explorer.testnet.chain.robinhood.com/address/0xfC9A4952A2d5c5ba6e2F968bAcBc65FE5EAdCF86)
- Deployment record: [`deployments/robinhood-testnet.mockusd.json`](./deployments/robinhood-testnet.mockusd.json)
- Tx: [`0xa70484d5…`](https://explorer.testnet.chain.robinhood.com/tx/0xa70484d5cb5149dfdccebab48d7ace7ef8c724d32dee279af062734b0a583ea3)

> Note: Blockscout may fail automatic source verification at `optimizer_runs = 99_999_999` (same ceiling Etherscan documents). The bytecode and on-chain name/symbol/metadata are the source of truth; `pnpm verify:mockusd` remains the verify entrypoint when the explorer accepts the settings.

## Layout

```
contracts/
  src/            # Deployable contracts (MockUSD today; PackCustody et al. later)
  test/           # Forge unit / fuzz / invariant suites
  script/         # Deploy scripts + LazerForge Utils
  deployments/    # Recorded, reproducible addresses (committed)
  foundry.toml    # Profiles, remappings, chain-state pin
  foundry.deps.json
```
