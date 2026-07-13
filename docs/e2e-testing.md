# End-to-end and security-matrix test gating

This document covers how Margin Call runs contract, Convex, and live Sepolia
checks for the escrow / SeatVault security matrix ([#207](https://github.com/hurley87/margin-call/issues/207)).

**Safety boundary:** local mocks, a Base Sepolia fork, or faucet/testnet funds
only. Never Base mainnet and never real funds.

## What CI runs (no live secrets)

| Suite                                       | Command                  | Notes                           |
| ------------------------------------------- | ------------------------ | ------------------------------- |
| Lint / typecheck / codegen                  | `pnpm check:ci`          | Always                          |
| Vitest (Convex + src)                       | `pnpm test`              | Always; uses fixtures / mocks   |
| Foundry unit + fuzz + invariant + local E2E | `pnpm test:contracts:ci` | Always; excludes `test/fork/**` |

## Optional CI / local: Base Sepolia fork

| Suite                 | Command                    | Gate                            |
| --------------------- | -------------------------- | ------------------------------- |
| Fork read-only checks | `pnpm test:contracts:fork` | Requires `BASE_SEPOLIA_RPC_URL` |

Pinned block and canonical `84532` addresses live in
`contracts/test/helpers/BaseSepoliaConstants.sol` (aligned with
`contracts/deployments/base-sepolia.active.json`).

Fork tests call `vm.skip(true)` when the RPC env var is missing.

## Manual: MCP Sepolia smoke

Script: `tests/e2e/mcp-sepolia.ts` — **not** included in Vitest or CI.

### Prepare-only (default)

```bash
MARGIN_CALL_MCP_KEY=mc_live_... \
MARGIN_CALL_API_URL=http://localhost:3000 \
pnpm tsx tests/e2e/mcp-sepolia.ts
```

Exercises reads, `create_trader` idempotency, and treasury **prepare** envelopes.
Does not send on-chain txs.

### Full prepare → send_calls → confirm → state

```bash
MARGIN_CALL_MCP_KEY=mc_live_... \
MARGIN_CALL_API_URL=http://localhost:3000 \
MCP_E2E_CONFIRM=1 \
# optional: skip the interactive paste
# MCP_E2E_TX_HASH=0x... \
pnpm tsx tests/e2e/mcp-sepolia.ts
```

Requires a funded Base Account (Sepolia USDC), Base MCP connected, and human
approval for `send_calls`. Soft-skips when desk balance is zero or markets are
closed.

## Secret matrix

| Variable                                           | Required for                      | CI?                             |
| -------------------------------------------------- | --------------------------------- | ------------------------------- |
| _(none)_                                           | Vitest / Foundry non-fork         | Yes — default                   |
| `BASE_SEPOLIA_RPC_URL`                             | Foundry fork suite                | Optional secret                 |
| `MARGIN_CALL_MCP_KEY`                              | MCP smoke                         | Manual only                     |
| `MARGIN_CALL_API_URL`                              | MCP smoke target                  | Manual (default localhost:3000) |
| `MARGIN_CALL_DESK_WALLET`                          | Bind wallet if desk unbound       | Manual                          |
| `MCP_E2E_CONFIRM=1`                                | Live confirm path                 | Manual only                     |
| `MCP_E2E_TX_HASH`                                  | Non-interactive confirm           | Manual optional                 |
| `OPERATOR_PRIVATE_KEY` / CDP / `MCP_SERVICE_TOKEN` | Full agent entry / deployed stack | Runtime; not in this smoke      |

## Related local commands

```bash
pnpm test                  # Vitest
pnpm test:contracts        # Foundry (default fuzz runs; no fork)
pnpm test:contracts:ci     # Foundry leaner CI profile; no fork
pnpm test:contracts:fork   # Foundry fork only (needs RPC)
```
