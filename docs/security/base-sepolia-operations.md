# Base Sepolia operations runbook

> **Network:** Base Sepolia only — chain ID `84532`.  
> These steps are for another operator to run day-2 testnet operations with faucet/test funds.  
> This document does **not** authorize deployment, env mutation, or enabling autonomous cycles — those require human approval under [#211](https://github.com/hurley87/margin-call/issues/211).

Canonical config: [`docs/base-sepolia-configuration.md`](../base-sepolia-configuration.md).  
Active contracts: [`contracts/deployments/base-sepolia.active.json`](../../contracts/deployments/base-sepolia.active.json).

## Preconditions checklist

- [ ] `git rev-parse HEAD` recorded (see [AUDIT_SCOPE.md](./AUDIT_SCOPE.md))
- [ ] Active pointer chain ID is `84532`
- [ ] `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` / `BASE_SEPOLIA_RPC_URL` set; no silent public fallback
- [ ] Optional address env vars unset **or** exact match to active JSON
- [ ] Operator EOA is an on-chain `settlementOperators` entry and funded with Sepolia ETH for gas
- [ ] Escrow / SeatVault `paused == false` unless intentionally halted
- [ ] Autonomous agent cycles enabled only after explicit [#211](https://github.com/hurley87/margin-call/issues/211) Gate 3 approval

## Read health

1. Resolve escrow / vault / token from active JSON (or matching env).
2. `eth_chainId` via configured RPC must return `0x14a34` (`84532`).
3. Read `paused`, `owner`, `entryTimeoutSeconds`, and a known trader’s `getBalance`.
4. Confirm Convex desk and trader rows for a smoke desk match recent on-chain deposits (money SoT is escrow).

## Routine financial smoke (manual / MCP)

Use faucet Sepolia USDC only.

1. **sync_wallet** — desk Base Account balance refresh against chain.
2. **create_trader** — server mint (CDP / ERC-8004); ensure depositor bound.
3. **fund_trader** — MCP prepare → Base MCP `send_calls` → `confirm_intent` with matching `txHash`.
4. **create_deal** — same prepare/confirm path; verify `DealCreated` on escrow.
5. **enterDeal** — operator-signed path only when cycles approved; verify `DealEntered`.
6. **settle / refund** — settlement operator settles, or after timeout call `refundExpiredEntry`.
7. **withdraw** — depositor withdraws to desk; confirm event + Convex resync.

SeatVault path (capacity): stake → optional initiate unstake → wait cooldown → unstake. Do not allow depositor rebinds mid-cooldown except per hardened contract rules.

## Monitoring (minimum)

| Signal | Action if bad |
| ------ | ------------- |
| Escrow or SeatVault `paused` unexpectedly | Investigate; do not unpause until root cause known ([IR](./incident-response.md)) |
| Pending entries older than `entryTimeoutSeconds` | Refund expired entries; page operator |
| RPC errors / chain ID mismatch | Fail closed; fix env; do not “try mainnet RPC” |
| Operator wallet ETH low | Top up Sepolia ETH only |
| Drift test / CI fail on addresses | Block activation; restore active JSON + TS mirror |

## Pause / unpause (operational)

1. Prefer dedicated **pauser** key (owner may also pause).
2. Call `pause()` on escrow (halts `enterDeal` / settle paths gated by `whenNotPaused`).
3. Call SeatVault `pause()` if staking must stop.
4. Record evidence per [evidence-requirements.md](./evidence-requirements.md).
5. Unpause only after written go-ahead from owner / incident lead.

## Config change (activation)

Changing `base-sepolia.active.json`, `convex/lib/activeDeployment.ts`, or hosted env requires **human approval Gate 2** in [#211](https://github.com/hurley87/margin-call/issues/211). Follow the activation procedure in [base-sepolia-configuration.md](../base-sepolia-configuration.md). Never point active config at Base mainnet.

## Rollback posture (ops)

- **Pointer rollback:** Point active JSON + TS mirror back to a prior verified Sepolia deployment in history files; redeploy hosted env to match. Does not reverse on-chain history.
- **Code rollback:** Redeploy previous app/Convex revision; does not move USDC.
- **Contract rollback:** Impossible in-place; requires new deploy + pointer change under approval.

See [incident-response.md](./incident-response.md) for what cannot be reversed.

## Contacts / ownership

Maintain a private pager list for: escrow owner, pauser, settlement operator custodian, Convex/Vercel admins. Do not commit private keys or personal phone numbers in this repository.
