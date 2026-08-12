# Base Sepolia deploy, smoke, and release record

HITL runbook for [issue #351](https://github.com/hurley87/margin-call/issues/351) — Slice 13. This covers a **fresh** contract stack redeploy, environment propagation, Privy sponsorship verification, the guided zero-ETH smoke test, and completing the curated release record.

Companion: [`keeper.md`](./keeper.md). Spec: PRD §11–§12, technical design §13, ADR 0008.

## Rules

1. **Base Sepolia only** (`84532`). Deploy scripts reject other chains.
2. **Never commit secrets** — deployer/operator/keeper private keys, Privy app secret, RPC auth tokens, phone numbers, access tokens, or session material.
3. **Identifiers only** in [`contracts/deployments/base_sepolia.json`](../../contracts/deployments/base_sepolia.json): addresses, tx hashes, Privy app/policy IDs, selector lists.
4. **Human checkpoints** before broadcasting, before mutating Vercel/Convex production, and before Privy dashboard policy changes.
5. **No silent mainnet/production fallbacks.** Empty or mismatched `NEXT_PUBLIC_*` addresses must degrade to “not configured,” never to another network.

## Prerequisites

| Need                                       | Notes                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| Foundry `v1.4.3`                           | `foundryup -i v1.4.3`                                           |
| `pnpm install` + `pnpm install:forge-deps` | Restores gitignored `contracts/lib/`                            |
| Deployer EOA                               | Recorded seed depositor/owner; funded with Base Sepolia ETH     |
| `BASE_SEPOLIA_RPC_URL`                     | Deploy + smoke + keeper                                         |
| Fresh phone number                         | SMS login for the player smoke path                             |
| Privy dashboard access                     | App Pays + client transactions + policy scoped to new addresses |
| Vercel + Convex production access          | Explicit consent per mutation                                   |

## Preflight (agent or operator)

```bash
pnpm check:ci
pnpm test
pnpm test:contracts:ci
pnpm build
pnpm validate:base-sepolia-release
```

Confirm a clean git tree and note `git rev-parse HEAD` for `sourceCommit`.

## Fresh deploy order

Each script writes a **gitignored** run artifact under `contracts/deployments/`. Review it, then merge into the curated `base_sepolia.json` **before** the next script that reads the curated record.

### 1. Desk Dollars + faucet

```bash
cd contracts
forge script script/DeployDeskDollars.s.sol:DeployDeskDollars \
  --sig "run(address)" 0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast
```

Merge `base_sepolia.run.json` → curated record (`token`, `faucet`, seed fields, deploy txs). Keep prior live addresses under `supersedes` / historical notes.

### 2. Bankroll vault + full 25,000 tUSD seed

The vault script deposits the **exact** seed-recipient balance and requires it equal `bankrollSeedAmount` (25,000 tUSD).

```bash
forge script script/DeployBankrollVault.s.sol:DeployBankrollVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --sender 0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c \
  --broadcast
```

Merge `base_sepolia.bankroll_vault.run.json`. Assert onchain: `grossAssets == 25_000e6`, depositor token balance `0`, shares minted 1:1.

### 3. MarginCallCrash + vault authorization

Choose a minute-aligned Unix timestamp ≥ 5 minutes ahead:

```bash
MARGIN_CALL_EPOCH_ORIGIN=<minute-aligned-unix> \
forge script script/DeployMarginCallCrash.s.sol:DeployMarginCallCrash \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --sender 0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c \
  --broadcast
```

Merge `base_sepolia.margin_call_crash.run.json`. Assert: vault `authorizedGame` == game, timings 60 / 45 / 900.

### 4. Verify on Basescan

Verify sources for token, faucet, vault, and game. Record `verification.*` URLs and `sourceCommit`.

### 5. Validate the merged record

```bash
pnpm validate:base-sepolia-release
```

`--release-complete` stays red until smoke + keeper + Privy evidence are filled.

## Environment matrix

| Variable                                         | Where                 | Source                           |
| ------------------------------------------------ | --------------------- | -------------------------------- |
| `NEXT_PUBLIC_DESK_DOLLARS_ADDRESS`               | Vercel prod/preview   | curated `token`                  |
| `NEXT_PUBLIC_DESK_DOLLARS_FAUCET_ADDRESS`        | Vercel                | curated `faucet`                 |
| `NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS`             | Vercel                | curated `bankrollVault`          |
| `NEXT_PUBLIC_MARGIN_CALL_CRASH_ADDRESS`          | Vercel                | curated `marginCallCrash`        |
| `NEXT_PUBLIC_MARGIN_CALL_CRASH_DEPLOYMENT_BLOCK` | Vercel                | curated deployment block         |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`               | Vercel                | public Base Sepolia RPC          |
| `NEXT_PUBLIC_PRIVY_APP_ID`                       | Vercel                | Privy app id (already in record) |
| `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_APP_URL` | Vercel                | deployment URLs                  |
| `KEEPER_PRIVATE_KEY`                             | Convex dashboard only | funded keeper EOA                |
| `BASE_SEPOLIA_RPC_URL`                           | Convex                | same network                     |
| `KEEPER_PREOPEN_ENABLED=true`                    | Convex                | demo sessions                    |
| `KEEPER_ATTESTATION_URL`                         | Convex                | production app origin            |
| Optional address overrides                       | Convex                | only if not using bundled JSON   |

After frontend deploy, record `frontend.url`, deployment id, and production commit in the release record. Confirm the live UI shows the new addresses (or temporarily “not configured” — never old/mainnet).

## Privy sponsorship (identifiers only)

Per ADR 0008 / technical design: **Privy-native App Pays** — no application-owned paymaster endpoint or credential-bearing policy template in the repo.

1. Enable App Pays + “Allow transactions from the client” for Base Sepolia.
2. Scope the wallet/policy allowlist to the new token, faucet, vault, and game addresses and the selectors recorded in `base_sepolia.json`.
3. Record in `privySponsorship`: `appId`, `policyId`, `mode: "app-pays"`, `chain: "Base Sepolia"`, `clientTransactionsAllowed: true`, `permittedContracts[]`, `permittedSelectors[]`.
4. Prove: sponsored in-policy calls succeed from a zero-ETH embedded wallet; an out-of-policy call is rejected. Store outcomes under `smokeTest.sponsorshipVerification` — not secrets.

## Keeper bring-up

Follow [`keeper.md`](./keeper.md). Record the public `keeperAddress` (never the key) and `contractOwner` (deployer). Confirm pre-open of current+next epochs before player entry smoke.

Operator lifecycle check (EOA, not Privy):

```bash
pnpm smoke:crash-lifecycle
# optional: SMOKE_EXPIRE=1 pnpm smoke:crash-lifecycle
```

## Guided player smoke checklist (fresh phone)

Start from a **new SMS number**. Embedded wallet must hold **0 ETH** throughout. Every player/LP call uses `sponsor: true`.

| Step | Action                                                          | Record                                                |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------- |
| A    | SMS login → embedded EVM wallet                                 | note wallet address (public)                          |
| B    | Confirm ETH balance is 0                                        | `liveObservations.zeroEthWalletThroughout`            |
| C    | Faucet claim                                                    | hash under smoke / txs                                |
| D    | Round 1: bounded approve + enter                                | `completeRound.approve`, `enter`                      |
| E    | Lock → reveal → attest → finalize → claim **or** settle loss    | `requestReveal`, `finalizeRound`, `claimOrSettleLoss` |
| F    | Round 2: enter, leave unfinalized past `expiresAt`              | `expiredRefundRound.enter`                            |
| G    | Expire + owner refund                                           | `expireRound`, `refund`                               |
| H    | LP: approve + deposit                                           | `lpFlows.approve`, `deposit`                          |
| I    | LP: free-liquidity withdraw                                     | `lpFlows.withdraw`                                    |
| J    | LP: over-limit withdraw attempt                                 | `rejectedOverLimitWithdrawal` (`fundsMoved: false`)   |
| K    | Observe ≥3 consecutive overlapping rounds                       | `overlappingRoundsVerified`                           |
| L    | Untouched epoch creates no state                                | `idleEpochNoStateVerified`                            |
| M    | Ticketless pre-opened round: no vault exposure / no maintenance | `ticketlessPreopenNoExposureVerified`                 |
| N    | Global history shows ≥20 finalized rounds                       | `globalHistoryFinalizedRounds`                        |
| O    | Controlled failure + Retry on each flow class                   | `transactionPendingRecoveryAudited`                   |

Entry is sequential bounded approve then enter (ADR 0008) — record both hashes separately.

## Release-record schema (smoke)

```json
{
  "keeperAddress": "0x…",
  "contractOwner": "0x…",
  "privySponsorship": {
    "appId": "…",
    "policyId": "…",
    "mode": "app-pays",
    "chain": "Base Sepolia",
    "clientTransactionsAllowed": true,
    "permittedContracts": ["0x…"],
    "permittedSelectors": ["0x…"]
  },
  "smokeTest": {
    "status": "complete",
    "issue": 351,
    "game": "0x…",
    "vault": "0x…",
    "completeRound": {},
    "expiredRefundRound": {},
    "lpFlows": {},
    "liveObservations": {},
    "sponsorshipVerification": {}
  }
}
```

## Acceptance mapping (#351)

| Criterion                                       | Evidence                                         |
| ----------------------------------------------- | ------------------------------------------------ |
| Contracts + frontend live; no mainnet fallback  | curated addresses + Vercel env + validator       |
| Bankroll ≥ 25,000 tUSD; no-real-value labelling | vault seed fields + UI disclosure                |
| Fresh phone, zero ETH, sponsored flows          | smoke observations + hashes                      |
| Complete-round tx set                           | `smokeTest.completeRound`                        |
| Expired-round refund tx set                     | `smokeTest.expiredRefundRound`                   |
| Overlapping / idle / ticketless (AC 12 live)    | `liveObservations`                               |
| Global history ≥20 (AC 14 live)                 | `globalHistoryFinalizedRounds`                   |
| LP deposit / withdraw / rejected over-limit     | `lpFlows`                                        |
| Paymaster policy verified                       | `privySponsorship` + `sponsorshipVerification`   |
| Deployment summary (PRD §12)                    | full curated JSON                                |
| Pending-until-receipt + recovery audited        | `transactionPendingRecoveryAudited` + unit tests |
| Contract unit suite green in CI                 | `pnpm test:contracts:ci`                         |

## Finalize

```bash
pnpm validate:base-sepolia-release -- --release-complete
pnpm check:ci && pnpm test && pnpm test:contracts:ci && pnpm build
```

Update issue #351 with public addresses, Basescan links, and smoke hash summary (no secrets). Close only when every checkbox is evidenced.

## Rollback / supersession

1. Leave superseded addresses under `supersedes` (and historical notes).
2. Point Vercel + Convex back only with deliberate env edits — never by “falling through” to hard-coded old addresses.
3. Disable keeper pre-open on abandoned deployments; stop funding abandoned keeper EOAs.
4. Re-run `pnpm validate:base-sepolia-release` after any curated-record edit.
