# Security Policy

Margin Call currently operates on **Base Sepolia only** (chain ID `84532`). This policy covers vulnerability reporting and disclosure for the repository and the active testnet deployment. It does **not** authorize Base mainnet deployment, configuration, or transactions.

## Supported surfaces

In scope for reports:

- Smart contracts under `contracts/src/` as pinned by the active Base Sepolia deployment pointer
- Convex backend functions that move or authenticate money (escrow, MCP prepare/confirm, agent enter/resolve)
- Next.js API routes that sign operator transactions or mint identity wallets
- Privileged configuration and secrets handling documented in [`docs/security/`](docs/security/)

Out of scope:

- Social engineering of individual desks or users
- Issues that require a compromised third-party provider with no Margin Call mitigation path (report for awareness; triage may defer)
- Findings against third-party registries (ERC-8004 / ERC-6551) that Margin Call does not control
- Speculative mainnet attack scenarios presented as active production risk while only Sepolia is authorized

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

1. Email the maintainers with a private report (prefer a GitHub Security Advisory draft if you have repository access).
2. Include:
   - Affected commit SHA or branch
   - Affected contract address / function / API route (if known)
   - Impact (funds at risk, privilege escalation, auth bypass, DoS)
   - Reproduction steps or proof-of-concept against **Base Sepolia test funds only**
   - Suggested fix if you have one
3. We aim to acknowledge within **3 business days** and provide a triage status within **10 business days**.

While triage is open, please keep details private unless we agree otherwise.

## Disclosure

- We prefer coordinated disclosure after a fix or documented mitigation is available on the supported network.
- Public write-ups may reference fixed commits and Base Sepolia deployment evidence once released.
- Do not present Base mainnet addresses or transactions as in-scope active targets; mainnet work is planning-only (see [`docs/security/base-mainnet-launch-plan.md`](docs/security/base-mainnet-launch-plan.md) when present).

## Safe harbor

We will not pursue legal action against good-faith researchers who:

- Follow this policy
- Avoid privacy violations, destruction of data, and disruption of non-test users beyond what is needed to demonstrate the issue
- Use only testnet / faucet funds on Base Sepolia
- Give us reasonable time to remediate before public disclosure

## Related documentation

| Document | Purpose |
| -------- | ------- |
| [`docs/security/AUDIT_SCOPE.md`](docs/security/AUDIT_SCOPE.md) | What is (and is not) under review |
| [`docs/security/threat-model.md`](docs/security/threat-model.md) | Trust assumptions and attack themes |
| [`docs/security/role-matrix.md`](docs/security/role-matrix.md) | Privileged roles and compromise impact |
| [`docs/security/incident-response.md`](docs/security/incident-response.md) | Pause, rotate, refund, rollback |
| [`docs/security/evidence-requirements.md`](docs/security/evidence-requirements.md) | Deploy / verify / operate evidence |

## Distinctions (do not conflate)

| Term | Meaning |
| ---- | ------- |
| **Source review** | Human reading of repository code (may be stale relative to HEAD). |
| **Vulnerability audit** | Time-bounded engagement that produces a security verdict against a fixed commit and deployment. |
| **Source verification** | Explorer/build proof that on-chain bytecode matches reviewed source. |
| **Deployment evidence** | Record of addresses, txs, roles, compiler pins, and activation approvals. |

An informal emailed repository review is **documentation support**, not a vulnerability audit or security verdict. See [`docs/review-findings.md`](docs/review-findings.md) and the stale-review caveat in [`docs/security/AUDIT_SCOPE.md`](docs/security/AUDIT_SCOPE.md).
