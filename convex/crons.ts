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
 * Wire Drop generator — fires every hour at :05 ET.
 * The trading-hours guard inside the action (Mon–Fri 09:30–16:00 ET) gates
 * whether a drop is actually written; the cron just provides the trigger.
 */
crons.hourly(
  "wire-epoch-generator",
  { minuteUTC: 5 },
  internal.wire.generator.generateNextEpoch,
  {}
);

export default crons;
