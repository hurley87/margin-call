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

## PackCustody

ERC-721 Packs backed by a recorded basket of whitelisted Stock Tokens held directly by the contract (issue [#275](https://github.com/hurley87/margin-call/issues/275)):

- Name / symbol: `Margin Call Pack (Test Asset)` / `PACK`
- `mint` deposits the whole basket in one transaction; a Pack can never exist unfunded
- Custody accounting is raw token units, recorded from the balance actually received
- `topUp` is creator-only and additions-only, while the Pack is still listed
- `delistAndRedeem` (creator, while listed) and `unwrap` (holder, once transferred) both release the full basket at **zero protocol fee**
- `WHITELIST_ADMIN_ROLE` governs deposits only — de-whitelisting an asset never blocks redemption

Oracle NAV, eligibility, and Rip selection live in later contracts; custody knows nothing about them.

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

### PackCustody

Same flow, with the whitelist defaulting to the five approved Stock Tokens from the PRD launch configuration:

```bash
# Optional overrides in .env.local:
#   PACKCUSTODY_ADMIN=0x…            # defaults to deployer
#   PACKCUSTODY_WHITELIST_ADMIN=0x…  # granted WHITELIST_ADMIN_ROLE when admin == deployer
#   PACKCUSTODY_WHITELIST=0x…,0x…    # comma-separated; overrides the launch five

pnpm deploy:packcustody
pnpm verify:packcustody
```

Writes `contracts/deployments/robinhood-testnet.packcustody.json` (address, admin, whitelist, build fingerprint, tx hash) and patches `PACKCUSTODY_ADDRESS` / `NEXT_PUBLIC_PACKCUSTODY_ADDRESS` in `.env.local`.

### Explorer

- Browser: https://explorer.testnet.chain.robinhood.com
- **MockUSD (testnet, verified):** [`0xAA555fD042F33B5AF485171015AeAF11eD49EF3D`](https://explorer.testnet.chain.robinhood.com/address/0xAA555fD042F33B5AF485171015AeAF11eD49EF3D#code)
- Deployment record: [`deployments/robinhood-testnet.mockusd.json`](./deployments/robinhood-testnet.mockusd.json)
- Tx: [`0x9a2c19d5…`](https://explorer.testnet.chain.robinhood.com/tx/0x9a2c19d5e97a12eb86f7ec5dd3e74bcf30bd099d11a763d57f390fde2af7f4c2)
- Verify after deploy: `pnpm verify:mockusd` (Blockscout; workspace uses `optimizer_runs = 1_000_000`).

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
