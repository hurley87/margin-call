import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Purge expired SIWA nonces every hour.
 * Nonces have a short TTL (default 5 min); this is a safety net for any
 * that were issued but never consumed (e.g. abandoned auth flows).
 */
crons.hourly(
  "purge expired siwa nonces",
  { minuteUTC: 0 },
  internal.siwaNonces.cleanup,
  {}
);

/**
 * Agent scheduler heartbeat — fires every 1 minute (Convex minimum; PRD target is
 * 30 s but the platform constraint is 1 m on most plans).
 *
 * This is only a heartbeat: each trader becomes eligible on their own interval
 * (see resolveCycleIntervalMsForTrader / listStaleTradersForCycle), not once per cron tick.
 *
 * Calls internal.agent.scheduler which queries eligible active traders and fans
 * out one cycle action per trader via ctx.scheduler.runAfter(0, ...).
 */
crons.interval(
  "agent-scheduler",
  { minutes: 1 },
  internal.agent.scheduler.scheduler
);

/**
 * Token price poller — fires every hour at :20 UTC, 10 minutes before the wire
 * generator, so a fresh snapshot exists when the wire runs. Deliberately NOT
 * gated to market hours: these companies trade around the clock, so overnight
 * and weekend moves are captured here and reported at the next open. See
 * convex/wire/pricePoll.ts.
 */
crons.hourly(
  "token-price-poll",
  { minuteUTC: 20 },
  internal.wire.pricePoll.pollPrices,
  {}
);

/**
 * Wire Drop generator — fires every hour at :30 UTC.
 * In EDT (UTC-4) this lands at 9:30 ET for the 13:00 UTC hour — exactly at
 * market open. In EST (UTC-5) the 13:30 UTC fire is 8:30 ET (before open,
 * skipped by isMarketOpen) and the 14:30 UTC fire is 9:30 ET — also at open.
 * The trading-hours guard inside the action (Mon–Fri 09:30–16:00 ET) gates
 * whether a drop is actually written; the cron just provides the trigger.
 */
crons.hourly(
  "wire-epoch-generator",
  { minuteUTC: 30 },
  internal.wire.generator.generateNextEpoch,
  {}
);

/**
 * Auto-reject MCP high-stakes deal approvals that have passed their TTL.
 * Unanswered pending rows would otherwise block the trader cycle
 * (see `findPendingByTraderAndDeal` in convex/dealApprovals.ts).
 */
crons.interval(
  "mcp-approvals-auto-reject-expired",
  { minutes: 5 },
  internal.mcp.approvals.autoRejectExpired,
  {}
);

/**
 * Age out abandoned MCP intent envelopes (prepare → Base MCP → confirm flow).
 * If the agent never broadcasts the prepared calls before expiresAt, the row
 * sits as `pending` forever. Marking it `expired` keeps the table bounded
 * while preserving the audit trail. See convex/mcp/intents.ts.
 */
crons.interval(
  "mcp-intents-expire-pending",
  { minutes: 15 },
  internal.mcp.intents.expirePending,
  {}
);

/**
 * Reconcile orphaned deal-entry reservations. If a process dies between the
 * on-chain `enterDeal` and the Convex `recordVerifiedEntry`, the contract keeps
 * the entry in its `pendingEntries` count (blocking the creator from closing
 * the deal) while Convex holds only a stale `pending:` row that never gets an
 * outcome — so the cycle's settlement-retry never fires for it. This sweep
 * refund-settles any such on-chain pending entry and clears the stale row.
 * See convex/agent/reconcileEntries.ts.
 */
crons.interval(
  "reconcile-orphan-deal-entries",
  { minutes: 10 },
  internal.agent.reconcileEntries.reconcileOrphanEntries,
  {}
);

/**
 * Reconcile stuck *verified* deal entries. A verified entry whose outcome was
 * voided with a `reconciled:*` sentinel because `resolveOnChainEntry` read a
 * stale `pendingEntries === 0` never had `resolveEntry` called — the trader's
 * entry stays pending on-chain, blocking the creator from closing. Neither the
 * orphan sweep (only `pending:` rows) nor the cycle §3c retry (skips outcomes
 * with any `onChainTxHash`) recovers it. This sweep re-checks the contract and
 * settles any genuinely-pending entry break-even. See
 * convex/agent/reconcileEntries.ts.
 */
crons.interval(
  "reconcile-stuck-verified-entries",
  { minutes: 10 },
  internal.agent.reconcileEntries.reconcileStuckVerifiedEntries,
  {}
);

/**
 * SeatVault indexer — ingest confirmed Staked / UnstakeInitiated / Unstaked
 * logs and reconcile traderSeatState against authoritative stakeOf/tierOf.
 * Failures fail closed to Gallery and update sync cursor error state.
 * See convex/seatVault/indexer.ts.
 */
crons.interval(
  "seat-vault-indexer",
  { minutes: 2 },
  internal.seatVault.indexer.tick,
  {}
);

export default crons;
