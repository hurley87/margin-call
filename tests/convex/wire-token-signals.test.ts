import { describe, it, expect } from "vitest";
import {
  computeTokenSignals,
  type SnapshotLite,
} from "../../convex/wire/tokenSignals";
import { TOKEN_REGISTRY } from "../../convex/wire/tokenRegistry";

const TOKEN = TOKEN_REGISTRY[0]; // SEARXLY
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

function snap(over: Partial<SnapshotLite> & { id: string }): SnapshotLite {
  return {
    createdAt: NOW,
    ok: true,
    priceUsd: 1,
    volume24hUsd: 1000,
    dayKey: "2026-07-06",
    priceChange24hPct: null,
    ...over,
  };
}

function signalFor(snapshots: SnapshotLite[]) {
  const map = new Map([[TOKEN.addressLc, snapshots]]);
  return computeTokenSignals(map).find((s) => s.slug === TOKEN.slug)!;
}

describe("computeTokenSignals", () => {
  it("degrades to ok:false with no figures when there are no snapshots", () => {
    const sig = signalFor([]);
    expect(sig.ok).toBe(false);
    expect(sig.priceUsd).toBeNull();
    expect(sig.classification).toBe("none");
  });

  it("computes a 24h move from stored snapshots and flags a flash", () => {
    // newest-first: now @138, ~24h ago @100
    const sig = signalFor([
      snap({ id: "a", createdAt: NOW, priceUsd: 138 }),
      snap({
        id: "b",
        createdAt: NOW - DAY,
        priceUsd: 100,
        dayKey: "2026-07-05",
      }),
    ]);
    expect(sig.ok).toBe(true);
    expect(Math.round(sig.move24hPct!)).toBe(38);
    expect(sig.move24hSource).toBe("computed");
    expect(sig.classification).toBe("flash");
    expect(sig.refSnapshotIds).toContain("a");
    expect(sig.refSnapshotIds).toContain("b");
  });

  it("computes move-since-last vs the immediately preceding snapshot", () => {
    const sig = signalFor([
      snap({ id: "a", createdAt: NOW, priceUsd: 110 }),
      snap({ id: "b", createdAt: NOW - HOUR, priceUsd: 100 }),
    ]);
    expect(Math.round(sig.moveSinceLastPct!)).toBe(10);
  });

  it("computes a signed multi-day streak from daily closes", () => {
    // Three straight down daily closes → streak -3, promoted to at least story.
    const sig = signalFor([
      snap({ id: "d3", createdAt: NOW, priceUsd: 70, dayKey: "2026-07-08" }),
      snap({
        id: "d2",
        createdAt: NOW - DAY,
        priceUsd: 80,
        dayKey: "2026-07-07",
      }),
      snap({
        id: "d1",
        createdAt: NOW - 2 * DAY,
        priceUsd: 90,
        dayKey: "2026-07-06",
      }),
      snap({
        id: "d0",
        createdAt: NOW - 3 * DAY,
        priceUsd: 100,
        dayKey: "2026-07-05",
      }),
    ]);
    expect(sig.streakDays).toBe(-3);
    expect(["story", "flash"]).toContain(sig.classification);
  });

  it("never fabricates a move when only one snapshot exists", () => {
    const sig = signalFor([snap({ id: "only", priceUsd: 5 })]);
    expect(sig.ok).toBe(true);
    expect(sig.moveSinceLastPct).toBeNull();
    expect(sig.move24hPct).toBeNull();
    expect(sig.classification).toBe("none");
  });
});
