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

ERC-721 Packs backed by a recorded basket of whitelisted Stock Tokens held directly by the contract (issues [#275](https://github.com/hurley87/margin-call/issues/275), [#299](https://github.com/hurley87/margin-call/issues/299)):

- Name / symbol: `Margin Call Pack (Test Asset)` / `PACK`
- `mint` deposits the whole basket in one transaction; a Pack can never exist unfunded
- Custody accounting is raw token units, recorded from the balance actually received
- `topUp` is creator-only and additions-only, while the Pack is still listed
- `delistAndRedeem` (creator, while listed) and `unwrap` (holder, once transferred) both release the full basket at **zero protocol fee**
- `releaseToRecipient` is `RIP_ENGINE_ROLE`-gated: moves a listed Pack to a recipient in one call without ERC-721 approval; basket ERC-20s stay in custody and the one-way unlisted latch fires on transfer (Rip settlement primitive — a Pack settles at most once)
- `WHITELIST_ADMIN_ROLE` governs deposits only — de-whitelisting an asset never blocks redemption
- Neither `WHITELIST_ADMIN_ROLE` nor `RIP_ENGINE_ROLE` is granted at construction; `DEFAULT_ADMIN_ROLE` grants them after deploy (RipEngine receives `RIP_ENGINE_ROLE` via `pnpm deploy:rip-engine`)

Oracle NAV, eligibility, and Rip selection live in AssetRegistry and RipEngine; custody knows nothing about them.

## AssetRegistry + MockPriceFeed

Owner-curated Stock Token whitelist, pool levers, and fail-closed Pack NAV (issue [#300](https://github.com/hurley87/margin-call/issues/300)):

- Per asset: token address, `IPriceFeed`, `staleAfter`, status (`Active` / `Frozen` / `Delisting`), live inventory
- `addAsset` / `setStatus` / `removeAsset` (zero inventory only); inventory adjusted via `INVENTORY_ROLE`
- Owner setters for `minPackNav`, `poolMax`, `alpha`, `surcharge`, `protocolShareOfSurcharge`, `maxBatchSize`, and crown params — evented and prospective
- `navOf` / `quote` return WAD USD (`$1 = 1e18`); every consumed feed read requires fresh, valid, non-paused data or reverts
- Frozen assets are excluded from deposits and the price basket; Delisting blocks deposits but keeps resting Packs in the basket so inventory can drain
- `MockPriceFeed` (`src/mocks/`) is the testnet / Foundry substitution point until real Robinhood feeds are wired (#310)

Canonical Stock Token map: [`deployments/robinhood-testnet.stock-tokens.json`](./deployments/robinhood-testnet.stock-tokens.json).

## RipEngine

NAV-weighted Pack selection, live Rip pricing, Model-A settlement, and Acquisition Fees (issue [#301](https://github.com/hurley87/margin-call/issues/301)):

- Explicit pool membership via `enterPool` / `exitPool` (PackCustody has no enumeration)
- `eligibleSnapshot` fail-closed: not listed, frozen/stale/invalid NAV, or out of band → excluded
- `quoteRip(count)` / `rip(count, maxTotalPayment)` price off one snapshot: `clamp(HM × (1+surcharge), [min, max]×(1+surcharge))` with `HM = n / Σ(1/N)`
- Distinct draws without replacement, weights `∝ 1/NAV^alpha` (whole-number alpha only); entropy via injectable `IRandomnessSource` (`MockRandomness` in V1)
- Protocol and crown cuts from the surcharge only; remainder socialized equally per resting Pack via a fee-per-Pack index (make-whole at `alpha = 1`)
- Requires `eligibleCount > count` so socialization has a non-empty destination set
- Maker `claim(tokenIds)` (empty = crystallized only); admin `withdrawProtocolFees`
- Unlisted Packs are purged at the start of every `rip` so ghosts cannot dilute fee socialization
- Equal-rate fee accrual follows enrollment for listed Packs (not per-rip eligibility); a Pack with a temporarily stale feed keeps accruing while undrawable

### The Crown

`crown_cut = crownShareOfSurcharge × surcharge` for the Crowned Maker on every Rip, off by default (issue #302):

- **Funded from the surcharge only.** The registry caps `protocolShareOfSurcharge + crownShareOfSurcharge` at `1`, so `toMakers ≥ base` for every setting — the harmonic-mean base is never cut and make-whole holds. Defaults move the split 25/0/75 → 25/10/65 when enabled.
- **Paid as a fee credit.** The cut lands in the Crowned Maker's `claimableFees` before the draws settle, so the Maker who held the Crown at Rip time is paid even when that Rip draws out their last Pack. `crownEnabled = false` (the default) or a vacant Crown carves nothing and the whole remainder socializes.
- **Crowned Maker = largest total resting NAV**, summed across their Packs (`restingNavOf`), from per-Pack `navCheckpoint` values rather than a live read — grouping live NAV by Maker inside `rip` would need an unbounded pass over the resting set.
- **Checkpoints are recomputed** on enrollment, `syncPackNav`, exit, ghost purge, and draw-out. `syncPackNav(tokenId)` is permissionless so a Maker can register a top-up and a challenger can true a stale leader down; it fails closed on an unreadable feed, so an oracle gap can never be used to zero a Maker's total. Enrollment under a bad feed checkpoints zero and joins the Crown race once synced.
- **The Crown only moves on a beat.** `crownThreshold()` is the reigning total plus `crownBeatMargin` (never a tie), so it cannot flicker; the reigning Maker keeps it while shrinking and vacates at zero resting NAV. `challengeCrown(maker)` presses a standing claim after the leader shrinks without touching the pool.
- Crown totals count every resting Pack, in or out of band — the same rule the Acquisition Fee follows. `poolMax` therefore bounds eligibility but **not** a Crown total, so `crownThreshold()` must never revert: it sits on `_leavePool`'s path, where an arithmetic failure would block exits, purges, and draws for every other Maker. It uses `Math.mulDiv` and a saturating add, and an unreachable threshold simply means the Crown cannot be taken.
- **Tracking runs even while `crownEnabled` is false**, which costs an enrolling Maker roughly 105k gas (one NAV read plus the checkpoint and total writes). That is the deliberate trade for the lever being useful the moment it flips: gating the bookkeeping on the toggle would leave `restingNavOf` cold at enable time, so the Crown would go to whoever moved first rather than the largest total, and a Pack enrolled while enabled but exited while disabled would strand its contribution in the running total.

## GameToken

Fixed-supply reward token for Maker Emissions and Participation Rewards (issue #303):

- Name / symbol: `Margin Call Game Token (Test Asset)` / `MCGT`, 18 decimals (ticker and branding are a post-V1 decision)
- The whole supply is minted to the treasury in the constructor; **there is no mint function**, so emission is a funded Distributor rather than an inflation lever
- User↔user transfers fail closed with `TransfersLocked(from, to)`. Exactly two moves are legal while the lock holds: a `DISTRIBUTOR_ROLE` holder paying anyone (Distributor→claimant, so claims settle) and the treasury paying a role holder (funding)
- Sending tokens _into_ the Distributor from anywhere but the treasury is refused. Those tokens would be unrecoverable — `sweep` cannot touch the game token — so the transfer fails rather than burning a claimant's balance
- The lock lifts only via `scheduleTransferEnable` (starts a `TRANSFER_ENABLE_DELAY` = 7-day notice period) followed by `enableTransfers` inside a `TRANSFER_ENABLE_WINDOW` = 7-day execution window. Both are evented and admin-only, and nothing re-locks the token afterwards
- A schedule that is never exercised **expires** at the end of its window and must be re-armed, which restarts the notice period. Without that, an admin could arm the switch, wait a year, and unlock in the next block with no recent warning
- `TRANSFER_ENABLE_DELAY` and `TRANSFER_ENABLE_WINDOW` are constants, not setters — the owner cannot shorten the notice period
- The switch ships unexercised; opening it is a separate post-V1 decision

## Distributor

Pays Maker Emissions and Participation Rewards against per-epoch merkle Claim Roots (issue #303):

- Funded by transferring GameToken in — no mint path anywhere, so the held balance is the hard cap by construction
- Owner setters for `makerRatePerEpoch`, `takerPotPerEpoch`, and `rebatePerRipCap` (default `0.10` WAD), all evented; they are the published inputs to the off-chain entitlement algorithm, not an on-chain accrual
- `postClaimRoot(epoch, root, total)` only accepts a finished epoch (`epoch < currentEpoch()`), stays replaceable while nobody has claimed it, then freezes for good
- `increaseClaimTotal(epoch, newTotal)` raises an epoch's ceiling without touching its root. It is the recovery path for a `total` posted below what the root commits to, which the first claim would otherwise freeze in place, stranding every later claimant. Raise-only and root-preserving, so it can neither invalidate a booked claim nor invent an entitlement
- `claim(account, input)` / `claimBatch(account, inputs)` verify a proof and pay `makerAmount + takerAmount`; anyone may submit, funds always go to `account`
- Three independent bounds keep a bad root harmless: one claim per `(epoch, account)`, an epoch pays at most its declared `claimTotalOf`, and every payout is capped by the live balance
- Paying out depends on GameToken's `DISTRIBUTOR_ROLE` grant. Without it every claim fails closed with `TransfersLocked` and nothing is booked, so entitlements survive until the grant is restored
- `sweep` recovers stray tokens but is barred from the GameToken, so unspent rewards stay claimable and roll forward

> **Epochs are anchored to deploy time, not UTC midnight.** Epoch 0 starts at `epochZeroStart` and each
> epoch is `EPOCH_DURATION` = 1 day long. An off-chain builder that buckets Rips by calendar date will
> mis-attribute every epoch — read `epochStart(epoch)` / `currentEpoch()` from the contract instead.

Canonical claim leaf — the only thing the contract fixes about tree construction:

```solidity
keccak256(bytes.concat(keccak256(abi.encode(epoch, account, makerAmount, takerAmount))))
```

`Distributor.leafOf` returns exactly that. Any tree built over those leaves with commutative sorted-pair
keccak256 verifies, including OpenZeppelin's JavaScript `StandardMerkleTree` with the leaf encoding
`["uint256", "address", "uint256", "uint256"]`. `test/helpers/MerkleTreeLib.sol` mirrors that layout so
tests recompute roots the way an off-chain builder would.

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

### AssetRegistry

```bash
# Optional overrides in .env.local:
#   ASSETREGISTRY_ADMIN=0x…          # defaults to deployer
#   ASSETREGISTRY_INVENTORY=0x…      # granted INVENTORY_ROLE when admin == deployer
#   ASSETREGISTRY_STALE_AFTER=3600   # seconds; default 3600
#   ASSETREGISTRY_SEED_FEEDS=true    # deploy MockPriceFeeds + addAsset for the launch five

pnpm deploy:asset-registry
```

Writes `contracts/deployments/robinhood-testnet.asset-registry.json` and patches `ASSETREGISTRY_ADDRESS` / `NEXT_PUBLIC_ASSETREGISTRY_ADDRESS`. Testnet deploy + Blockscout verify of the full V1 set is tracked in [#310](https://github.com/hurley87/margin-call/issues/310).

### RipEngine

Requires PackCustody, AssetRegistry, and MockUSD addresses already in `.env.local`:

```bash
# Optional overrides:
#   RIPENGINE_ADMIN=0x…              # defaults to deployer
#   RIPENGINE_SEED=0xC0FFEE          # MockRandomness base seed
#   RIPENGINE_GRANT_ROLE=true        # grant RIP_ENGINE_ROLE on PackCustody

pnpm deploy:rip-engine
```

Writes `contracts/deployments/robinhood-testnet.rip-engine.json` and patches `RIPENGINE_ADDRESS` / `NEXT_PUBLIC_RIPENGINE_ADDRESS`.

### GameToken

The supply chosen here is final — there is no mint authority after deploy:

```bash
# Optional overrides:
#   GAMETOKEN_ADMIN=0x…              # defaults to deployer
#   GAMETOKEN_TREASURY=0x…           # defaults to deployer; receives the whole supply
#   GAMETOKEN_SUPPLY=1000000000000000000000000000   # 18-decimal units; default 1e9 tokens

pnpm deploy:game-token
```

Writes `contracts/deployments/robinhood-testnet.game-token.json` and patches `GAMETOKEN_ADDRESS` / `NEXT_PUBLIC_GAMETOKEN_ADDRESS`.

### Distributor

Requires `GAMETOKEN_ADDRESS` in `.env.local`. The script grants `DISTRIBUTOR_ROLE` **before** funding —
the funding transfer would otherwise fail closed against the transfer lock. Funding also requires the
deployer to be the GameToken treasury, since that is the only sender the lock lets fund a role holder:

```bash
# Optional overrides:
#   DISTRIBUTOR_ADMIN=0x…            # defaults to deployer
#   DISTRIBUTOR_GRANT_ROLE=true      # grant GameToken DISTRIBUTOR_ROLE
#   DISTRIBUTOR_FUND=300000000000000000000000000    # 18-decimal units moved from the deployer
#   DISTRIBUTOR_MAKER_RATE=…         # makerRatePerEpoch
#   DISTRIBUTOR_TAKER_POT=…          # takerPotPerEpoch

pnpm deploy:distributor
```

Writes `contracts/deployments/robinhood-testnet.distributor.json` and patches `DISTRIBUTOR_ADDRESS` / `NEXT_PUBLIC_DISTRIBUTOR_ADDRESS`.

### Explorer

- Browser: https://explorer.testnet.chain.robinhood.com
- **MockUSD (testnet, verified):** [`0xAA555fD042F33B5AF485171015AeAF11eD49EF3D`](https://explorer.testnet.chain.robinhood.com/address/0xAA555fD042F33B5AF485171015AeAF11eD49EF3D#code)
- Deployment record: [`deployments/robinhood-testnet.mockusd.json`](./deployments/robinhood-testnet.mockusd.json)
- Tx: [`0x9a2c19d5…`](https://explorer.testnet.chain.robinhood.com/tx/0x9a2c19d5e97a12eb86f7ec5dd3e74bcf30bd099d11a763d57f390fde2af7f4c2)
- **PackCustody (testnet, verified):** [`0x413e82F990DE796CC279c180F711d720A7Ee7728`](https://explorer.testnet.chain.robinhood.com/address/0x413e82F990DE796CC279c180F711d720A7Ee7728#code)
- Deployment record: [`deployments/robinhood-testnet.packcustody.json`](./deployments/robinhood-testnet.packcustody.json)
- Tx: [`0x6532824d…`](https://explorer.testnet.chain.robinhood.com/tx/0x6532824d0202d16b693a55fab1ff2bffa2a87f718037ca3930a3b0d89f11b9e6)
- Verify after deploy: `pnpm verify:mockusd` / `pnpm verify:packcustody` (Blockscout; workspace uses `optimizer_runs = 1_000_000`).

### Stock Tokens (Robinhood testnet)

Canonical symbol → address map: [`deployments/robinhood-testnet.stock-tokens.json`](./deployments/robinhood-testnet.stock-tokens.json) (human/app mirror of [`script/LaunchTokens.sol`](./script/LaunchTokens.sol)). Both PackCustody and AssetRegistry deploy scripts import that library.

| Symbol | Address                                                                                                              | Decimals |
| ------ | -------------------------------------------------------------------------------------------------------------------- | -------- |
| AMZN   | [`0x5884aD2f…E02`](https://explorer.testnet.chain.robinhood.com/address/0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02)  | 18       |
| AMD    | [`0x71178BAc…78d`](https://explorer.testnet.chain.robinhood.com/address/0x71178BAc73cBeb415514eB542a8995b82669778d)  | 18       |
| NFLX   | [`0x3b8262A6…C93`](https://explorer.testnet.chain.robinhood.com/address/0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93)  | 18       |
| PLTR   | [`0x1FBE1a0e…98d0`](https://explorer.testnet.chain.robinhood.com/address/0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0) | 18       |
| TSLA   | [`0xC9f9c869…Bd4E`](https://explorer.testnet.chain.robinhood.com/address/0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E) | 18       |

> **Gas note.** Robinhood Chain bills L1 calldata as extra gas, and for a contract deployment
> that component dominates and drifts with the L1 base fee. Forge's default 130% headroom is
> not enough — the first PackCustody attempt burned its whole limit and reverted out of gas.
> `runForgeDeploy` now passes `--gas-estimate-multiplier 400`; only gas actually used is billed.

## Demo the Pack lifecycle with `cast`

Everything below runs against the deployed contracts with tokens from the
[Robinhood faucet](https://faucet.testnet.chain.robinhood.com) — no app required.

```bash
export RPC=https://rpc.testnet.chain.robinhood.com
export PACKS=0x413e82F990DE796CC279c180F711d720A7Ee7728
# From deployments/robinhood-testnet.stock-tokens.json:
export AMZN=0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02
export AMD=0x71178BAc73cBeb415514eB542a8995b82669778d
export NFLX=0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93
export PLTR=0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0
export TSLA=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
export KEY=0x…            # a faucet-funded creator
export ME=$(cast wallet address --private-key $KEY)
```

Read the pool's entry rules:

```bash
cast call $PACKS "whitelistedAssets()(address[])" --rpc-url $RPC
cast call $PACKS "isWhitelisted(address)(bool)" $AMZN --rpc-url $RPC   # true
```

Approve, then mint a fully funded Pack. Amounts are raw token units:

```bash
cast send $AMZN "approve(address,uint256)" $PACKS 1000000000000000000 --private-key $KEY --rpc-url $RPC
cast send $PLTR "approve(address,uint256)" $PACKS 5000000 --private-key $KEY --rpc-url $RPC

cast send $PACKS "mint(address[],uint256[])" "[$AMZN,$PLTR]" "[1000000000000000000,5000000]" \
  --private-key $KEY --rpc-url $RPC

export ID=$(cast call $PACKS "totalMinted()(uint256)" --rpc-url $RPC)
cast call $PACKS "basketOf(uint256)((address,uint256)[])" $ID --rpc-url $RPC
cast call $PACKS "isListed(uint256)(bool)" $ID --rpc-url $RPC        # true
```

Top it up (creator only, additions only):

```bash
cast send $AMZN "approve(address,uint256)" $PACKS 500000000000000000 --private-key $KEY --rpc-url $RPC
cast send $PACKS "topUp(uint256,address[],uint256[])" $ID "[$AMZN]" "[500000000000000000]" \
  --private-key $KEY --rpc-url $RPC
cast call $PACKS "basketAmountOf(uint256,address)(uint256)" $ID $AMZN --rpc-url $RPC   # 1.5e18
```

Then take either exit. While the Pack is still yours, delist and redeem:

```bash
cast send $PACKS "delistAndRedeem(uint256)" $ID --private-key $KEY --rpc-url $RPC
```

Or transfer it for a secondary sale / manual handoff, then let the new holder unwrap:

```bash
cast send $PACKS "transferFrom(address,address,uint256)" $ME $BUYER $ID --private-key $KEY --rpc-url $RPC
cast call $PACKS "isListed(uint256)(bool)" $ID --rpc-url $RPC        # false
cast send $PACKS "unwrap(uint256)" $ID --private-key $BUYER_KEY --rpc-url $RPC
```

Rip settlement will use the role-gated primitive instead of a plain transfer (requires an
account with `RIP_ENGINE_ROLE`):

```bash
# After admin has granted RIP_ENGINE_ROLE to $ENGINE:
cast send $PACKS "releaseToRecipient(uint256,address)" $ID $BUYER --private-key $ENGINE_KEY --rpc-url $RPC
cast call $PACKS "isListed(uint256)(bool)" $ID --rpc-url $RPC        # false
cast send $PACKS "unwrap(uint256)" $ID --private-key $BUYER_KEY --rpc-url $RPC
```

Both exit paths return the entire recorded basket and burn the Pack. Compare the token balances
before and after: nothing is deducted on either path.

## Demo the reward claim lifecycle with `cast`

```bash
export RPC=…                  # Robinhood testnet or a local anvil
export TOKEN=…                # GameToken
export DIST=…                 # Distributor
export KEY=…                  # the Distributor admin
export ALICE=…                # a claimant
```

The transfer lock is on, so a plain user↔user transfer fails closed:

```bash
cast send $TOKEN "transfer(address,uint256)" $ALICE 1000000000000000000 --private-key $KEY --rpc-url $RPC
# reverts TransfersLocked(<treasury>, <alice>)
```

A single-claimant epoch needs no proof — the root _is_ the leaf, so this is the shortest end-to-end
check that a Claim Root pays out. Ask the contract for the canonical leaf:

```bash
export LEAF=$(cast call $DIST "leafOf(uint256,address,uint256,uint256)(bytes32)" \
  0 $ALICE 10000000000000000000 5000000000000000000 --rpc-url $RPC)
```

Roots are only accepted for finished epochs, so epoch 0 has to be over first:

```bash
cast call $DIST "currentEpoch()(uint256)" --rpc-url $RPC
cast send $DIST "postClaimRoot(uint256,bytes32,uint256)" 0 $LEAF 15000000000000000000 \
  --private-key $KEY --rpc-url $RPC
```

Then claim with an empty proof. Anyone may submit; the tokens go to `$ALICE`:

```bash
cast send $DIST "claim(address,(uint256,uint256,uint256,bytes32[]))" \
  $ALICE "(0,10000000000000000000,5000000000000000000,[])" --private-key $KEY --rpc-url $RPC

cast call $TOKEN "balanceOf(address)(uint256)" $ALICE --rpc-url $RPC      # 15e18
cast call $DIST "hasClaimed(uint256,address)(bool)" 0 $ALICE --rpc-url $RPC  # true
```

Re-running the same claim reverts `AlreadyClaimed(0, alice)`, re-posting the epoch's root reverts
`ClaimRootFrozen(0, 1)`, and `$ALICE` still cannot forward the tokens — claiming does not unlock them.

If the epoch's declared total turns out to be below what the root commits to, raise the ceiling rather
than re-posting (which the first claim has already frozen):

```bash
cast send $DIST "increaseClaimTotal(uint256,uint256)" 0 25000000000000000000 --private-key $KEY --rpc-url $RPC
```

## Layout

```
contracts/
  src/            # Deployable contracts (MockUSD, PackCustody, AssetRegistry, RipEngine,
                  #   GameToken, Distributor) + interfaces/, libraries/, mocks/
  test/           # Forge unit / fuzz / invariant suites
  script/         # Deploy scripts + LazerForge Utils
  deployments/    # Recorded, reproducible addresses (committed)
  foundry.toml    # Profiles, remappings, chain-state pin
  foundry.deps.json
```
