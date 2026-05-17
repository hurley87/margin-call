/**
 * Behavior tests: trading-hours enforcement at the Convex mutation layer.
 *
 * Covers:
 *   - `recordOnChainCreation` — gated with +60s close grace, hard pre-open reject.
 *   - `recordVerifiedEntry` — defensive guard, same +60s grace rules.
 *   - `traders.setStatus({status:"active"})` — gated; pause/wipe-out NOT gated.
 *   - `setStatus` wallet-ready precedence: wallet-ready throws BEFORE trading-hours.
 *
 * Time injection (per spec §9.2):
 *   - For "open" cases we set `MC_FORCE_MARKET_OPEN=1` so the global vitest
 *     env default (also "1") + the mutation's own clock both report open
 *     regardless of wall-clock.
 *   - For "closed" / "close-grace" cases we UNSET `MC_FORCE_MARKET_OPEN` and
 *     pin the system clock via `vi.setSystemTime(...)` to a known ET wall
 *     clock built from `Date.UTC(...)` with the correct EDT/EST offset.
 *
 * The vitest config sets `MC_FORCE_MARKET_OPEN=1` for the whole convex-test
 * suite (so legacy tests keep passing). Tests here that need real-clock
 * behaviour delete that env var in `beforeEach` and restore it in `afterEach`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { MARKET_CLOSED_MESSAGE } from "../../convex/lib/tradingHours";
import {
  seedDeskManager,
  seedActiveTrader,
  seedDeal,
  useRealMarketHours,
} from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

// ── Concrete ET timestamps (2026, EDT = UTC−4) ──────────────────────────────
// Tue 2026-05-05 10:00 ET → 14:00 UTC
const TUE_10AM_ET = Date.UTC(2026, 4, 5, 14, 0, 0);
// Sat 2026-05-09 12:00 ET → 16:00 UTC
const SAT_NOON_ET = Date.UTC(2026, 4, 9, 16, 0, 0);
// Tue 2026-05-05 16:00:30 ET (30s past close, within +60s grace) → 20:00:30 UTC
const TUE_CLOSE_PLUS_30S = Date.UTC(2026, 4, 5, 20, 0, 30);
// Tue 2026-05-05 16:01:30 ET (90s past close, outside +60s grace) → 20:01:30 UTC
const TUE_CLOSE_PLUS_90S = Date.UTC(2026, 4, 5, 20, 1, 30);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Authenticate as the desk-manager subject used by the seed helpers
 * (`did:privy:test-subject-001`) so public mutations pass auth.
 */
function asDeskManager(t: ReturnType<typeof convexTest<typeof schema>>) {
  return t.withIdentity({
    subject: "did:privy:test-subject-001",
    issuer: "test",
  });
}

// ── recordOnChainCreation ───────────────────────────────────────────────────

describe("recordOnChainCreation: trading-hours enforcement", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("succeeds on Tuesday 10:00 ET (market open)", async () => {
    vi.setSystemTime(new Date(TUE_10AM_ET));

    const t = convexTest(schema, modules);
    await seedDeskManager(t);

    const dealId = await asDeskManager(t).mutation(
      api.deals.recordOnChainCreation,
      {
        onChainDealId: 1001,
        onChainTxHash: "0xabc",
        prompt: "Buy IBM",
        potUsdc: 500,
        entryCostUsdc: 50,
      }
    );

    expect(dealId).toBeDefined();
  });

  it("throws with MARKET_CLOSED_MESSAGE on Saturday noon ET", async () => {
    vi.setSystemTime(new Date(SAT_NOON_ET));

    const t = convexTest(schema, modules);
    await seedDeskManager(t);

    await expect(
      asDeskManager(t).mutation(api.deals.recordOnChainCreation, {
        onChainDealId: 1002,
        onChainTxHash: "0xdef",
        prompt: "Buy IBM",
        potUsdc: 500,
        entryCostUsdc: 50,
      })
    ).rejects.toThrow(MARKET_CLOSED_MESSAGE);
  });

  it("succeeds at 16:00:30 ET (within +60s close grace)", async () => {
    vi.setSystemTime(new Date(TUE_CLOSE_PLUS_30S));

    const t = convexTest(schema, modules);
    await seedDeskManager(t);

    const dealId = await asDeskManager(t).mutation(
      api.deals.recordOnChainCreation,
      {
        onChainDealId: 1003,
        onChainTxHash: "0xghi",
        prompt: "Buy IBM",
        potUsdc: 500,
        entryCostUsdc: 50,
      }
    );
    expect(dealId).toBeDefined();
  });

  it("throws at 16:01:30 ET (outside +60s close grace)", async () => {
    vi.setSystemTime(new Date(TUE_CLOSE_PLUS_90S));

    const t = convexTest(schema, modules);
    await seedDeskManager(t);

    await expect(
      asDeskManager(t).mutation(api.deals.recordOnChainCreation, {
        onChainDealId: 1004,
        onChainTxHash: "0xjkl",
        prompt: "Buy IBM",
        potUsdc: 500,
        entryCostUsdc: 50,
      })
    ).rejects.toThrow(MARKET_CLOSED_MESSAGE);
  });
});

// ── recordVerifiedEntry ─────────────────────────────────────────────────────

describe("recordVerifiedEntry: trading-hours enforcement", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("succeeds at 16:00:30 ET (within +60s close grace)", async () => {
    vi.setSystemTime(new Date(TUE_CLOSE_PLUS_30S));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const entryId = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-close-grace-30s",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });
    expect(entryId).toBeDefined();
  });

  it("throws at 16:01:30 ET (outside +60s close grace)", async () => {
    vi.setSystemTime(new Date(TUE_CLOSE_PLUS_90S));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    await expect(
      t.mutation(internal.deals.recordVerifiedEntry, {
        paymentId: "pay-close-grace-90s",
        dealId: dealId as never,
        traderId: traderId as string,
        entryCostUsdc: 50,
      })
    ).rejects.toThrow(MARKET_CLOSED_MESSAGE);
  });
});

// ── traders.setStatus ───────────────────────────────────────────────────────

describe("traders.setStatus: trading-hours enforcement", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("setStatus({status:'active'}) throws outside trading hours", async () => {
    vi.setSystemTime(new Date(SAT_NOON_ET));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    // Start paused so we exercise the transition to "active".
    const traderId = await seedActiveTrader(t, dmId, {
      status: "paused",
      walletStatus: "ready",
      escrowBalance: 100,
    });

    await expect(
      asDeskManager(t).mutation(api.traders.setStatus, {
        traderId: traderId as never,
        status: "active",
      })
    ).rejects.toThrow(MARKET_CLOSED_MESSAGE);
  });

  it("setStatus({status:'paused'}) succeeds outside trading hours", async () => {
    vi.setSystemTime(new Date(SAT_NOON_ET));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      status: "active",
      walletStatus: "ready",
      escrowBalance: 100,
    });

    await expect(
      asDeskManager(t).mutation(api.traders.setStatus, {
        traderId: traderId as never,
        status: "paused",
      })
    ).resolves.toEqual({ ok: true });
  });

  it("setStatus({status:'active'}) with walletStatus!='ready' throws the wallet-ready error FIRST (precedence)", async () => {
    vi.setSystemTime(new Date(SAT_NOON_ET));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      status: "paused",
      walletStatus: "pending",
      escrowBalance: 100,
    });

    await expect(
      asDeskManager(t).mutation(api.traders.setStatus, {
        traderId: traderId as never,
        status: "active",
      })
    ).rejects.toThrow("Trader wallet must be ready before activation");
  });
});
