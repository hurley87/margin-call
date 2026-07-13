# Role matrix (Base Sepolia)

> **Network:** Base Sepolia only — chain ID `84532`.  
> Distinct humans or hardware should hold distinct privileged roles on any hardened redeploy.  
> This matrix documents compromise impact and rotation; it does **not** authorize role changes.

On-chain roles are defined in [`MarginCallEscrow.sol`](../../contracts/src/MarginCallEscrow.sol) and [`SeatVault.sol`](../../contracts/src/SeatVault.sol). Off-chain actors hold secrets or approve intents.

## Escrow (`MarginCallEscrow`)

| Role | How granted | Capabilities | Compromise impact | Rotation procedure |
| ---- | ----------- | ------------ | ----------------- | ------------------ |
| **Owner (admin)** | Deployer becomes `owner`; two-step transfer via `transferOwnership` / `acceptOwnership` | Add/remove settlement operators and depositor binders; set pauser; set SeatVault; set entry timeout; `withdrawFees`; pause/unpause | Full admin: fee drain, role packing, SeatVault repoint, timeout grief | Start two-step transfer to new EOA/multisig → acceptor calls `acceptOwnership` → verify `owner` on explorer → retire old key |
| **Pending owner** | `transferOwnership` | Only `acceptOwnership` | Low alone; social-engineer accept | Cancel by transferring ownership to a burn/current owner pattern if supported in ops policy, or complete intentionally |
| **Pauser** | `setPauser` by owner (owner can always pause) | `pause` / `unpause` | Freeze trading / unfreeze under attack | Owner `setPauser(new)`; test pause on Sepolia; update runbook contacts |
| **Settlement operator** | Constructor seed + `addSettlementOperator` | `enterDeal`, `settleEntry` | Malicious entry/settlement of any deal | `removeSettlementOperator(old)` **before** rotating `OPERATOR_PRIVATE_KEY` / env; `addSettlementOperator(new)`; verify mapping |
| **Depositor binder** | Constructor seed + `addDepositorBinder` | `setDepositor(traderId, depositor)` | Redirect withdraw rights for traders | `removeDepositorBinder(old)` then add new; re-bind depositors only under empty-balance / policy constraints in hardened builds |
| **Depositor (per trader)** | Set by binder | `depositFor`, `withdraw`, SeatVault stake authority for that traderId | Drain that trader’s escrow (+ stake control) | Binder sets new depositor per policy; desk rotates Base Account if treasury was the depositor |

## SeatVault

| Role | How granted | Capabilities | Compromise impact | Rotation procedure |
| ---- | ----------- | ------------ | ----------------- | ------------------ |
| **Owner** | Constructor; two-step transfer | Policy updates (`setToken`, thresholds, cooldown); set pauser; ownership transfer | Change capacity economics; freeze via pause collusion | Same two-step pattern as escrow |
| **Pauser** | `setPauser` | Pause / unpause staking | Halt stake/unstake | Owner sets new pauser |
| **Staker** | Current escrow depositor for `traderId` | Stake / initiate unstake / complete unstake | Steal or lock own principal; cannot steal others’ without depositor bind | Desk controls via depositor address |

## Deployer

| Role | Capabilities | Compromise impact | Rotation / notes |
| ---- | ------------ | ----------------- | ---------------- |
| **Deployer EOA** | Broadcasts create txs; usually first `owner` | Can be retired after ownership transfer | Fund with Sepolia ETH only; transfer admin off deployer after smoke; never reuse as settlement hot wallet |

## Off-chain / platform

| Actor | Privileges | Compromise impact | Rotation procedure |
| ----- | ---------- | ----------------- | ------------------ |
| **Operator hot wallet** (`OPERATOR_PRIVATE_KEY`) | Must match an on-chain settlement operator (and historically binder duties if same key — prefer split) | See settlement / binder rows | On-chain remove → new key → add → update Convex/Vercel env → smoke enter/settle |
| **MCP service** (`MCP_SERVICE_TOKEN`) | Next.js ↔ Convex MCP HTTP | Forge MCP calls if exposed | Rotate token in both places identically; invalidate old deploys |
| **MCP API key HMAC** (`MCP_API_KEY_SECRET`) | Hash `mc_live_*` keys | Forge key hashes | Rotate secret; force desks to re-issue SIWE keys |
| **Per-desk MCP key** (`mc_live_*`) | Desk-scoped MCP API | Desk treasury prepare abuse until unbound | Desk re-SIWE; new key supersedes |
| **Desk treasury (Base Account)** | Approves MCP `send_calls` | Loss of desk Sepolia USDC | User recovers via Base Account controls; rebind desk wallet only with proof-of-control |
| **CDP credentials** | Mint/manage trader identity smart accounts | Identity wallet abuse | Rotate CDP secrets; audit recent mints |
| **Privy app secrets** | Auth / embedded wallets | Session/user spoof risk | Rotate in Privy dashboard + Vercel |
| **Convex / Vercel admins** | Deploy code and env | Silent config mutation | Enforce dual-review on env; [#211](https://github.com/hurley87/margin-call/issues/211) activation gates |

## Preferred separation (testnet hardening)

For any replacement Sepolia deploy under approval gate [#211](https://github.com/hurley87/margin-call/issues/211):

1. Deployer ≠ owner (transfer after smoke)
2. Owner ≠ settlement operator
3. Settlement operator ≠ depositor binder
4. Pauser is a cold/watched key separate from the hot operator
5. Desk treasuries remain end-user Base Accounts (non-custodial)

## Related

- [Threat model](./threat-model.md)
- [Incident response](./incident-response.md)
- [Base Sepolia operations](./base-sepolia-operations.md)
