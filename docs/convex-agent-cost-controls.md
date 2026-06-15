# Convex Agent Cost Controls

> **Status: Implemented (shipped).** The scheduler exits early when the NYSE-style market window is closed (see `convex/agent/scheduler.ts` and the `isMarketOpen` gate). The reduction figures below describe the shipped behavior.

## Expected Reduction

Before this change, the Convex cron woke the agent scheduler every minute and the scheduler queried for stale traders regardless of market state. Active funded traders were eligible roughly every 10 minutes, including nights and weekends unless the downstream cycle stamped itself idle.

The scheduler now exits before the stale-trader query when the NYSE-style market window is closed: Monday-Friday, 9:30 AM-4:00 PM ET. That reduces normal scheduler fanout from 24/7 to 32.5 market hours per week, about 19% of the previous always-on window. Put another way, routine cycle scheduling work should drop by about 81% outside recovery/resume paths.

During market hours, each heartbeat enqueues at most 5 trader cycles. Eligible trader lookup now starts from the `status + walletStatus` index instead of all active traders, then filters funding, leases, and cycle spacing in memory. Cycle balance sync also skips the Convex write when the on-chain balance matches the cached value.

## Preserved Behavior

- Traders still must be active, wallet-ready, funded, and lease-free before scheduled cycles run.
- The cycle action still has its defensive active/wallet/funded guard.
- Cycle leases, generation checks, outcome idempotency, approval gating, and deal-entry accounting are unchanged.
- Real cycle errors still write activity log rows.
- Direct resume-triggered cycle behavior remains separate from the cron scheduler.

## Remaining Hotspots

- The one-minute Convex cron still invokes the scheduler action while the market is closed; the action now returns quickly, but the cron invocation itself remains.
- `selectDeal` can still perform multiple Convex reads and, when enabled, an OpenAI call for each enqueued cycle.
- Open-market cycles still read on-chain escrow balance before selection.
- Desk activity feed reads still query once per owned trader. Each per-trader read is bounded now, but very large desks can still fan out multiple subscription reads.
- Recovery of orphaned deal entries is still handled inside the cycle action, not by the off-hours scheduler.

## Dashboard Validation

After deploy, compare Convex dashboard metrics for a weekday overnight/weekend window against a market-hours window:

- Function calls for `agent/scheduler:scheduler` should remain one per minute, but duration/read counts should be minimal off-hours.
- Calls to `agent/internal:listStaleTradersForCycle` should drop to zero off-hours.
- Calls to `agent/cycle:cycle`, `agentActivityLog:append`, and deal-selection related functions should occur only during market hours unless a user action directly resumes a trader.
- Table bandwidth/read counts for `traders` and `agentActivityLog` should decline versus the previous 24/7 cycling pattern.
