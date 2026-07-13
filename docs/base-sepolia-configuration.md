# Base Sepolia configuration

Margin Call runs on **Base Sepolia only** (chain ID `84532`). No mainnet configuration or transactions are authorized in this repository.

## Canonical sources

| File                                                                                                  | Purpose                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`convex/lib/baseSepoliaNetwork.ts`](../convex/lib/baseSepoliaNetwork.ts)                             | Environment-free chain identity: chain ID, CAIP-2, slug, Sepolia USDC, ERC-8004/6551 registries |
| [`contracts/deployments/base-sepolia.active.json`](../contracts/deployments/base-sepolia.active.json) | Source-controlled active deployment pointer (escrow, `$BLOW` token, SeatVault)                  |
| [`convex/lib/activeDeployment.ts`](../convex/lib/activeDeployment.ts)                                 | Typed TypeScript mirror of the active JSON (update both together)                               |
| [`convex/lib/requireBaseSepoliaRpcUrl.ts`](../convex/lib/requireBaseSepoliaRpcUrl.ts)                 | RPC URL resolver — fails closed if missing                                                      |
| [`convex/lib/resolveAddress.ts`](../convex/lib/resolveAddress.ts)                                     | Address resolver — env must match canonical or throw                                            |

Next.js re-exports these from [`src/lib/network/`](../src/lib/network/index.ts).

## Environment variables

**Required for financial/auth reads:**

- `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` — Next.js client and server
- `BASE_SEPOLIA_RPC_URL` — Convex (falls back to `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`)

**Optional address overrides (must match active record):**

- `NEXT_PUBLIC_ESCROW_ADDRESS` / `ESCROW_ADDRESS`
- `NEXT_PUBLIC_SEAT_VAULT_ADDRESS` / `SEAT_VAULT_ADDRESS` / `ACTIVE_SEAT_VAULT_ADDRESS`
- `NEXT_PUBLIC_MARGINCALL_TOKEN_ADDRESS` / `MARGINCALL_TOKEN_ADDRESS`
- `IDENTITY_REGISTRY_ADDRESS` (Convex wallet mint)

If unset, addresses resolve from `base-sepolia.active.json`. If set to a different value, startup fails with an actionable error.

## Activation procedure

Changing the active deployment requires human approval ([#211](https://github.com/hurley87/margin-call/issues/211)):

1. Deploy hardened contracts on Base Sepolia `84532` only.
2. Append to history files under `contracts/deployments/` (`base-sepolia.escrows.json`, `base-sepolia.margincall-tokens.json`, `base-sepolia.seat-vaults.json`).
3. Update `contracts/deployments/base-sepolia.active.json` and `convex/lib/activeDeployment.ts` together.
4. Update Convex/Vercel env vars to match (or remove them to use canonical defaults).
5. Sync `packages/mcp-server/base-plugin/margin-call.md` and run `pnpm test` (drift tests enforce alignment).

## Drift prevention

`src/lib/network/__tests__/base-sepolia-config.test.ts` asserts:

- Active TypeScript mirror matches `base-sepolia.active.json`
- MCP plugin markdown matches canonical chain slug, escrow, and USDC
- Mainnet chain `8453` and mainnet USDC are not reachable from active exports

## Explicitly prohibited

- Base mainnet chain `8453` in wallet `supportedChains`
- Mainnet USDC `0x833589…` in active transaction paths
- Silent RPC fallbacks to public endpoints without explicit configuration
