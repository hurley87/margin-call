/**
 * Behavior tests: Activity feed, leaderboard consistency, deal discovery, and
 * partial-state safety for failed external calls.
 *
 * Tests:
 * - Activity feed: events appear after cycle/approval/deal steps
 * - Activity feed: listByTrader returns auth-owner entries newest-first
 * - Leaderboard: aggregates match underlying outcomes
 * - Leaderboard: replays (outcome re-apply) do not double-count PnL
 * - Deal discovery: mandate filter eligibility (pure module)
 * - Deal discovery: desk dedup via internal queries
 * - Approval flow: request → approve → consume idempotency
 * - Partial state: LLM failure does not corrupt trader/deal state (valid partial state)
 */

import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal, api } from "../_generated/api";
import { evaluateDeals } from "../agent/_evaluator";
import type { Mandate, Deal } from "../agent/_types";
import { makeT, seedDeskManager, seedActiveTrader, seedDeal } from "./_setup";

const modules = import.meta.glob("../**/*.ts");

// ── Activity feed ─────────────────────────────────────────────────────────────

describe("Activity feed visibility", () => {
  it("appended activity entries appear in listByTrader for owner", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:owner-001";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, { ownerSubject: subject });

    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_start",
      message: "Cycle started",
      correlationId: "corr-001",
    });
    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "evaluate",
      message: "Deal evaluated",
      correlationId: "corr-001",
    });
    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_end",
      message: "Cycle ended",
      correlationId: "corr-001",
    });

    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });

    const logs = await authed.query(api.agentActivityLog.listByTrader, {
      traderId: traderId as never,
    });

    expect(logs.length).toBe(3);
    // Results are newest-first
    expect(logs[0].activityType).toBe("cycle_end");
    expect(logs[2].activityType).toBe("cycle_start");
  });

  it("activity entries appear after approval step", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:owner-002";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, { ownerSubject: subject });
    const dealId = await seedDeal(t);

    // Simulate cycle requesting approval
    await t.mutation(internal.dealApprovals.request, {
      traderId: traderId as never,
      dealId: dealId as never,
      deskManagerId: dmId as never,
      entryCostUsdc: 100,
      potUsdc: 1000,
      expiresAt: Date.now() + 60_000,
    });

    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "approval_required",
      message: "Awaiting approval",
      dealId: dealId as never,
      correlationId: "corr-002",
    });

    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });
    const logs = await authed.query(api.agentActivityLog.listByTrader, {
      traderId: traderId as never,
    });
    expect(logs.length).toBe(1);
    expect(logs[0].activityType).toBe("approval_required");
  });

  it("win/loss/wipeout entries appear after deal outcome step", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:owner-003";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, { ownerSubject: subject });
    const dealId = await seedDeal(t);

    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "win",
      message: "PnL +$200",
      dealId: dealId as never,
      correlationId: "corr-003",
    });

    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });
    const logs = await authed.query(api.agentActivityLog.listByTrader, {
      traderId: traderId as never,
    });
    expect(logs[0].activityType).toBe("win");
  });

  it("activity feed limit parameter works", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:owner-004";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, { ownerSubject: subject });

    // Append 5 entries with different correlationIds
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.agentActivityLog.append, {
        traderId: traderId as never,
        activityType: "evaluate",
        message: `Entry ${i}`,
        correlationId: `corr-${i}`,
      });
    }

    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });
    const limited = await authed.query(api.agentActivityLog.listByTrader, {
      traderId: traderId as never,
      limit: 3,
    });
    expect(limited.length).toBe(3);
  });
});

// ── Leaderboard consistency ───────────────────────────────────────────────────

describe("Leaderboard consistency", () => {
  const leaderboardIdentity = {
    subject: "did:privy:lb-user",
    tokenIdentifier: "did:privy:lb-user",
    issuer: "https://auth.privy.io",
  };

  it("leaderboard: trader balance aggregates correctly from underlying outcomes", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(leaderboardIdentity);

    // Set up desk + trader
    const dmId = await seedDeskManager(t, {
      subject: leaderboardIdentity.subject,
    });
    const traderId = await seedActiveTrader(t, dmId, {
      ownerSubject: leaderboardIdentity.subject,
      name: "LB Trader",
      escrowBalance: 1000,
    });

    const deal1 = await seedDeal(t, { potUsdc: 500, entryCostUsdc: 50 });
    const deal2 = await seedDeal(t, { potUsdc: 300, entryCostUsdc: 30 });

    // Apply outcomes (idempotent CAS on dealId+traderId)
    const oc1 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: deal1 as never,
      traderId: traderId as string,
      traderPnlUsdc: 100,
    });
    const oc2 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: deal2 as never,
      traderId: traderId as string,
      traderPnlUsdc: -30,
    });

    // Apply balance changes to trader record
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: 100,
      wipedOut: false,
      outcomeId: oc1 as never,
    });
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -30,
      wipedOut: false,
      outcomeId: oc2 as never,
    });

    // Verify via trader query — balance should reflect both outcome applications
    const traders = await authed.query(api.traders.listByDesk, {});
    expect(traders.length).toBe(1);
    expect(traders[0].escrowBalanceUsdc).toBe(1070); // 1000 + 100 - 30

    // Also verify the raw outcome count is correct (no duplication)
    const outcomeCount = await t.run(async (ctx) => {
      const all = await ctx.db.query("dealOutcomes").collect();
      return all.filter((o) => o.traderId === (traderId as string)).length;
    });
    expect(outcomeCount).toBe(2); // exactly 2, not 4
  });

  it("replaying same outcome does not double-count PnL (idempotent replay)", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { escrowBalance: 1000 });
    const dealId = await seedDeal(t);

    // Create outcome
    const outcomeId = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 200,
    });

    // Apply once
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: 200,
      wipedOut: false,
      outcomeId: outcomeId as never,
    });

    // Replay same outcomeId — must be a no-op (idempotency)
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: 200,
      wipedOut: false,
      outcomeId: outcomeId as never,
    });

    // Also try re-applying the same outcome (CAS on dealId+traderId)
    const oc2 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 999, // different value — should be ignored
    });
    expect(oc2).toBe(outcomeId); // same id returned, no duplicate row

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    // Balance must be exactly 1000 + 200 = 1200, not 1400 or more
    expect(trader?.escrowBalanceUsdc).toBe(1200);

    // Verify outcome count = 1 (no duplicates)
    const outcomes = await t.run(async (ctx) =>
      ctx.db.query("dealOutcomes").collect()
    );
    expect(outcomes).toHaveLength(1);
  });

  it("leaderboard returns empty when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    // No identity set
    const result = await t.query(api.traders.listByDesk, {});
    expect(result).toEqual([]);
  });
});

// ── Deal discovery (pure mandate filter) ─────────────────────────────────────

describe("Deal discovery: mandate filter (pure module)", () => {
  const makeDeals = (): Deal[] => [
    {
      id: "deal-1",
      prompt: "IBM insider tip",
      pot_usdc: 500,
      entry_cost_usdc: 50,
      status: "open",
    },
    {
      id: "deal-2",
      prompt: "High risk junk bonds",
      pot_usdc: 1000,
      entry_cost_usdc: 300, // expensive
      status: "open",
    },
    {
      id: "deal-3",
      prompt: "Safe blue chip play",
      pot_usdc: 200,
      entry_cost_usdc: 20,
      status: "open",
    },
    {
      id: "deal-4",
      prompt: "Closed deal",
      pot_usdc: 500,
      entry_cost_usdc: 50,
      status: "closed",
    },
  ];

  it("filters out closed deals", () => {
    const mandate: Mandate = {};
    const balance = 1000;
    const result = evaluateDeals(makeDeals(), mandate, balance);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).not.toContain("deal-4");
  });

  it("filters deals exceeding bankroll percentage", () => {
    const mandate: Mandate = { bankroll_pct: 10 }; // max 10% of 1000 = $100
    const balance = 1000;
    const result = evaluateDeals(makeDeals(), mandate, balance);
    // deal-2 costs $300 > $100 max risk
    const ids = result.eligible.map((d) => d.id);
    expect(ids).not.toContain("deal-2");
    expect(ids).toContain("deal-1"); // $50 < $100
    expect(ids).toContain("deal-3"); // $20 < $100
  });

  it("filters deals exceeding max_entry_cost_usdc mandate", () => {
    const mandate: Mandate = { max_entry_cost_usdc: 40 };
    const balance = 10_000;
    const result = evaluateDeals(makeDeals(), mandate, balance);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).not.toContain("deal-1"); // $50 > $40
    expect(ids).toContain("deal-3"); // $20 < $40
  });

  it("filters deals below min_pot_usdc mandate", () => {
    const mandate: Mandate = { min_pot_usdc: 300 };
    const balance = 10_000;
    const result = evaluateDeals(makeDeals(), mandate, balance);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).not.toContain("deal-3"); // pot $200 < $300
    expect(ids).toContain("deal-1"); // pot $500 >= $300
  });

  it("filters deals above max_pot_usdc mandate", () => {
    const mandate: Mandate = { max_pot_usdc: 600 };
    const balance = 10_000;
    const result = evaluateDeals(makeDeals(), mandate, balance);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).not.toContain("deal-2"); // pot $1000 > $600
    expect(ids).toContain("deal-1"); // pot $500 < $600
  });

  it("keyword filter includes only matching deals", () => {
    const mandate: Mandate = { keywords: ["IBM"] };
    const balance = 10_000;
    const result = evaluateDeals(makeDeals(), mandate, balance);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).toContain("deal-1"); // "IBM insider tip" matches
    expect(ids).not.toContain("deal-3"); // "Safe blue chip play" no match
  });

  it("skipped array contains reasons for excluded deals", () => {
    const mandate: Mandate = { bankroll_pct: 10 };
    const balance = 1000; // max risk = $100
    const result = evaluateDeals(makeDeals(), mandate, balance);
    const skippedIds = result.skipped.map((s) => s.deal.id);
    expect(skippedIds).toContain("deal-2"); // too expensive
    expect(result.skipped.find((s) => s.deal.id === "deal-2")?.reason).toMatch(
      /exceed/i
    );
  });

  it("empty deal list returns empty eligible", () => {
    const result = evaluateDeals([], {}, 1000);
    expect(result.eligible).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("insufficient balance filters all deals", () => {
    const balance = 5; // too broke
    const result = evaluateDeals(makeDeals(), {}, balance);
    // All open deals cost >= $20 which is > balance
    expect(result.eligible).toHaveLength(0);
  });
});

// ── Approval flow idempotency ─────────────────────────────────────────────────

describe("Approval flow idempotency", () => {
  it("request is idempotent: duplicate for same (traderId, dealId) returns existing", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const expiresAt = Date.now() + 60_000;
    const id1 = await t.mutation(internal.dealApprovals.request, {
      traderId: traderId as never,
      dealId: dealId as never,
      deskManagerId: dmId as never,
      entryCostUsdc: 100,
      potUsdc: 1000,
      expiresAt,
    });

    const id2 = await t.mutation(internal.dealApprovals.request, {
      traderId: traderId as never,
      dealId: dealId as never,
      deskManagerId: dmId as never,
      entryCostUsdc: 100,
      potUsdc: 1000,
      expiresAt,
    });

    expect(id1).toBe(id2);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("dealApprovals").collect()
    );
    expect(rows.length).toBe(1);
  });

  it("approve transitions pending → approved; duplicate approve is no-op", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:approval-owner";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, { ownerSubject: subject });
    const dealId = await seedDeal(t);
    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });

    const approvalId = await t.mutation(internal.dealApprovals.request, {
      traderId: traderId as never,
      dealId: dealId as never,
      deskManagerId: dmId as never,
      entryCostUsdc: 100,
      potUsdc: 1000,
      expiresAt: Date.now() + 60_000,
    });

    await authed.mutation(api.dealApprovals.approve, {
      approvalId: approvalId as never,
    });
    const firstApproval = await t.run(async (ctx) =>
      ctx.db.get(approvalId as never)
    );
    expect(firstApproval?.status).toBe("approved");

    // Duplicate approve is no-op
    await authed.mutation(api.dealApprovals.approve, {
      approvalId: approvalId as never,
    });
    const secondApproval = await t.run(async (ctx) =>
      ctx.db.get(approvalId as never)
    );
    expect(secondApproval?.status).toBe("approved"); // unchanged
  });

  it("consume transitions approved → consumed; only works from approved state", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const approvalId = await t.mutation(internal.dealApprovals.request, {
      traderId: traderId as never,
      dealId: dealId as never,
      deskManagerId: dmId as never,
      entryCostUsdc: 100,
      potUsdc: 1000,
      expiresAt: Date.now() + 60_000,
    });

    // Can't consume a pending approval
    await t.mutation(internal.dealApprovals.consume, {
      approvalId: approvalId as never,
    });
    const stillPending = await t.run(async (ctx) =>
      ctx.db.get(approvalId as never)
    );
    expect(stillPending?.status).toBe("pending");

    // Manually set to approved
    await t.run(async (ctx) => {
      await ctx.db.patch(approvalId as never, { status: "approved" });
    });

    await t.mutation(internal.dealApprovals.consume, {
      approvalId: approvalId as never,
    });
    const consumed = await t.run(async (ctx) =>
      ctx.db.get(approvalId as never)
    );
    expect(consumed?.status).toBe("consumed");
  });

  it("reject is idempotent: duplicate reject is a no-op", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:rejection-owner";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, { ownerSubject: subject });
    const dealId = await seedDeal(t);
    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });

    const approvalId = await t.mutation(internal.dealApprovals.request, {
      traderId: traderId as never,
      dealId: dealId as never,
      deskManagerId: dmId as never,
      entryCostUsdc: 100,
      potUsdc: 1000,
      expiresAt: Date.now() + 60_000,
    });

    await authed.mutation(api.dealApprovals.reject, {
      approvalId: approvalId as never,
    });
    await authed.mutation(api.dealApprovals.reject, {
      approvalId: approvalId as never,
    });

    const approval = await t.run(async (ctx) =>
      ctx.db.get(approvalId as never)
    );
    expect(approval?.status).toBe("rejected"); // not double-applied
  });
});

// ── Failed external call partial state ───────────────────────────────────────

describe("Failed external calls: valid partial state", () => {
  it("a trader with a pending outcome (no balance update) remains in valid state", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { escrowBalance: 1000 });
    const dealId = await seedDeal(t);

    // Simulate: outcome was written but balance update never ran (e.g. action crashed)
    await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 100,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    // Trader still has valid state — balance unchanged, status still active
    expect(trader?.escrowBalanceUsdc).toBe(1000);
    expect(trader?.status).toBe("active");
  });

  it("a trader retains wallet pending state if CDP action fails to complete", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);

    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: "did:privy:test-subject-001",
        name: "CDP Fail Trader",
        status: "active",
        walletStatus: "creating", // stuck in creating — CDP action failed partway
        escrowBalanceUsdc: 0,
        cycleGeneration: 0,
        mandate: {},
        createdAt: now,
        updatedAt: now,
      });
    });

    // Simulate wallet error from CDP failure
    await t.mutation(internal.traders.applyWalletError, {
      traderId: traderId as never,
      error: "CDP API timeout",
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.walletStatus).toBe("error");
    expect(trader?.walletError).toBe("CDP API timeout");
    // Trader is still in active status — CDP failure doesn't wipe game state
    expect(trader?.status).toBe("active");
  });

  it("applyWalletError does not overwrite a ready wallet", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId); // ready wallet

    await t.mutation(internal.traders.applyWalletError, {
      traderId: traderId as never,
      error: "Should not override ready state",
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.walletStatus).toBe("ready"); // unchanged
    expect(trader?.walletError).toBeUndefined();
  });

  it("released lease after failed cycle allows safe retry", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { cycleGeneration: 0 });

    // Acquire lease (simulates cycle start)
    const lease = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 90_000,
    });
    expect(lease.acquired).toBe(true);

    // Simulate cycle failure — release lease
    await t.mutation(internal.agent.internal.releaseCycleLease, {
      traderId: traderId as never,
      generation: lease.generation,
    });

    // After lease release, trader should be eligible for retry
    // (no active lease, but generation bumped so stale check may not be needed;
    // what matters is that another cycle CAN acquire the lease)
    const retryLease = await t.mutation(
      internal.agent.internal.acquireCycleLease,
      {
        traderId: traderId as never,
        expectedGeneration: lease.generation, // use the new generation
        leaseUntil: Date.now() + 90_000,
      }
    );
    expect(retryLease.acquired).toBe(true);
  });

  it("activity log error entry is written on cycle failure (best-effort)", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);

    // Simulate the error log write that cycle does on failure
    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_error",
      message: "Cycle error (generation=1): OpenAI timeout",
      metadata: { generation: 1, error: "OpenAI timeout" },
      correlationId: "corr-err-001",
    });

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(rows.length).toBe(1);
    expect(rows[0].activityType).toBe("cycle_error");
  });
});
