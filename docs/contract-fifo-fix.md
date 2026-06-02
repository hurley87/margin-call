# Margin Call escrow: remove FIFO ordering from `resolveEntry`

This is the Wall Street Agent Trading Game (`/Users/davidhurley/Desktop/margin-call`). Players fund AI traders that autonomously enter on-chain deals. Funds and pending entries are held by `MarginCallEscrow.sol` on Base Sepolia at `0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609`. The off-chain orchestrator (Convex `convex/agent/cycle.ts`) runs one cycle per trader, where each cycle independently calls `enterDeal` then later `resolveEntry`.

## The bug

`contracts/src/MarginCallEscrow.sol:160-186` requires that `resolveEntry` only resolves the trader at the head of a per-deal FIFO queue:

```solidity
require(queue.length > 0 && queue[0] == traderId, "Trader mismatch");
```

This invariant has no safety justification — entry costs are debited at `enterDeal`, payouts are bounded by `potAmount`, and PnL is per-trader. The queue just couples independent agents. When two traders enter the same deal and the second one's LLM resolves first, the on-chain call reverts. Symptom in production logs:

```
Cycle error: The contract function "resolveEntry" reverted with the following reason: Trader mismatch
```

There's already an off-chain workaround that catches this revert (`convex/agent/cycle.ts` — `resolveOnChainEntry` returns `{ status: "queue_not_head" }`, the cycle persists the outcome and retries on the next tick via `dealOutcomes.findUnresolvedOnChain`). That works but introduces resolution latency and head-of-line blocking if any trader gets permanently stuck.

## The fix

Replace the FIFO queue with a per-`(dealId, traderId)` boolean. Concretely in `contracts/src/MarginCallEscrow.sol`:

1. Remove the storage field `mapping(uint256 => uint256[]) private _pendingTraderIds;` (line ~40) and replace with `mapping(uint256 => mapping(uint256 => bool)) private _pendingEntry;`.
2. In `enterDeal` (line ~146): replace the `_pendingTraderIds[dealId].push(traderId)` line with `_pendingEntry[dealId][traderId] = true`. Optionally add `require(!_pendingEntry[dealId][traderId], "Already entered")` if same-trader-same-deal dedup is desired (check the game design — `docs/wall-street-agent-game.md` — before adding).
3. In `resolveEntry` (line ~160): replace the queue check and the swap-pop block with `require(_pendingEntry[dealId][traderId], "No pending entry"); _pendingEntry[dealId][traderId] = false;`. Keep `pendingEntries--` and the payout math unchanged.
4. Update tests in `contracts/test/MarginCallEscrow.t.sol` — the "Trader mismatch" expectation at line 394 needs to flip to "No pending entry" and a new test should cover out-of-order resolution working.

## Off-chain cleanup after the contract redeploys

Once the new contract is live:

- In `convex/agent/cycle.ts`, the `queue_not_head` branch of `resolveOnChainEntry` becomes dead code. Either remove it and revert to `Promise<{ status: "resolved", txHash } | { status: "already_resolved" }>`, or leave the catch as a defense-in-depth no-op.
- The early on-chain retry path (section 3c in `cycle.ts`) is still useful for crash recovery — keep it.
- `convex/dealOutcomes.ts` — `findUnresolvedOnChain` and `markOnChainResolved` stay useful for the same reason; don't remove them.

## Deployment / migration

The contract has no built-in migration path. Plan:

1. Deploy the new escrow at a new address on Base Sepolia (testnet first).
2. Before cutover: pause new deal creation in the off-chain layer, drain pending entries from the old contract (let in-flight cycles complete), and have every depositor `withdraw()` their trader balances.
3. Update `ESCROW_ADDRESS` constants — they live in `convex/agent/cycle.ts:18`, `src/lib/contracts/escrow.ts:7`, and anywhere else `grep -rn "0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609"` finds them.
4. Run `addOperator` on the new contract for the operator key (`OPERATOR_PRIVATE_KEY` env).
5. Re-fund traders via `depositFor` and re-create deals that were live.

If you're still pre-mainnet, just redeploy on Sepolia and start fresh — the migration steps above mostly don't apply.

## Verification

After the change:

- `forge test` in `contracts/` passes, including a new test that resolves entries out of order on the same deal.
- `pnpm exec vitest run tests/convex/cycle-idempotency.test.ts` still passes.
- `pnpm lint` clean.
- Manual: enter the same deal from two traders, resolve the second one first — should succeed on-chain.
