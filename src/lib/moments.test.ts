import { describe, expect, it } from "vitest";
import { selectMoment } from "@/lib/moments";

const NAMES = { t1: "GORDON", t2: "BLAINE" };
const OPTS = { bigMoveUsdc: 100 };

function entry(
  id: string,
  type: string,
  traderId = "t1",
  metadata: Record<string, unknown> = {}
) {
  return { id, trader_id: traderId, activity_type: type, metadata };
}

describe("selectMoment", () => {
  it("returns null when no entry is ceremony-worthy", () => {
    expect(
      selectMoment([entry("a", "scan"), entry("b", "enter")], NAMES, OPTS)
    ).toBeNull();
  });

  it("picks the single most severe moment from a burst", () => {
    const moment = selectMoment(
      [
        entry("a", "loss", "t1", { pnl: -500 }),
        entry("b", "wipeout", "t2"),
        entry("c", "win", "t1", { pnl: 500 }),
      ],
      NAMES,
      OPTS
    );
    expect(moment?.kind).toBe("wipeout");
    expect(moment?.traderName).toBe("BLAINE");
  });

  it("requires |pnl| over the big-move threshold for wins and losses", () => {
    expect(
      selectMoment([entry("a", "win", "t1", { pnl: 50 })], NAMES, OPTS)
    ).toBeNull();
    expect(
      selectMoment([entry("a", "loss", "t1", { pnl: -50 })], NAMES, OPTS)
    ).toBeNull();
    expect(selectMoment([entry("a", "win", "t1")], NAMES, OPTS)).toBeNull();
    expect(
      selectMoment([entry("a", "loss", "t1", { pnl: -250 })], NAMES, OPTS)?.kind
    ).toBe("loss");
  });

  it("always ceremonies a wipeout, even without pnl metadata", () => {
    const moment = selectMoment([entry("a", "wipeout", "t1")], NAMES, OPTS);
    expect(moment?.kind).toBe("wipeout");
    expect(moment?.amountUsdc).toBeUndefined();
  });

  it("keeps the first entry on severity ties", () => {
    const moment = selectMoment(
      [
        entry("a", "win", "t1", { pnl: 150 }),
        entry("b", "win", "t2", { pnl: 900 }),
      ],
      NAMES,
      OPTS
    );
    expect(moment?.id).toBe("a");
  });

  it("falls back to a generic trader name", () => {
    expect(
      selectMoment([entry("a", "wipeout", "t9")], NAMES, OPTS)?.traderName
    ).toBe("YOUR TRADER");
  });
});
