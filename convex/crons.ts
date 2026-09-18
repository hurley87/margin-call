import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Low-frequency Base reconciliation — not the primary UX path. */
crons.interval(
  "reconcile MarginCall positions",
  { minutes: 10 },
  internal.sync.reconcile,
  {}
);

export default crons;
