/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("keeper alerts + sponsorship", () => {
  it("records alerts and dedupes fingerprints within the window", async () => {
    const t = convexTest(schema, modules);
    const observedAt = 1_700_000_000_000;

    const first = await t.mutation(internal.keeperAlerts.recordAlerts, {
      observedAt,
      alerts: [
        {
          kind: "stale_preopen",
          severity: "critical",
          message: "Active session but epoch uninitialized",
          roundId: "10",
          fingerprint: "stale_preopen:10",
        },
      ],
    });
    expect(first).toBe(1);

    const dup = await t.mutation(internal.keeperAlerts.recordAlerts, {
      observedAt: observedAt + 60_000,
      alerts: [
        {
          kind: "stale_preopen",
          severity: "critical",
          message: "Active session but epoch uninitialized",
          roundId: "10",
          fingerprint: "stale_preopen:10",
        },
      ],
    });
    expect(dup).toBe(0);

    const listed = await t.query(internal.keeperAlerts.listRecentAlerts, {
      since: observedAt - 1,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.kind).toBe("stale_preopen");
  });

  it("aggregates paymaster failure and spend samples for alerts", async () => {
    const t = convexTest(schema, modules);
    const now = 1_700_000_000_000;

    await t.mutation(internal.keeperSponsorship.reportSponsorshipEvent, {
      kind: "failure",
      observedAt: now - 1_000,
      detail: "policy rejected",
    });
    await t.mutation(internal.keeperSponsorship.reportSponsorshipEvent, {
      kind: "spend",
      observedAt: now - 500,
      amountWei: "1000",
    });
    await t.mutation(internal.keeperSponsorship.reportSponsorshipEvent, {
      kind: "spend",
      observedAt: now - 100,
      amountWei: "500",
    });

    const sample = await t.query(
      internal.keeperSponsorship.getSponsorshipWindowSample,
      {
        now,
        spendBudgetWei: "1200",
      }
    );

    expect(sample.failuresInWindow).toBe(1);
    expect(sample.spendWeiInWindow).toBe("1500");
    expect(sample.spendBudgetWei).toBe("1200");
  });

  it("records keeper runs without becoming settlement authority", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.keeperAlerts.recordRun, {
      startedAt: 1,
      finishedAt: 2,
      actionCount: 0,
      alertCount: 2,
      txHashes: [],
      skippedReason: "missing_credentials:KEEPER_PRIVATE_KEY",
      sessionActive: false,
    });
    expect(id).toBeTruthy();
  });
});
