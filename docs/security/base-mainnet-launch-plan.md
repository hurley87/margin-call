# Base mainnet launch plan (planning only)

> **THIS DOCUMENT DOES NOT AUTHORIZE ANY MAINNET WORK.**  
> It is a future launch plan with placeholders. It does **not** authorize:
>
> - Bankr token launch  
> - Base-mainnet (`8453`) contract deployment or configuration  
> - Mainnet forks or smoke tests  
> - Real-USDC transactions  
> - Creator-fee claiming or conversion  
> - Enabling autonomous cycles on mainnet  
>
> Current authorized network remains **Base Sepolia (`84532`)** only.  
> See testnet security docs: [`AUDIT_SCOPE.md`](./AUDIT_SCOPE.md), [`threat-model.md`](./threat-model.md), [`role-matrix.md`](./role-matrix.md).

Parent tracking: [#203](https://github.com/hurley87/margin-call/issues/203). Companion Sepolia activation: [#211](https://github.com/hurley87/margin-call/issues/211). This plan corresponds to [#210](https://github.com/hurley87/margin-call/issues/210).

Every unknown address, transaction, role holder, and funding amount below **must** remain an obvious placeholder until independent evidence replaces it **and** the matching human gate is signed.

---

## 1. Approval gates (separate, named)

No gate implies the next. Each requires **independent evidence review** and an **explicit human approval** recorded outside this file (ticket / signed checklist).

| Gate | Name | May proceed only after | Irreversible effects if executed |
| ---- | ---- | ---------------------- | -------------------------------- |
| **A** | Bankr launch evidence reviewed | Bankr `$BLOW` launch artifacts collected and accepted | None from this gate alone (review only) |
| **B** | Token compatibility signed off | Gate A; compatibility checklist complete | None from this gate alone |
| **C** | Contract deployment approved | Gates A–B; pre-deploy packet complete | Mainnet create txs (irreversible bytecode at addresses) |
| **D** | Configuration / active-pointer activation approved | Gate C; source verification complete | Production env + app routing to mainnet contracts |
| **E** | Smoke tests complete | Gate D; minimal-funds sequence passed | Real USDC movement (small); operational confidence |
| **F** | Autonomous cycles enabled | Gate E; hot-key and monitoring ready | Unattended enter/settle on mainnet |

**Forbidden:** collapsing A–F into a single “ship it” approval; treating this markdown file as the approval record.

---

## 2. Bankr `$BLOW` evidence and compatibility checklist

Fill only with verified mainnet evidence. Until then keep placeholders.

| Field | Placeholder / required evidence |
| ----- | -------------------------------- |
| Token address | `TBD_MAINNET_BLOW_TOKEN` (`0x…PENDING`) |
| Chain ID | Must be `8453` when filled; never silent Sepolia |
| Name / symbol / decimals | `TBD` — record explorer + `decimals()` call evidence |
| Transfer restrictions / allowlists / taxes | `TBD` — document if any |
| Pool / liquidity venue | `TBD_MAINNET_BLOW_POOL` |
| Pool creation tx | `TBD_MAINNET_POOL_TX` |
| Bankr launch attestation | Link to Bankr launch evidence (`TBD_BANKR_EVIDENCE_URL`) |
| Holders / distribution notes | `TBD` |
| Compatibility with SeatVault | [ ] ERC-20 `transfer`/`transferFrom` behave as assumed by `SafeERC20` |
| Compatibility with capacity thresholds | [ ] 10,000 / 50,000 unit policy still correct for mainnet decimals |
| Fee-on-transfer / rebasing | [ ] Confirmed **absent** or vault/escrow redesigned |

**Gate A** signs that Bankr evidence is authentic. **Gate B** signs that Margin Call contracts and off-chain code can safely use this token.

---

## 3. Placeholder Base-mainnet deployment fields

Do not copy Sepolia addresses into these rows. Do not treat Sepolia as mainnet.

### Contracts

| Component | Address placeholder | Deploy tx | Block | Verified URL |
| --------- | ------------------- | --------- | ----- | ------------ |
| `MarginCallEscrow` | `TBD_MAINNET_ESCROW` (`0x…PENDING`) | `TBD_MAINNET_ESCROW_TX` | `TBD` | `TBD` |
| `SeatVault` | `TBD_MAINNET_SEAT_VAULT` (`0x…PENDING`) | `TBD_MAINNET_SEAT_VAULT_TX` | `TBD` | `TBD` |
| `$BLOW` token | `TBD_MAINNET_BLOW_TOKEN` (`0x…PENDING`) | (Bankr / external) | `TBD` | `TBD` |
| USDC (Base mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — **cite only after Gate D**; forbidden in active Sepolia paths today | n/a | n/a | Circle docs |
| Identity registry | `TBD_MAINNET_IDENTITY_REGISTRY` | `TBD` | `TBD` | `TBD` |
| Reputation registry | `TBD_MAINNET_REPUTATION_REGISTRY` | `TBD` | `TBD` | `TBD` |
| ERC-6551 registry / implementation | `TBD_MAINNET_ERC6551_*` | `TBD` | `TBD` | `TBD` |

### Active pointer / config (must not exist until Gate D)

| Artifact | Placeholder |
| -------- | ----------- |
| Mainnet active JSON | `TBD` — e.g. future `contracts/deployments/base-mainnet.active.json` (**do not create as “live” without Gate D**) |
| TS mirror | `TBD` |
| Vercel / Convex env profile | `TBD_MAINNET_ENV_PROFILE` |

---

## 4. Chain-specific environment and ownership-role matrix

| Concern | Base Sepolia (current, authorized) | Base mainnet (future, gated) |
| ------- | ---------------------------------- | ---------------------------- |
| Chain ID | `84532` | `8453` |
| USDC | Sepolia USDC `0x036CbD…` | Mainnet USDC `0x833589…` (only after Gate D) |
| Escrow / vault / token | [`base-sepolia.active.json`](../../contracts/deployments/base-sepolia.active.json) | `TBD_MAINNET_*` placeholders above |
| RPC | `BASE_SEPOLIA_RPC_URL` | `TBD_MAINNET_RPC_URL` (dedicated; no Sepolia fallback) |
| Operator key | Sepolia hot operator | **New** mainnet operator key (`TBD_MAINNET_OPERATOR`) — never reuse Sepolia key material |
| Owner / pauser / binder | Sepolia role holders | Distinct mainnet holders (`TBD_MAINNET_OWNER`, `TBD_MAINNET_PAUSER`, `TBD_MAINNET_BINDER`) |
| Desk treasury | Base Account on Sepolia | Base Account on mainnet (same product UX; different chain funds) |
| Autonomy | Gated by [#211](https://github.com/hurley87/margin-call/issues/211) Gate 3 on testnet | **Gate F** only |

Role capability definitions reuse the testnet [role matrix](./role-matrix.md); mainnet must apply **stricter** key separation and prefer multisig for `owner` (`TBD_MAINNET_OWNER_MULTISIG`).

---

## 5. Source verification and deployment-evidence requirements

Mirror the Sepolia checklist in [`evidence-requirements.md`](./evidence-requirements.md), with mainnet-specific fields:

- [ ] Pre-deploy packet: clean unit/fuzz/invariant/fork/static-analysis/dependency results against the **exact** mainnet candidate commit (`TBD_MAINNET_COMMIT`)
- [ ] Compiler pins match [`contracts/REPRODUCIBILITY.md`](../../contracts/REPRODUCIBILITY.md) (or a superseding pin set reviewed at Gate C)
- [ ] Constructor args listed and reviewed (USDC mainnet, registries, distinct roles, entry timeout)
- [ ] Deployer funding estimate (`TBD_ETH_WEI`) and funded from a cold ops wallet
- [ ] Create txs + addresses filled into §3 tables
- [ ] Explorer source verification URLs on Base mainnet
- [ ] Runtime bytecode hash == local reproducible build
- [ ] Role holders recorded on-chain post-deploy
- [ ] Evidence stored privately; only non-sensitive summaries linked from the activation ticket

**Gate C** approves broadcast. Verification may complete before **Gate D** activation of app config.

---

## 6. Hot-key risks, funding, monitoring, rollback, incident

### Hot-key risks

- Mainnet settlement operator is a **hot** key with enter/settle power over **real USDC**.
- Compromise impact equals malicious settlement until pause + removal (see [threat model](./threat-model.md) T1/T2).
- Prefer hardware or HSM-backed operator with low ETH balance; owner/pauser colder than operator.

### Funding requirements (placeholders)

| Item | Amount placeholder | Purpose |
| ---- | ------------------ | ------- |
| Deployer ETH | `TBD_ETH_DEPLOY` | Create txs |
| Owner / pauser ETH | `TBD_ETH_ADMIN` | Rare admin txs |
| Operator ETH | `TBD_ETH_OPERATOR` | enter/settle gas |
| Smoke USDC | `TBD_USDC_SMOKE` (minimal) | Gate E sequence only |
| Desk treasury USDC | `TBD_USDC_DESK` | Post-smoke real desks — separate from smoke wallet |

### Monitoring (before Gate F)

- Pause-state alerts on escrow + SeatVault  
- Pending-entry age vs `entryTimeoutSeconds`  
- Operator ETH balance  
- Anomalous settle size vs pot accounting  
- RPC / chain ID mismatch fail-closed  
- Dependency and deploy drift CI  

### Rollback and incident — what can / cannot reverse

| Step | Reversible? |
| ---- | ----------- |
| App/Convex code release | Yes — redeploy prior revision |
| Env / active pointer | Partially — can point away; on-chain state remains |
| Pause | Yes |
| Role remove/add | Yes (membership) |
| Completed ownership transfer | Only via further transfer by current owner |
| Deployed bytecode at an address | **No** |
| `settleEntry` / user withdrawals / desk spends | **No** on-chain |
| Bankr token launch | **Out of Margin Call control** once launched |

Incident procedures follow the same shape as [incident-response.md](./incident-response.md) (pause → revoke → rotate → evidence → controlled unpause), adapted to mainnet contacts and real-fund severity. **Do not** practice IR with mainnet funds under this document alone.

---

## 7. Minimal-funds smoke-test sequence (Gate E only)

Execute only after Gates A–D. Use `TBD_USDC_SMOKE` from a dedicated smoke desk. **Not authorized by this plan text** — Gate E approval is required.

1. Confirm `eth_chainId == 8453` and active mainnet pointer matches §3.  
2. `sync_wallet` — mainnet USDC balance.  
3. `create_trader` — mint identity on mainnet registries.  
4. Bind depositor; fund trader with smoke USDC (prepare → `send_calls` → confirm).  
5. Create a tiny-pot deal; enter via operator; settle or refund-after-timeout.  
6. Withdraw remaining USDC to desk.  
7. Optional: stake dust `$BLOW` → cooldown path if policy requires.  
8. Record all txs in the evidence store.  
9. **Stop.** Do not enable autonomous cycles until **Gate F**.

---

## 8. Explicit non-authorization and confusion guardrails

- Presence of mainnet USDC address in this plan is **reference only** until Gate D.  
- Sepolia active addresses must never be pasted into “mainnet production” runbooks as live.  
- This file must not be linked from README as “mainnet is live.”  
- Automation (agents, CI) must not read placeholders as deploy targets.  
- Completing Sepolia [#211](https://github.com/hurley87/margin-call/issues/211) does **not** grant any mainnet gate.

---

## Document control

| Field | Value |
| ----- | ----- |
| Status | Planning draft |
| Network authorized today | Base Sepolia `84532` only |
| Mainnet work authorized by this file | **None** |
| Issue | [#210](https://github.com/hurley87/margin-call/issues/210) |
