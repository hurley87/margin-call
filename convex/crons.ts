import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Crash keeper: expire → reveal → attest/finalize → pre-open.
 * No-ops when credentials are missing or there is no work.
 */
crons.interval("crash-keeper", { seconds: 20 }, internal.keeperTick.run, {});

export default crons;
