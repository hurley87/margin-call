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

/** Index RipEngine / PackCustody pool state every minute. */
crons.interval(
  "sync pool from chain",
  { minutes: 1 },
  internal.poolIndexerActions.syncPoolFromChain,
  {}
);

export default crons;
