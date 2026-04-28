/**
 * Shared test helpers for Convex behavior tests.
 *
 * convex-test provides an in-memory Convex backend; we pass our schema and
 * a glob of all Convex module files so it can execute functions end-to-end.
 */
import { convexTest } from "convex-test";
import schema from "../schema";

// Module glob — must be called from within the convex directory tree.
// We use a relative glob evaluated at runtime by Vite/Vitest.
const modules = import.meta.glob("../**/*.ts");

export function makeT() {
  return convexTest(schema, modules);
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

import type { TestConvex } from "convex-test";
import type { DataModelFromSchemaDefinition } from "convex/server";
import type schema_ from "../schema";

type T = TestConvex<typeof schema_>;

/** Insert a desk manager and return its _id. */
export async function seedDeskManager(
  t: T,
  opts: { subject?: string; walletAddress?: string } = {}
) {
  const subject = opts.subject ?? "did:privy:test-subject-001";
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("deskManagers", {
      subject,
      walletAddress: opts.walletAddress ?? "0xabc123",
      displayName: "Test Manager",
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** Insert an active trader with walletStatus=ready and return its _id. */
export async function seedActiveTrader(
  t: T,
  deskManagerId: string,
  opts: {
    name?: string;
    ownerSubject?: string;
    escrowBalance?: number;
    lastCycleAt?: number;
    cycleLeaseUntil?: number;
    cycleGeneration?: number;
    mandate?: Record<string, unknown>;
  } = {}
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("traders", {
      deskManagerId: deskManagerId as never,
      ownerSubject: opts.ownerSubject ?? "did:privy:test-subject-001",
      name: opts.name ?? "Alpha Trader",
      status: "active",
      walletStatus: "ready",
      escrowBalanceUsdc: opts.escrowBalance ?? 1000,
      lastCycleAt: opts.lastCycleAt,
      cycleLeaseUntil: opts.cycleLeaseUntil,
      cycleGeneration: opts.cycleGeneration ?? 0,
      mandate: opts.mandate ?? {},
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** Insert an open deal and return its _id. */
export async function seedDeal(
  t: T,
  opts: {
    prompt?: string;
    potUsdc?: number;
    entryCostUsdc?: number;
    status?: "open" | "closed" | "depleted";
  } = {}
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("deals", {
      prompt: opts.prompt ?? "Buy low, sell high on IBM",
      potUsdc: opts.potUsdc ?? 500,
      entryCostUsdc: opts.entryCostUsdc ?? 50,
      status: opts.status ?? "open",
      creatorType: "desk_manager",
      createdAt: now,
      updatedAt: now,
    });
  });
}
