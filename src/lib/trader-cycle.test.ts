import { describe, expect, it } from "vitest";
import {
  getTraderCycleDisplayState,
  getTraderCycleUi,
  resolveTraderCycleIntervalMs,
  traderCycleDocFromDeskSummary,
} from "@/lib/trader-cycle";
import {
  DEFAULT_CYCLE_INTERVAL_MS,
  SPEED_TOKEN_CYCLE_INTERVAL_MS,
} from "@/lib/constants";
import type { Doc } from "../../convex/_generated/dataModel";

function baseTrader(overrides: Partial<Doc<"traders">> = {}): Doc<"traders"> {
  return {
    _id: "jd7" as Doc<"traders">["_id"],
    _creationTime: 0,
    deskManagerId: "kd7" as Doc<"traders">["deskManagerId"],
    ownerSubject: "sub",
    name: "T",
    status: "active",
    walletStatus: "ready",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("getTraderCycleDisplayState", () => {
  const now = 1_000_000;

  it("returns wiped before wallet checks", () => {
    expect(
      getTraderCycleDisplayState(
        baseTrader({
          status: "wiped_out",
          walletStatus: "pending",
        }),
        now
      ).kind
    ).toBe("wiped");
  });

  it("returns paused", () => {
    expect(
      getTraderCycleDisplayState(baseTrader({ status: "paused" }), now).kind
    ).toBe("paused");
  });

  it("returns wallet states when active", () => {
    expect(
      getTraderCycleDisplayState(baseTrader({ walletStatus: "pending" }), now)
        .kind
    ).toBe("wallet_pending");
    expect(
      getTraderCycleDisplayState(baseTrader({ walletStatus: "creating" }), now)
        .kind
    ).toBe("wallet_creating");
    expect(
      getTraderCycleDisplayState(baseTrader({ walletStatus: "error" }), now)
        .kind
    ).toBe("wallet_error");
  });

  it("returns running when lease is in the future", () => {
    expect(
      getTraderCycleDisplayState(
        baseTrader({ cycleLeaseUntil: now + 1000 }),
        now
      ).kind
    ).toBe("running");
  });

  it("returns ready when active, wallet ready, no lastCycleAt, no lease", () => {
    expect(
      getTraderCycleDisplayState(
        baseTrader({ lastCycleAt: undefined, cycleLeaseUntil: undefined }),
        now
      ).kind
    ).toBe("ready_no_prior_cycle");
  });

  it("returns countdown when next eligibility is in the future", () => {
    const last = now - 60_000;
    const state = getTraderCycleDisplayState(
      baseTrader({ lastCycleAt: last }),
      now
    );
    expect(state.kind).toBe("countdown");
    if (state.kind === "countdown") {
      expect(state.remainingMs).toBe(last + DEFAULT_CYCLE_INTERVAL_MS - now);
    }
  });

  it("returns ready_next_tick when interval elapsed", () => {
    const last = now - DEFAULT_CYCLE_INTERVAL_MS - 1;
    expect(
      getTraderCycleDisplayState(baseTrader({ lastCycleAt: last }), now).kind
    ).toBe("ready_next_tick");
  });

  it("ignores expired lease", () => {
    const last = now - DEFAULT_CYCLE_INTERVAL_MS - 1;
    expect(
      getTraderCycleDisplayState(
        baseTrader({
          lastCycleAt: last,
          cycleLeaseUntil: now - 1,
        }),
        now
      ).kind
    ).toBe("ready_next_tick");
  });
});

describe("getTraderCycleUi", () => {
  const now = 1_000_000;
  const defaultMinutes = Math.floor(DEFAULT_CYCLE_INTERVAL_MS / 60_000);
  const speedMinutes = Math.floor(SPEED_TOKEN_CYCLE_INTERVAL_MS / 60_000);

  it("includes the cadence in countdown labels", () => {
    const doc = baseTrader({ lastCycleAt: now - 60_000 });
    expect(getTraderCycleUi(doc, now).text).toMatch(
      new RegExp(`\\[NEXT IN \\d{2}:\\d{2} / ${defaultMinutes}M\\]`)
    );
  });

  it("includes the cadence in ready_no_prior_cycle labels", () => {
    const doc = baseTrader({ lastCycleAt: undefined });
    expect(getTraderCycleUi(doc, now).text).toBe(
      `[READY · ${defaultMinutes}M CYCLE]`
    );
  });

  it("maps desk portfolio snake_case summaries", () => {
    const doc = traderCycleDocFromDeskSummary({
      status: "active",
      wallet_status: "ready",
      last_cycle_at: now - DEFAULT_CYCLE_INTERVAL_MS - 1,
    });
    expect(getTraderCycleUi(doc, now).text).toBe(
      `[READY ON NEXT TICK · ${defaultMinutes}M]`
    );
  });

  it.skipIf(SPEED_TOKEN_CYCLE_INTERVAL_MS === DEFAULT_CYCLE_INTERVAL_MS)(
    "uses the speed-token cadence when eligible (only meaningful once cadences diverge)",
    () => {
      const doc = {
        ...baseTrader({ lastCycleAt: now - 30_000 }),
        speedTokenEligible: true,
      };
      const speedLabel = getTraderCycleUi(doc, now).text;
      const defaultLabel = getTraderCycleUi(
        baseTrader({ lastCycleAt: now - 30_000 }),
        now
      ).text;
      expect(speedLabel).toMatch(
        new RegExp(`\\[NEXT IN \\d{2}:\\d{2} / ${speedMinutes}M\\]`)
      );
      expect(speedLabel).not.toBe(defaultLabel);
    }
  );
});

describe("resolveTraderCycleIntervalMs", () => {
  it("uses default interval", () => {
    const t = baseTrader() as Parameters<
      typeof resolveTraderCycleIntervalMs
    >[0];
    expect(resolveTraderCycleIntervalMs(t)).toBe(DEFAULT_CYCLE_INTERVAL_MS);
  });

  it("uses speed token interval when eligible flag is true", () => {
    const t = {
      ...baseTrader(),
      speedTokenEligible: true,
    } as Parameters<typeof resolveTraderCycleIntervalMs>[0];
    expect(resolveTraderCycleIntervalMs(t)).toBe(SPEED_TOKEN_CYCLE_INTERVAL_MS);
  });
});
