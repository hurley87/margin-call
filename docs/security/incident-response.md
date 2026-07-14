# Incident response (Base Sepolia)

> **Network:** Base Sepolia only — chain ID `84532`.  
> Practice these steps with test funds. This runbook does **not** authorize mainnet actions or silent environment changes.

Severity is relative to **testnet funds and reputation**, but treat procedures as rehearsal for any future mainnet plan.

## Severity guide

| Level | Examples                                                                                              | Initial action                                         |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sev-1 | Active unauthorized settles; binder reassigning depositors; mass drain                                | Pause escrow (+ SeatVault if needed); remove bad roles |
| Sev-2 | Stale RPC causing false confirms; pending-entry backlog; operator key exposure without observed abuse | Pause if uncertain; rotate; verify chain state         |
| Sev-3 | Dependency advisory; docs drift; monitoring gap                                                       | Ticket; no unnecessary pause                           |

## Immediate containment (Sev-1 / uncertain Sev-2)

1. **Pause** escrow via pauser or owner: `pause()`.
2. **Pause** SeatVault if stakes are at risk: `pause()`.
3. **Disable** autonomous cycles (`npx convex env set AGENT_CYCLES_ENABLED 0` — or unset; scheduler skips with `autonomy_disabled`) so operators stop calling `enterDeal`. Additionally pause/resume traders as needed.
4. **Snapshot** evidence: block number, `eth_chainId`, role mappings, recent txs, Convex logs (see [evidence requirements](./evidence-requirements.md)).
5. **Communicate** to maintainers on a private channel; no public issue with exploit detail.

## Role / key rotation

Order matters — revoke on-chain **before** destroying usable old key access if you still need it for revoke txs; prefer using **owner** to revoke a compromised operator.

### Compromised settlement operator

1. Owner: `removeSettlementOperator(compromised)`.
2. Confirm mapping is false on-chain.
3. Generate new operator key offline; fund with Sepolia ETH.
4. Owner: `addSettlementOperator(new)`.
5. Update `OPERATOR_PRIVATE_KEY` in Convex/Vercel.
6. Smoke a single enter/settle on a tiny Faust deal after unpause approval.

### Compromised depositor binder

1. Owner: `removeDepositorBinder(compromised)`.
2. Add new binder; audit recent `DepositorSet` events; rebind affected traders under policy.
3. Rotate any off-chain key that had binder rights.

### Compromised owner

1. If two-step pending to attacker: do not accept; race to a safe acceptor if still owner.
2. If attacker is already owner: pause if still possible via pauser; otherwise treat as lost admin — plan emergency desk notifications and pointer freeze (stop advertising the deployment).

### Compromised MCP / CDP / Privy secrets

1. Rotate secrets in both Convex and Vercel (MCP service token must match).
2. Force desk MCP key re-issue (SIWE).
3. Review recent `confirm_intent` and mint events.

Full matrix: [role-matrix.md](./role-matrix.md).

## Refunds

- After `entryTimeoutSeconds`, anyone may call `refundExpiredEntry(dealId, traderId)` for an expired pending entry (per contract).
- Prefer scripted, logged refunds; verify `EntryRefunded` and Convex balance apply idempotently.
- Do **not** invent off-chain refunds that skip the contract.

## Rollback

| Action                            | Reversible?     | Notes                                                             |
| --------------------------------- | --------------- | ----------------------------------------------------------------- |
| App / Convex code deploy          | Yes             | Redeploy prior revision                                           |
| Env var change                    | Yes (config)    | Can break address fail-closed checks if mismatched                |
| Active pointer JSON               | Yes (pointer)   | On-chain state of old/new contracts remains                       |
| Pause / unpause                   | Yes             | Log who unpaused                                                  |
| Settlement / binder membership    | Yes             | Additive history remains on-chain                                 |
| Ownership transfer (completed)    | Difficult       | Only via new transfer by current owner                            |
| Individual `settleEntry` payout   | **No**          | Funds already moved; compensate only via new txs if policy allows |
| Desk USDC spent with confirmation | **No** on-chain | Desk controls Base Account                                        |

Freeze the **active pointer** and hosted config under incident lead approval rather than hastily “rolling forward” to an unaudited bytecode.

## Recovery / reopen

1. Root cause written and linked from the incident ticket.
2. Compromised roles removed; new roles verified on explorer.
3. Source verification still matches claimed bytecode for active addresses.
4. Smoke sequence from [base-sepolia-operations.md](./base-sepolia-operations.md) passes on faucet funds.
5. Explicit human approvals to **unpause** and (separately) to **re-enable autonomous cycles**.

## Post-incident

- Update [AUDIT_SCOPE.md](./AUDIT_SCOPE.md) commit/deployment anchors if contracts changed.
- Append deployment evidence if a replacement was activated under [#211](https://github.com/hurley87/margin-call/issues/211).
- Feed themes into [threat-model.md](./threat-model.md) and private lessons learned (no secret material in-repo).
