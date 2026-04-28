/**
 * Pure-module tests: deal-selection evaluator + outcome resolver schemas
 *
 * These tests are runtime-agnostic and don't require the Convex test harness.
 * They test the pure functions directly with mocked inputs.
 *
 * Tests:
 * - evaluateDeals: mandate filter (comprehensive)
 * - DealEvaluationSchema: validates structured LLM output
 * - DealOutcomeSchema: validates structured outcome output
 */

import { describe, it, expect } from "vitest";
import { evaluateDeals } from "../agent/_evaluator";
import { DealEvaluationSchema, DealOutcomeSchema } from "../agent/_schemas";
import type { Deal, Mandate } from "../agent/_types";

// ── evaluateDeals: mandate filter ─────────────────────────────────────────────

describe("evaluateDeals: mandate filter (pure)", () => {
  const openDeal = (overrides: Partial<Deal> = {}): Deal => ({
    id: "d1",
    prompt: "Test deal",
    pot_usdc: 500,
    entry_cost_usdc: 50,
    status: "open",
    ...overrides,
  });

  it("passes all open deals when mandate is empty and balance is high", () => {
    const deals = [
      openDeal({ id: "d1" }),
      openDeal({ id: "d2", entry_cost_usdc: 100 }),
    ];
    const result = evaluateDeals(deals, {}, 10_000);
    expect(result.eligible).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips deal when entry cost exceeds balance (no bankroll limit)", () => {
    // bankroll_pct: 200 → maxRisk = 100 * 2 = 200, so bankroll check passes for entry=$200
    // But balance is $100, so the insufficient-balance check fires instead
    const result = evaluateDeals(
      [openDeal({ entry_cost_usdc: 200 })],
      { bankroll_pct: 200 },
      100
    );
    expect(result.eligible).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/insufficient balance/i);
  });

  it("bankroll_pct = 25 filters correctly at boundary", () => {
    const balance = 200;
    const maxRisk = 200 * 0.25; // = 50
    const deals = [
      openDeal({ id: "ok", entry_cost_usdc: 50 }), // exactly at limit
      openDeal({ id: "too-much", entry_cost_usdc: 51 }), // over by $1
    ];
    const result = evaluateDeals(deals, { bankroll_pct: 25 }, balance);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).toContain("ok");
    expect(ids).not.toContain("too-much");
  });

  it("default bankroll_pct = 25 when not set", () => {
    const balance = 100;
    // Default 25% of 100 = 25; deal costing 30 should be skipped
    const deal = openDeal({ entry_cost_usdc: 30 });
    const result = evaluateDeals([deal], {}, balance);
    expect(result.eligible).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/bankroll/i);
  });

  it("max_entry_cost_usdc mandate overrides balance-based limit", () => {
    const balance = 10_000;
    const mandate: Mandate = { max_entry_cost_usdc: 100 };
    const deals = [
      openDeal({ id: "ok", entry_cost_usdc: 100 }), // at limit
      openDeal({ id: "over", entry_cost_usdc: 101 }), // over
    ];
    const result = evaluateDeals(deals, mandate, balance);
    expect(result.eligible.map((d) => d.id)).toContain("ok");
    expect(result.eligible.map((d) => d.id)).not.toContain("over");
  });

  it("min_pot_usdc mandate filters low-pot deals", () => {
    const mandate: Mandate = { min_pot_usdc: 200 };
    const deals = [
      openDeal({ id: "too-small", pot_usdc: 150, entry_cost_usdc: 10 }),
      openDeal({ id: "ok", pot_usdc: 200, entry_cost_usdc: 10 }),
    ];
    const result = evaluateDeals(deals, mandate, 10_000);
    expect(result.eligible.map((d) => d.id)).toEqual(["ok"]);
    expect(result.skipped[0].reason).toMatch(/pot/i);
  });

  it("max_pot_usdc mandate filters high-pot deals", () => {
    const mandate: Mandate = { max_pot_usdc: 1000 };
    const deals = [
      openDeal({ id: "ok", pot_usdc: 1000 }),
      openDeal({ id: "too-big", pot_usdc: 1001 }),
    ];
    const result = evaluateDeals(deals, mandate, 10_000);
    expect(result.eligible.map((d) => d.id)).toEqual(["ok"]);
  });

  it("keywords filter: case-insensitive match on prompt", () => {
    const mandate: Mandate = { keywords: ["IBM", "AAPL"] };
    const deals = [
      openDeal({ id: "match-ibm", prompt: "Trade ibm options today" }),
      openDeal({ id: "match-aapl", prompt: "AAPL earnings play" }),
      openDeal({ id: "no-match", prompt: "Random deal" }),
    ];
    const result = evaluateDeals(deals, mandate, 10_000);
    const ids = result.eligible.map((d) => d.id);
    expect(ids).toContain("match-ibm");
    expect(ids).toContain("match-aapl");
    expect(ids).not.toContain("no-match");
  });

  it("non-open deals are always skipped", () => {
    const deals = [
      openDeal({ id: "open" }),
      openDeal({ id: "closed", status: "closed" }),
      openDeal({ id: "depleted", status: "depleted" }),
    ];
    const result = evaluateDeals(deals, {}, 10_000);
    expect(result.eligible.map((d) => d.id)).toEqual(["open"]);
  });
});

// ── DealEvaluationSchema: LLM structured output ───────────────────────────────

describe("DealEvaluationSchema: validates LLM rank output", () => {
  it("accepts valid rank output", () => {
    const payload = {
      ranked_deal_ids: ["deal-1", "deal-2"],
      skip_all: false,
      reasoning: "Deal 1 has the best risk/reward ratio.",
    };
    const result = DealEvaluationSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts skip_all = true with empty ranked ids", () => {
    const payload = {
      ranked_deal_ids: [],
      skip_all: true,
      reasoning: "No deals meet the risk criteria.",
    };
    const result = DealEvaluationSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects missing reasoning", () => {
    const payload = {
      ranked_deal_ids: ["deal-1"],
      skip_all: false,
      // reasoning missing
    };
    const result = DealEvaluationSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects ranked_deal_ids exceeding 30 items", () => {
    const ids = Array.from({ length: 31 }, (_, i) => `deal-${i}`);
    const payload = {
      ranked_deal_ids: ids,
      skip_all: false,
      reasoning: "Too many deals.",
    };
    const result = DealEvaluationSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects reasoning exceeding 2000 characters", () => {
    const payload = {
      ranked_deal_ids: [],
      skip_all: true,
      reasoning: "x".repeat(2001),
    };
    const result = DealEvaluationSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// ── DealOutcomeSchema: outcome resolver structured output ─────────────────────

describe("DealOutcomeSchema: validates outcome resolver output", () => {
  it("accepts a valid win outcome", () => {
    const payload = {
      narrative: "The trader made a killing on IBM.",
      balance_change_usdc: 150,
      assets_gained: [{ name: "IBM shares", value_usdc: 200 }],
      assets_lost: [],
      trader_wiped_out: false,
      wipeout_reason: null,
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts a valid loss outcome", () => {
    const payload = {
      narrative: "The deal went south.",
      balance_change_usdc: -50,
      assets_gained: [],
      assets_lost: ["Rolex watch"],
      trader_wiped_out: false,
      wipeout_reason: null,
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts a valid wipeout outcome", () => {
    const payload = {
      narrative: "The SEC came knocking.",
      balance_change_usdc: -1000,
      assets_gained: [],
      assets_lost: [],
      trader_wiped_out: true,
      wipeout_reason: "sec_bust",
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid wipeout_reason enum value", () => {
    const payload = {
      narrative: "Bad reason.",
      balance_change_usdc: -500,
      assets_gained: [],
      assets_lost: [],
      trader_wiped_out: true,
      wipeout_reason: "alien_abduction", // not in enum
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const payload = {
      balance_change_usdc: 100,
      // Missing: narrative, assets_gained, assets_lost, trader_wiped_out, wipeout_reason
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("accepts assets_gained with correct shape", () => {
    const payload = {
      narrative: "Won a watch.",
      balance_change_usdc: 0,
      assets_gained: [
        { name: "Rolex", value_usdc: 5000 },
        { name: "Yacht", value_usdc: 50000 },
      ],
      assets_lost: [],
      trader_wiped_out: false,
      wipeout_reason: null,
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects assets_gained with wrong shape", () => {
    const payload = {
      narrative: "Broken shape.",
      balance_change_usdc: 0,
      assets_gained: [{ wrong_key: "Rolex" }], // missing name, value_usdc
      assets_lost: [],
      trader_wiped_out: false,
      wipeout_reason: null,
    };
    const result = DealOutcomeSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
