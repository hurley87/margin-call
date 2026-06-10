import { describe, expect, it } from "vitest";
import { buildTickerItems } from "@/lib/ticker-tape";

const NAMES = { t1: "GORDON", t2: "BLAINE" };

function entry(
  id: string,
  type: string,
  traderId: string,
  createdAt: number,
  metadata: Record<string, unknown> = {}
) {
  return {
    id,
    trader_id: traderId,
    activity_type: type,
    message: "msg",
    metadata,
    created_at: new Date(createdAt).toISOString(),
  };
}

describe("buildTickerItems", () => {
  it("keeps only headline activity types", () => {
    const items = buildTickerItems({
      activity: [
        entry("a", "win", "t1", 3000, { pnl: 420 }),
        entry("b", "scan", "t1", 2000),
        entry("c", "cycle_start", "t2", 1000),
      ],
      traderNames: NAMES,
      deals: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("win");
    expect(items[0].text).toBe("▲ GORDON WIN +$420");
  });

  it("merges deals and activity, newest first, capped by limit", () => {
    const items = buildTickerItems({
      activity: [
        entry("a", "loss", "t2", 1000, { pnl: -55 }),
        entry("b", "wipeout", "t1", 3000),
      ],
      traderNames: NAMES,
      deals: [{ id: "d1", potUsdc: 1000, entryCostUsdc: 25, createdAt: 2000 }],
      limit: 2,
    });
    expect(items.map((item) => item.id)).toEqual(["activity:b", "deal:d1"]);
    expect(items[0].text).toContain("MARGIN CALL — GORDON");
    expect(items[1].text).toBe("◆ NEW DEAL — POT $1,000 / ENTRY $25");
  });

  it("omits the P&L suffix when metadata has no finite pnl", () => {
    const items = buildTickerItems({
      activity: [entry("a", "win", "t1", 1000)],
      traderNames: NAMES,
      deals: [],
    });
    expect(items[0].text).toBe("▲ GORDON WIN");
  });

  it("falls back to UNKNOWN for unnamed traders", () => {
    const items = buildTickerItems({
      activity: [entry("a", "enter", "t9", 1000)],
      traderNames: NAMES,
      deals: [],
    });
    expect(items[0].text).toBe("● UNKNOWN ENTERS A DEAL");
  });
});
