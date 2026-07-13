# Threat model (Base Sepolia)

> **Network:** Base Sepolia only — chain ID `84532`.  
> Documentation may describe testnet operations but does **not** authorize deployment or environment changes.  
> No Base mainnet address or transaction is active.

Trust boundaries for Margin Call’s testnet stack: on-chain escrow / SeatVault / token, operator and binder keys, MCP desk treasury, Convex game state, and RPC / config integrity.

Companion docs: [role matrix](./role-matrix.md), [audit scope](./AUDIT_SCOPE.md), [incident response](./incident-response.md).

## Assets

| Asset | Why it matters |
| ----- | -------------- |
| Escrow USDC balances (per trader) | Desk funds at risk on testnet |
| Platform fees in escrow | Extractable by owner |
| Pending deal entries | Can lock entry cost until settle / refund / timeout |
| SeatVault `$BLOW` principal | Capacity stake; cooldown grief if mis-bound |
| Operator settlement authority | Can enter and settle deals |
| Depositor binder authority | Can reassign who may withdraw a trader’s escrow |
| Desk treasury wallet (Base Account) | Funds traders and creates deals via MCP |
| Convex desk / trader balance mirrors | Gate create_trader and UX; must not invent chain truth |
| Secrets: `OPERATOR_PRIVATE_KEY`, MCP tokens, CDP, Privy | Full or partial protocol control |

## Trust assumptions

1. **Chain:** Only Base Sepolia `84532` appears in active financial paths. Mainnet `8453` and mainnet USDC are forbidden in active exports ([`convex/lib/baseSepoliaNetwork.ts`](../../convex/lib/baseSepoliaNetwork.ts)).
2. **USDC / registries:** Canonical Sepolia USDC and ERC-8004 identity registry addresses are trusted as published; Margin Call does not patch their code.
3. **Desk non-custodial path:** Desk treasury USDC leaves the operator’s custody; desks approve MCP prepare intents via Base Account `send_calls`.
4. **Operator is hot:** Settlement / entry uses a hot operator key for autonomy. Compromise equals malicious settlement until rotated and paused.
5. **Convex is game SoT; escrow is money SoT:** On disagreement, on-chain balances and events win for financial truth.
6. **LLM does not decide odds:** Mechanical odds decide outcomes; the model narrates. Prompt injection into narration is reputational, not a payout oracle — **unless** a bug wires LLM output into settle parameters (treat that as critical if found).

## Threat themes

### T1 — Hot-key compromise (operator / binder / CDP)

- **Attack:** Steal `OPERATOR_PRIVATE_KEY` or depositor-binder key material; or CDP secrets for identity wallets.
- **Impact:** Unauthorized `enterDeal` / `settleEntry`; binder can re-point depositors and enable wrongful withdraw; CDP compromise affects trader identity wallets (not desk treasury under BYO Base Account).
- **Mitigations:** Distinct roles ([role matrix](./role-matrix.md)); pause escrow; remove compromised operator/binder; rotate secrets in Vercel/Convex; record evidence ([evidence requirements](./evidence-requirements.md)).

### T2 — Malicious settlement

- **Attack:** Colluding or compromised settlement operator settles with inflated/deflated payouts, or enters deals against desk intent.
- **Impact:** Distorts testnet pots and trader balances; destroys fairness.
- **Mitigations:** Owner can remove settlement operators; pause; audit settle call args against Convex outcomes; keep operator gas wallet funded separately from treasury.

### T3 — Stale RPC / config

- **Attack:** Point `BASE_SEPOLIA_RPC_URL` at a malicious or lagging endpoint; or set env addresses that diverge from `base-sepolia.active.json`.
- **Impact:** False confirms, missed events, or attempted use of wrong contracts. Mismatch must **fail closed** (see [base Sepolia configuration](../base-sepolia-configuration.md)).
- **Mitigations:** Pin RPC to a known provider; drift tests; refuse silent public-RPC fallbacks; never accept mainnet addresses in env.

### T4 — Timeout / liveness

- **Attack:** Entries left `pending` without settle; grief via unstake cooldown; agent cron offline during NYSE hours; pause left on indefinitely.
- **Impact:** Locked USDC until `refundExpiredEntry` after `entryTimeoutSeconds`; capacity lockups; trading halt.
- **Mitigations:** Documented refund path in [operations](./base-sepolia-operations.md) and [IR](./incident-response.md); monitor pending entries and pause state; SeatVault cooldown rules that prevent replacement-depositor grief (hardened contract behavior).

### T5 — Treasury ownership / MCP desk wallet

- **Attack:** Compromise Base Account controlling a desk; steal `mc_live_*` MCP key + coerce confirms; inflate Convex `walletBalanceUsdc` if sync is not chain-backed.
- **Impact:** Loss of desk test USDC; fraudulent trader funding gates if balance sync is trusted blindly.
- **Mitigations:** Non-custodial prepare/confirm; SIWE key binding; sync from chain where implemented; desk wallet rebind requires proof-of-control policies as hardened.

### T6 — Role rotation gaps

- **Attack:** Rotate only the operator secret in Vercel but leave old address still authorized on-chain; or transfer ownership without completing two-step accept.
- **Impact:** Dual-control confusion; old key remains live.
- **Mitigations:** On-chain remove before destroying old key material; complete `transferOwnership` + `acceptOwnership`; checklist in [role matrix](./role-matrix.md) and [IR](./incident-response.md).

### T7 — Own-desk / economic rule bypass

- **Attack:** Call paths that skip desk-dedup or own-desk checks off-chain while on-chain allows entry.
- **Impact:** Self-dealing or duplicate exposures.
- **Mitigations:** Enforce on-chain where possible; keep selection and `recordVerifiedEntry` checks aligned ([review findings](../review-findings.md) for residual risks).

## Out of model (for this testnet doc)

- Nation-state RPC eclipse of all public Sepolia endpoints simultaneously
- Zero-day in `solc` 0.8.28 or OpenZeppelin 5.2.0 (track advisories; pin versions per [`contracts/REPRODUCIBILITY.md`](../../contracts/REPRODUCIBILITY.md))
- Bankr / mainnet token launch economics (see future mainnet plan doc when present)
