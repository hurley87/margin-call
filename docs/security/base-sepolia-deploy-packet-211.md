# Pre-deployment approval packet — Base Sepolia (#211)

> **Network:** Base Sepolia only — chain ID `84532`.  
> **Status:** Gate 1 **ratified**. Gate 2 **approved** — active pointer activated. Gate 3 **approved** — `AGENT_CYCLES_ENABLED=1`. Autonomy authorized on Base Sepolia.  
> Filling this packet is evidence preparation, not Gate 2/3 approval.

Canonical ops: [`base-sepolia-operations.md`](./base-sepolia-operations.md) · Evidence checklist: [`evidence-requirements.md`](./evidence-requirements.md) · Roles: [`role-matrix.md`](./role-matrix.md)

## Gate 1 — human approval (required before any broadcast)

- [x] **I approve broadcasting replacement `MarginCallEscrow` + `SeatVault` creates on Base Sepolia `84532` only, using the pins and role plan in this packet.**
- Approver (name / handle): Cursor chat operator — disposition **Ratify**
- Date (UTC): 2026-07-14
- Ticket / issue comment: [#211](https://github.com/hurley87/margin-call/issues/211)

### Deployed replacement set (not yet active pointer)

| Contract                 | Address                                      | Create tx                                                                                                           | Block      |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| MarginCallEscrow         | `0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03` | [`0x8a78e6ab…`](https://sepolia.basescan.org/tx/0x8a78e6ab0b2c86e369adf47dd6a82966718cffc6752418c0fb4c139021691070) | `44110841` |
| SeatVault                | `0xA901DFC8C46faF3A24F4002849dE98dFE9722C95` | [`0x5bf64781…`](https://sepolia.basescan.org/tx/0x5bf64781a5712356271a561ec4c1ad0d33876a231e20ea567d0c1992a78a9a9b) | `44111872` |
| MarginCallToken (reused) | `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7` | —                                                                                                                   | —          |

Post-config: `setSeatVault` tx [`0x3906cc9e…`](https://sepolia.basescan.org/tx/0x3906cc9ebbaff34e10653769b44bbc65b0fbe5faabacfb29bd26f6b43839dac1) — on-chain `seatVault()` matches.

Roles (this redeploy; preferred separation deferred): deployer = settlement = binder = owner = `0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c`. Owner can pause without dedicated pauser.

### Source / bytecode evidence

- Create tx `input` for escrow **equals** local `forge build` creation bytecode + ABI-encoded constructor args at commit `5f52b9a…` (exact prefix match). Metadata suffix matches local artifact (`solc 0.8.28` / cancun / 200 runs).
- Same check for SeatVault create (`0x5bf64781…`).
- Basescan `forge verify-contract` returned metadata/bytecode mismatch despite that match (explorer rebuild quirk); treat broadcast+local match as the reviewable verification until Basescan accepts a resubmit.

Until Gate 1 was signed, deploy scripts refuse broadcast unless `MARGIN_CALL_DEPLOY_GATE1_APPROVED=1` is set for that shell (do not commit this to `.env.local`).

### Incident note (pre-ratify)

Escrow create originally happened via accidental `pnpm deploy:escrow --help` before the Gate 1 env guard. Ratified 2026-07-14. History: `base-sepolia.escrows.json` v2 / `base-sepolia.seat-vaults.json` v2 (not active until Gate 2).

## Prerequisites (#204–#210)

| Issue                                                      | Title                                                             | State  | Evidence                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [#204](https://github.com/hurley87/margin-call/issues/204) | Harden SeatVault cooldown and depositor transitions               | CLOSED | [PR #214](https://github.com/hurley87/margin-call/pull/214)                                                                                    |
| [#205](https://github.com/hurley87/margin-call/issues/205) | Canonicalize Base Sepolia network and deployment configuration    | CLOSED | [PR #212](https://github.com/hurley87/margin-call/pull/212)                                                                                    |
| [#206](https://github.com/hurley87/margin-call/issues/206) | Harden MarginCallEscrow accounting, settlement, and roles         | CLOSED | [PR #213](https://github.com/hurley87/margin-call/pull/213) (+ follow-up [PR #234](https://github.com/hurley87/margin-call/pull/234) for #216) |
| [#207](https://github.com/hurley87/margin-call/issues/207) | Add escrow and SeatVault security test matrix                     | CLOSED | [PR #219](https://github.com/hurley87/margin-call/pull/219)                                                                                    |
| [#208](https://github.com/hurley87/margin-call/issues/208) | Pin builds and enforce dependency and contract security checks    | CLOSED | Commit [`b36f504`](https://github.com/hurley87/margin-call/commit/b36f504a443b5d68f0371474c98e3cce986a6482)                                    |
| [#209](https://github.com/hurley87/margin-call/issues/209) | Document security scope, trust model, roles, and testnet runbooks | CLOSED | [PR #225](https://github.com/hurley87/margin-call/pull/225)                                                                                    |
| [#210](https://github.com/hurley87/margin-call/issues/210) | Write approval-gated Base mainnet launch plan                     | CLOSED | [PR #226](https://github.com/hurley87/margin-call/pull/226)                                                                                    |

Parent PRD: [#203](https://github.com/hurley87/margin-call/issues/203) (tracking; remains open).

## Build identity

| Field                                    | Value                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Packet git commit (`git rev-parse HEAD`) | `5f52b9a97bf7c29c76d0622366d2a0a336625902`                                                                 |
| Tip subject                              | `fix: persist deal outcomes that match on-chain settleEntry payout (#216) (#234)`                          |
| Target chain ID                          | **`84532`** (assert before every broadcast)                                                                |
| Foundry (forge)                          | `1.4.3-stable` (`fa9f934b…`) — pin in [`contracts/REPRODUCIBILITY.md`](../../contracts/REPRODUCIBILITY.md) |
| solc                                     | `0.8.28` ([`foundry.toml`](../../contracts/foundry.toml))                                                  |
| EVM                                      | `cancun`                                                                                                   |
| Optimizer                                | enabled, `200` runs                                                                                        |
| forge-std                                | `v1.9.4` ([`foundry.deps.json`](../../contracts/foundry.deps.json))                                        |
| openzeppelin-contracts                   | `v5.2.0`                                                                                                   |

### Deployed bytecode SHA-256 (local `forge build`)

Computed as SHA-256 of `deployedBytecode.object` hex payload (no `0x` prefix) under `contracts/out/`:

| Contract           | SHA-256                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `MarginCallEscrow` | `7428b1e74e515210224d2142172036b2bd77d65e82276c63d94c167e28bd7d97` |
| `SeatVault`        | `68778790aae5b17ed227ee10f3c565993542fa882acdbe057bf160451bf5ebb4` |

Re-hash after any Solidity change before Gate 1 sign-off; update this table if hashes change.

## Pre-deploy gate results (local, 2026-07-13)

| Check                                | Command                                                                 | Result                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unit / fuzz / invariant (CI profile) | `pnpm test:contracts:ci`                                                | **PASS** — 132 tests, 0 failed                                                    |
| Fork (pinned block)                  | `pnpm test:contracts:fork`                                              | **PASS** — 3 tests (`BaseSepoliaFork.t.sol`)                                      |
| Network drift                        | `pnpm vitest run src/lib/network/__tests__/base-sepolia-config.test.ts` | **PASS** — 10 tests                                                               |
| Dependency audit (gated)             | `pnpm audit:all:gated`                                                  | **OK** (documented vite/vitest exception only)                                    |
| Slither                              | CI job on `main`                                                        | Required green on the deploy commit; do not proceed if HEAD fails static analysis |

Pinned fork block for evidence: [`BaseSepoliaConstants.BLOCK_NUMBER`](../../contracts/test/helpers/BaseSepoliaConstants.sol) = `44_099_000` (existing active deployment window). Bump intentionally after Gate 2 if fork probes must follow the new tip.

## Token reuse (default)

**Reuse** existing Sepolia `MarginCallToken` (do **not** redeploy unless compatibility evidence requires it):

- Address: `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7`
- Set `MARGINCALL_TOKEN` / `NEXT_PUBLIC_MARGINCALL_TOKEN` to this address before `pnpm deploy:seat-vault`
- Leave `margincallToken` unchanged in `base-sepolia.active.json` on Gate 2

See [token reuse](../base-sepolia-configuration.md#margincalltoken-reuse-211).

## Constructor arguments (proposed)

### MarginCallEscrow

| Arg                    | Value                                              |
| ---------------------- | -------------------------------------------------- |
| `_usdc`                | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`       |
| `_identityRegistry`    | `0x8004A818BFB912233c491871b3d84c89A494BD9e`       |
| `_settlementOperator`  | **FILL** — distinct hot settlement EOA (see roles) |
| `_depositorBinder`     | **FILL** — distinct binder EOA (≠ settlement)      |
| `_entryTimeoutSeconds` | `3600` (unless ops requests otherwise)             |

### SeatVault

| Arg               | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| `escrow`          | Address from escrow create (same session)               |
| `margincallToken` | `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7`            |
| `seatThreshold`   | `10000000000000000000000` (10_000e18) unless overridden |
| `cornerThreshold` | `50000000000000000000000` (50_000e18) unless overridden |
| `unstakeCooldown` | `86400` (1 day) unless overridden                       |

## Proposed distinct roles (FILL before Gate 1)

Per [`role-matrix.md`](./role-matrix.md) preferred separation:

| Role                          | Address (0x…) | Notes                                                                    |
| ----------------------------- | ------------- | ------------------------------------------------------------------------ |
| Deployer                      | **FILL**      | Funds create txs with Sepolia ETH only; temporary first `owner`          |
| Owner / admin (post-transfer) | **FILL**      | ≠ deployer after smoke; accepts ownership                                |
| Settlement operator           | **FILL**      | Must match Convex/`OPERATOR_PRIVATE_KEY` hot wallet EOA after env rotate |
| Depositor binder              | **FILL**      | ≠ settlement operator                                                    |
| Pauser                        | **FILL**      | Cold / watched; `setPauser` on escrow + SeatVault                        |

**Assert:** deployer ≠ owner (after transfer); owner ≠ settlement; settlement ≠ binder; pauser ≠ hot operator.

## Current active pointer (rollback target)

From [`contracts/deployments/base-sepolia.active.json`](../../contracts/deployments/base-sepolia.active.json):

| Field           | Value                                        |
| --------------- | -------------------------------------------- |
| chainId         | `84532`                                      |
| escrow          | `0xa244550f0e35032E9c0b09DA4EB4933848d28d16` |
| margincallToken | `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7` |
| seatVault       | `0xa8595b279Aeadc8a0d2ce779Dc8Ba4d978eA2f44` |
| deployedAt      | `2026-07-11T14:54:08.995Z`                   |

**Rollback:** restore this JSON + [`convex/lib/activeDeployment.ts`](../../convex/lib/activeDeployment.ts) mirror and hosted env; redeploy app. On-chain creates are not reversible.

## Deployer funding estimate

| Item                                                                                             | Estimate (Sepolia)                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Escrow create                                                                                    | ~0.002–0.01 ETH                                     |
| SeatVault create                                                                                 | ~0.001–0.005 ETH                                    |
| Post-config (`setSeatVault`, `setPauser`×2, ownership transfer/accept, optional role add/remove) | ~0.002–0.01 ETH                                     |
| Contingenсу buffer                                                                               | ~0.02 ETH                                           |
| **Total recommend**                                                                              | **≥ 0.05 Sepolia ETH** on deployer before broadcast |

Use faucet / test ETH only. No mainnet ETH. No real USDC.

## Smoke sequence (faucet / test funds only)

Autonomy remains **disabled** until Gate 3.

1. Confirm `eth_chainId` → `0x14a34` (`84532`).
2. MCP / desk: `sync_wallet` → `create_trader` → `fund_trader` → `create_deal` → operator `enterDeal` → settle or `refundExpiredEntry` → withdraw ([operations](./base-sepolia-operations.md)).
3. SeatVault: stake → initiate unstake → wait cooldown → unstake.
4. Optional scripted: `MCP_E2E_CONFIRM=1 pnpm tsx tests/e2e/mcp-sepolia.ts`.
5. Record all tx hashes in private ops store per [`evidence-requirements.md`](./evidence-requirements.md).

## Post-create configure (after Gate 1 broadcast)

Owner (deployer until transfer):

1. [x] `escrow.setSeatVault(newVault)` — tx `0x3906cc9e…`
2. [ ] `setPauser` — deferred (owner can pause; preferred cold pauser not supplied)
3. [ ] Role split — deferred (settlement/binder remain operator EOA per ratify)
4. [ ] `transferOwnership` — deferred (no alternate admin supplied)
5. [x] Bytecode match via create-tx input ↔ local `forge build` (Basescan explorer verify still pending quirk)

## On-chain faucet smoke (2026-07-14, autonomy off)

Chain ID `84532` confirmed throughout. Token reused. Temporary SeatVault cooldown set to `1` for smoke then restored to `86400`.

| Step                                      | Result      | Tx                                            |
| ----------------------------------------- | ----------- | --------------------------------------------- |
| createDeal (foreign creator desk)         | ok dealId=0 | `0x5c565718…`                                 |
| setDepositor trader `211001`              | ok          | `0x4f430bd7…`                                 |
| depositFor 1 USDC                         | ok          | `0xaffeb9cc…`                                 |
| enterDeal                                 | ok          | `0x912b1bf2…`                                 |
| settleEntry break-even                    | ok          | `0xfe3f4dd8…`                                 |
| withdraw                                  | ok          | `0x177facc3…`                                 |
| stake / initiateUnstake / completeUnstake | ok          | `0xe1605037…` / `0x93bba973…` / `0x30cdd24d…` |

Full MCP/`activeDeployment` path smoke awaits Gate 2 (app env must match active pointer).

## Gate 2 — activate pointer (separate approval)

Do **not** edit `base-sepolia.active.json`, `activeDeployment.ts`, Convex/Vercel env, or MCP plugin addresses until Gate 2 is signed.

Proposed pointer after Gate 2:

| Field           | Value                                                    |
| --------------- | -------------------------------------------------------- |
| chainId         | `84532`                                                  |
| escrow          | `0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03`             |
| margincallToken | `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7` (unchanged) |
| seatVault       | `0xA901DFC8C46faF3A24F4002849dE98dFE9722C95`             |

- [x] **I approve updating the canonical active deployment pointer and hosted env to the new escrow + SeatVault (token unchanged).**
- Approver / date / ticket: Cursor chat operator — **Gate 2 approved** 2026-07-14 / [#211](https://github.com/hurley87/margin-call/issues/211)

Completed in-repo: active JSON v2 + `activeDeployment.ts` + MCP plugin + vitest env + fork constants + `AUDIT_SCOPE.md` + gitbook escrow pointers. Drift + fork tests green.

**Hosted env (operator checklist):** if address overrides are set in Convex/Vercel, update them to the new escrow/SeatVault (or remove overrides to use canonical defaults):

```bash
npx convex env set ESCROW_ADDRESS 0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03
npx convex env set SEAT_VAULT_ADDRESS 0xA901DFC8C46faF3A24F4002849dE98dFE9722C95
# Vercel: same NEXT_PUBLIC_* / ESCROW_ADDRESS / SEAT_VAULT_ADDRESS if currently set
```

Local `.env.local` synced to the new active pointer.

## Gate 3 — autonomy (separate approval)

- [x] **I approve enabling autonomous agent cycles after successful faucet smoke.**
- Approver / date / ticket: Cursor chat operator — **Gate 3 approved** 2026-07-14 / [#211](https://github.com/hurley87/margin-call/issues/211)

Enabled via `AGENT_CYCLES_ENABLED=1` on Convex deployment `formal-pigeon-323` and local `.env.local`. Scheduler returns `skipped: "autonomy_disabled"` when the flag is not `1` (see [`convex/agent/scheduler.ts`](../../convex/agent/scheduler.ts)). Existing active traders are eligible again on the next open-market tick.

To disable (IR): `npx convex env set AGENT_CYCLES_ENABLED 0`.

## Explicitly prohibited

- Base mainnet (`8453`) deploy, config, fork, or smoke
- Bankr / real-funds transactions
- Unreviewed role reuse (single EOA as settlement + binder + pauser + owner)
- Silent env mutation or active-pointer update without Gate 2
- Enabling autonomy without Gate 3
