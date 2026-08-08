import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Purge expired SIWA nonces every hour.
 * Nonces have a short TTL (default 5 min); this is a safety net for any
 * that were issued but never consumed (e.g. abandoned auth flows).
 */
crons.interval(
  "purge expired siwa nonces",
  { hours: 1 },
  internal.siwaNonces.cleanup,
  {}
);

export default crons;
