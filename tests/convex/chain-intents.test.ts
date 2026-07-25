import { describe, expect, it } from "vitest";
import {
  LEGAL_TRANSITIONS,
  assertTransition,
  canTransition,
  isReusableStatus,
  isTerminalStatus,
} from "../../convex/lib/chainIntents/stateMachine";
import { makeT, seedDeskManager } from "./setup";
import { internal } from "../../convex/_generated/api";
import { ROBINHOOD_TESTNET_SLUG } from "../../convex/lib/networks";

describe("chain intent state machine", () => {
  it("allows the happy path prepare → signing → submitted → confirmed", () => {
    expect(canTransition("prepared", "signing")).toBe(true);
    expect(canTransition("signing", "submitted")).toBe(true);
    expect(canTransition("submitted", "confirmed")).toBe(true);
  });

  it("allows submitted → reconciling → confirmed without resubmit", () => {
    expect(canTransition("submitted", "reconciling")).toBe(true);
    expect(canTransition("reconciling", "confirmed")).toBe(true);
    expect(canTransition("reconciling", "failed")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("confirmed", "prepared")).toBe(false);
    expect(canTransition("failed", "submitted")).toBe(false);
    expect(canTransition("abandoned", "signing")).toBe(false);
    expect(() => assertTransition("confirmed", "prepared")).toThrow(
      /Illegal chain intent transition/
    );
  });

  it("marks terminal statuses", () => {
    expect(isTerminalStatus("confirmed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("abandoned")).toBe(true);
    expect(isTerminalStatus("prepared")).toBe(false);
    expect(isReusableStatus("prepared")).toBe(true);
    expect(isReusableStatus("submitted")).toBe(false);
  });

  it("has an exhaustive transition map for every status", () => {
    for (const status of Object.keys(LEGAL_TRANSITIONS)) {
      expect(
        Array.isArray(
          LEGAL_TRANSITIONS[status as keyof typeof LEGAL_TRANSITIONS]
        )
      ).toBe(true);
    }
  });
});

describe("chainIntents prepare identity", () => {
  it("reuses the same intent under one intentKey on re-prepare", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const now = Date.now();

    const first = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:fund:trader-1:100",
      intentType: "fund_trader",
      deskManagerId: deskId,
      calls: [{ to: "0x1", value: "0", data: "0x" }],
      now,
    });
    expect(first.reused).toBe(false);
    expect(first.status).toBe("prepared");

    const second = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:fund:trader-1:100",
      intentType: "fund_trader",
      deskManagerId: deskId,
      calls: [{ to: "0x1", value: "0", data: "0x" }],
      now: now + 1_000,
    });
    expect(second.reused).toBe(true);
    expect(second.intentId).toBe(first.intentId);
  });

  it("does not mint a second identity after submit", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const now = Date.now();

    const prepared = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:create:deal-a",
      intentType: "create_deal",
      deskManagerId: deskId,
      now,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "submitted",
      txHash: "0xabc",
      now: now + 10,
    });

    const again = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:create:deal-a",
      intentType: "create_deal",
      deskManagerId: deskId,
      now: now + 20,
    });
    expect(again.intentId).toBe(prepared.intentId);
    expect(again.status).toBe("submitted");
  });

  it("returns cached confirmResult for a confirmed intentKey", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const now = Date.now();

    const prepared = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:withdraw:1",
      intentType: "withdraw",
      deskManagerId: deskId,
      now,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "submitted",
      txHash: "0xdef",
      now: now + 1,
    });
    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "confirmed",
      txHash: "0xdef",
      confirmResult: { ok: true, amount: 10 },
      now: now + 2,
    });

    const cached = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:withdraw:1",
      intentType: "withdraw",
      deskManagerId: deskId,
      now: now + 3,
    });
    expect(cached.cached).toBe(true);
    expect(cached.confirmResult).toEqual({ ok: true, amount: 10 });
  });

  it("rejects re-prepare after failed — does not mint a second identity", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const now = Date.now();
    const intentKey = "desk:fund:retry-same-key";

    const prepared = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey,
      intentType: "fund_trader",
      deskManagerId: deskId,
      now,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "failed",
      lastError: "user rejected",
      now: now + 1,
    });

    await expect(
      t.mutation(internal.chainIntents.prepare, {
        networkSlug: ROBINHOOD_TESTNET_SLUG,
        intentKey,
        intentType: "fund_trader",
        deskManagerId: deskId,
        now: now + 2,
      })
    ).rejects.toThrow(/already ended as failed/);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("chainIntents")
        .withIndex("byIntentKey", (q) => q.eq("intentKey", intentKey))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!._id).toBe(prepared.intentId);
  });

  it("rejects re-prepare after abandoned — requires a new intentKey", async () => {
    const t = makeT();
    const now = Date.now();
    const intentKey = "desk:fund:abandoned-key";

    const prepared = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey,
      intentType: "fund_trader",
      now,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "abandoned",
      lastError: "TTL expired before submit",
      now: now + 1,
    });

    await expect(
      t.mutation(internal.chainIntents.prepare, {
        networkSlug: ROBINHOOD_TESTNET_SLUG,
        intentKey,
        intentType: "fund_trader",
        now: now + 2,
      })
    ).rejects.toThrow(/already ended as abandoned/);

    const retry = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: `${intentKey}:v2`,
      intentType: "fund_trader",
      now: now + 3,
    });
    expect(retry.reused).toBe(false);
    expect(retry.intentId).not.toBe(prepared.intentId);
  });

  it("rejects illegal transition mutations", async () => {
    const t = makeT();
    const prepared = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: ROBINHOOD_TESTNET_SLUG,
      intentKey: "desk:bad-transition",
      intentType: "fund_trader",
      now: Date.now(),
    });

    await expect(
      t.mutation(internal.chainIntents.transition, {
        intentId: prepared.intentId,
        to: "confirmed",
        now: Date.now(),
      })
    ).rejects.toThrow(/Illegal chain intent transition/);
  });
});
