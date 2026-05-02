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
 * Agent scheduler cron — fires every 1 minute (Convex minimum; PRD target is
 * 30 s but the platform constraint is 1 m on most plans).
 *
 * Calls internal.agent.scheduler which queries stale active traders and fans
 * out one cycle action per trader via ctx.scheduler.runAfter(0, ...).
 */
crons.interval(
  "agent-scheduler",
  { minutes: 1 },
  internal.agent.scheduler.scheduler
);

/**
 * Market Wire narrative generation — every 5 minutes.
 *
 * Replaces the Vercel Cron entry that hit /api/narrative/generate (removed).
 * Idempotent per epoch so concurrent runs are safe.
 */
crons.interval(
  "generate-narrative",
  { minutes: 5 },
  internal.narrative.generate,
  {}
);

export default crons;
