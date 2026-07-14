# Audit scope (Base Sepolia)

> **Network:** Base Sepolia only — chain ID `84532`.  
> **Authorization:** Documentation and testnet operations described here do **not** authorize Base mainnet (`8453`) deployment, configuration, or transactions.  
> No mainnet address or transaction in this repository is presented as active.

This file defines what a reviewer or auditor should treat as in scope for the current testnet security posture. Update the commit and deployment fields whenever the active pointer or reviewed tip changes.

## Review posture kinds (keep distinct)

| Kind                | What it proves                                                     | What it does not prove                           |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| Source review       | Someone read code at a point in time                               | That HEAD is safe, or that on-chain code matches |
| Vulnerability audit | A scoped engagement's findings against a fixed commit + deployment | Ongoing production safety after later commits    |
| Source verification | Bytecode at an address matches a build of reviewed source          | Economic safety or off-chain key hygiene         |
| Deployment evidence | Who deployed what, when, with which roles and pins                 | That ops or IR were exercised                    |

## Immutable anchors (fill / refresh at each review)

Update before citing this file as evidence for a review.

| Field                                   | Value                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Reviewed git commit                     | Refresh to the #211 activation commit after merge; tip at packet build was `5f52b9a97bf7c29c76d0622366d2a0a336625902` |
| Active deployment pointer               | [`contracts/deployments/base-sepolia.active.json`](../../contracts/deployments/base-sepolia.active.json)              |
| Chain ID                                | `84532`                                                                                                               |
| Active escrow                           | `0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03`                                                                          |
| Active `MarginCallToken` (`$BLOW` test) | `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7`                                                                          |
| Active SeatVault                        | `0xA901DFC8C46faF3A24F4002849dE98dFE9722C95`                                                                          |
| Active pointer `deployedAt`             | `2026-07-14T01:20:34.822Z`                                                                                            |
| Sepolia USDC (canonical)                | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`                                                                          |
| Identity registry (canonical)           | `0x8004A818BFB912233c491871b3d84c89A494BD9e`                                                                          |

History append-only lists (do not treat historical rows as active unless they match `base-sepolia.active.json`):

- [`contracts/deployments/base-sepolia.escrows.json`](../../contracts/deployments/base-sepolia.escrows.json)
- [`contracts/deployments/base-sepolia.margincall-tokens.json`](../../contracts/deployments/base-sepolia.margincall-tokens.json)
- [`contracts/deployments/base-sepolia.seat-vaults.json`](../../contracts/deployments/base-sepolia.seat-vaults.json)

Compiler and dependency pins for reproducible builds: [`contracts/REPRODUCIBILITY.md`](../../contracts/REPRODUCIBILITY.md).

Canonical app/network config: [`docs/base-sepolia-configuration.md`](../base-sepolia-configuration.md).

## In scope

### On-chain

- `contracts/src/MarginCallEscrow.sol` as deployed at the active escrow address
- `contracts/src/SeatVault.sol` as deployed at the active SeatVault address
- `contracts/src/MarginCallToken.sol` as deployed at the active token address (Sepolia `$BLOW` capacity token)
- Constructor arguments, role holders, pause state, and SeatVault policy parameters as recorded in deployment evidence ([evidence requirements](./evidence-requirements.md))

### Off-chain (money / auth adjacency)

- Operator-signed deal entry (`OPERATOR_PRIVATE_KEY` path)
- MCP prepare → Base Account `send_calls` → `confirm_intent` treasury flows
- Convex agent cycle enter / settle / refund paths that call the escrow
- Address and chain resolvers that must fail closed on non-Sepolia values
- Secret handling for operator, MCP HMAC / service token, CDP, Privy, Convex, and Vercel

### Documentation under review for ops correctness

- This directory (`docs/security/`)
- [`docs/base-sepolia-configuration.md`](../base-sepolia-configuration.md)

## Explicit exclusions

- Base mainnet (`8453`) contracts, USDC (`0x833589…`), wallets, or env profiles
- Bankr mainnet `$BLOW` launch and token economics
- Third-party ERC-8004 / ERC-6551 registry implementations (trust assumptions only; see [threat model](./threat-model.md))
- Frontend cosmetic / marketing pages with no financial path
- Historical deployment rows that are not the active pointer
- Wire narrative content generation (LLM storytelling) except where it gates a financial action
- Any future mainnet launch plan content ([placeholder plan](./base-mainnet-launch-plan.md) when present) — planning only

## Stale-review caveat

An emailed repository review that covered an older commit is useful as **documentation support** and as a checklist of themes ([`docs/review-findings.md`](../review-findings.md)). It is **not**:

- a vulnerability audit,
- a security verdict for HEAD,
- proof of source verification for the active deployment, or
- authorization to deploy or change environments.

Re-open or refresh any engagement that does not name the commit SHA and active deployment pointer in the table above.

## Forbidden presentations

- Listing Base mainnet addresses as “current” or “production”
- Implying informal review = audit complete
- Treating env overrides that disagree with `base-sepolia.active.json` as valid (they must fail closed — see base Sepolia configuration doc)
