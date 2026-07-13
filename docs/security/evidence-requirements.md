# Evidence requirements (Base Sepolia)

> **Network:** Base Sepolia only — chain ID `84532`.  
> Collect and retain the artifacts below so another reviewer can verify what was deployed, configured, and operated.  
> Filling this checklist is **not** itself an approval to deploy — see [#211](https://github.com/hurley87/margin-call/issues/211).

Distinguish evidence kinds ([AUDIT_SCOPE.md](./AUDIT_SCOPE.md)):

| Kind | Typical artifacts |
| ---- | ----------------- |
| Source review | Diff comments, commit SHA, reviewer identity, date |
| Vulnerability audit | Engagement letter, fixed commit, findings PDF, remediation PR links |
| Source verification | Explorer verification URL, matching solc/optimizer settings, bytecode hash |
| Deployment evidence | Tx hashes, addresses, constructor args, role holders, block numbers |

## Deploy

Record for each contract create:

- [ ] Git commit SHA built
- [ ] Foundry / solc / optimizer / EVM pins ([`contracts/REPRODUCIBILITY.md`](../../contracts/REPRODUCIBILITY.md))
- [ ] `forge build` bytecode hash (`deployedBytecode.object` hash)
- [ ] Deployer address and Sepolia ETH funding tx
- [ ] Create transaction hash, block number, timestamp
- [ ] Constructor arguments (USDC, identity registry, settlement operator, depositor binder, entry timeout; SeatVault: escrow, token, thresholds, cooldown)
- [ ] Resulting contract address
- [ ] `eth_chainId` proof = `84532` at send time
- [ ] Append row to the appropriate `contracts/deployments/base-sepolia.*.json` history file

## Verify (source verification)

- [ ] Explorer verification success URL (Base Sepolia)
- [ ] Compiler version `0.8.28`, optimizer `200` runs, EVM `cancun` (or exact pins used)
- [ ] Runtime bytecode matches local reproducible build
- [ ] Constructor ABI-encoded args match deploy record

## Configure / activate

Activation requires human Gate 2 approval ([#211](https://github.com/hurley87/margin-call/issues/211)).

- [ ] Diff of `base-sepolia.active.json` and `convex/lib/activeDeployment.ts` (must match)
- [ ] Hosted env var values (or confirmation unset → canonical defaults)
- [ ] Drift tests: `pnpm test` network config suite green
- [ ] MCP plugin markdown addresses aligned
- [ ] On-chain role holders after configure (owner, pauser, operators, binders)
- [ ] Written approval artifact (who / when / ticket)

## Monitor

Retain for the operational window:

- [ ] RPC endpoint identity (provider + URL host; no secrets in-repo)
- [ ] Pause-state polls / alerts configuration
- [ ] Pending-entry age alerts vs `entryTimeoutSeconds`
- [ ] Operator gas balance checks
- [ ] Links to Convex / Vercel log queries used during the window

## Pause

- [ ] Tx hash for `pause` / `unpause` (escrow and SeatVault separately)
- [ ] Caller address (pauser vs owner)
- [ ] Block number and reason code/ticket
- [ ] Autonomous-cycle disable confirmation

## Rotate

- [ ] Before: role mapping read (old address authorized)
- [ ] Tx: `remove*` then `add*` (or ownership two-step txs)
- [ ] After: mapping read (only new address)
- [ ] Env secret rotation timestamps (Convex + Vercel)
- [ ] Smoke tx hashes post-rotation

## Refund

- [ ] `dealId`, `traderId`, entry timestamp, timeout threshold
- [ ] `refundExpiredEntry` tx hash and `EntryRefunded` log
- [ ] Convex balance reconciliation evidence

## Rollback

- [ ] Prior active pointer snapshot (JSON + TS)
- [ ] New (rollback) pointer commit SHA
- [ ] Hosted env redeploy ID
- [ ] Explicit note of on-chain actions that **cannot** be rolled back (settles, withdrawals)

## Recovery

- [ ] Root-cause write-up link
- [ ] Completed smoke sequence checklist ([operations](./base-sepolia-operations.md))
- [ ] Separate approvals: unpause vs re-enable autonomy
- [ ] Updated [AUDIT_SCOPE.md](./AUDIT_SCOPE.md) anchors if deployment changed

## Storage

Keep evidence in a private ops store (drive/ticket). Commit to git only non-sensitive, source-controlled pieces (deployment JSON history, this documentation). Never commit private keys, raw MCP keys, or access tokens.
