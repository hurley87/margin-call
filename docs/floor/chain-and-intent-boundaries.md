# Chain and intent boundaries — The Floor (#249)

> **Parent:** [#247](https://github.com/hurley87/margin-call/issues/247) · **Depends on:** [#248](https://github.com/hurley87/margin-call/issues/248) · **Next:** [#250](https://github.com/hurley87/margin-call/issues/250)

This document is the handoff from the expand-phase chain/intent boundary (#249) to Trader TBA work (#250) and later Floor slices.

## Active network

| Field        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Default slug | `robinhood-testnet`                                          |
| Env          | `MARGIN_CALL_NETWORK` (or `NEXT_PUBLIC_MARGIN_CALL_NETWORK`) |
| Supported    | `robinhood-testnet`, `base-sepolia` (legacy)                 |
| Forbidden    | Base mainnet `8453`, Robinhood mainnet `4663`                |

Canonical registry: [`convex/lib/networks/`](../../convex/lib/networks/index.ts)  
Dependency packet: [`docs/floor/robinhood-testnet-dependency-packet.md`](./robinhood-testnet-dependency-packet.md)

```bash
# Fail closed — no silent public RPC fallback
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
MARGIN_CALL_NETWORK=robinhood-testnet   # default when unset
```

Legacy deal-game paths still pin `base-sepolia` explicitly (escrow, SeatVault, MCP treasury). They are removed at [#262](https://github.com/hurley87/margin-call/issues/262).

## What resolves through the registry

- Chain ID, CAIP-2, viem `Chain`
- RPC env keys (`requireRpcUrl(slug)`)
- Explorer URLs (`txUrl` / `addressUrl` / `blockUrl`)
- Confirmation policy (`recommendWaitBlocks`)
- Asset labels (`assetLabel` / `isTestAsset`) — Test Asset fallbacks must include **"Margin Call Test Asset"**

## Chain intents

Table: `chainIntents` in [`convex/schema.ts`](../../convex/schema.ts)

Statuses: `prepared → signing → submitted → confirmed | failed | reconciling → abandoned`

- One stable `intentKey` per logical write. Re-prepare never mints a second identity — including after `failed` / `abandoned`. A new logical write needs a new key.
- Ambiguous submissions move to `reconciling` and are resolved by **transaction identity** (`txHash`, then sender nonce) — **never** by re-signing or resubmitting.
- MCP treasury prepare/confirm is a facade over `chainIntents` ([`convex/mcp/intents.ts`](../../convex/mcp/intents.ts)).
- Cron: `chain-intents-reconcile-stuck` every 1 minute.

## UI labelling

- [`NetworkBadge`](../../src/components/shared/network-badge.tsx) — visible testnet / legacy badge
- [`TestAssetLabel`](../../src/components/shared/test-asset-label.tsx) — Margin Call Test Asset copy
- [`NetworkGuard`](../../src/components/providers/network-guard.tsx) — wrong-chain banner

## Handoff to #250

#250 may deploy Trader NFT + ERC-6551 account implementation on Robinhood Chain testnet. It must:

1. Resolve chain/RPC/explorer/confirmation via `convex/lib/networks`.
2. Record the deployed TBA account implementation address in a Floor deployment packet (not assume Base Sepolia bytecode).
3. Use `chainIntents` for any sponsored/signed create/claim writes.
4. Keep Test Asset labels visible wherever mock USDG / stock tokens appear.
5. Refuse Robinhood mainnet `4663`.
