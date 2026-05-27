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
 * Without this sweep an unanswered pending row would block the trader cycle
 * (see `findPendingByTraderAndDeal` in convex/dealApprovals.ts) indefinitely —
 * the trader would keep selecting the same deal and stalling out. Running
 * every 5 minutes keeps Claude's approval loop honest while staying well
 * inside the agent scheduler's per-minute heartbeat.
 */
crons.interval(
  "mcp-approvals-auto-reject-expired",
  { minutes: 5 },
  internal.mcp.approvals.autoRejectExpiredAction,
  {}
);

export default crons;
