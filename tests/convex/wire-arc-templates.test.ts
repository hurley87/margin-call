import { describe, it, expect } from "vitest";
import {
  describeCompanyArc,
  describePlayerArc,
  fmtPct,
  headlineMovePct,
} from "../../convex/wire/arcTemplates";
import type { TokenSignal } from "../../convex/wire/tokenSignals";

function signal(over: Partial<TokenSignal>): TokenSignal {
  return {
    slug: "kupo",
    symbol: "KUPO",
    companyName: "Kupo",
    xHandle: "@kupo_gg",
    isHouseToken: false,
    ok: true,
    priceUsd: 1,
    moveSinceLastPct: null,
    move24hPct: null,
    move24hSource: "computed",
    volume24hUsd: null,
    volumeVsTrailing: null,
    volumeAnomaly: false,
    streakDays: 0,
    classification: "story",
    latestSnapshotId: "s1",
    refSnapshotIds: ["s1"],
    ...over,
  };
}

describe("arcTemplates", () => {
  it("formats signed percentages without decimals", () => {
    expect(fmtPct(38.4)).toBe("+38%");
    expect(fmtPct(-22.6)).toBe("-23%");
    expect(fmtPct(0)).toBe("0%");
  });

  it("picks the largest-magnitude move as the headline move", () => {
    expect(
      headlineMovePct(signal({ move24hPct: 38, moveSinceLastPct: 2 }))
    ).toBe(38);
    expect(
      headlineMovePct(signal({ move24hPct: -5, moveSinceLastPct: -22 }))
    ).toBe(-22);
    expect(
      headlineMovePct(signal({ move24hPct: null, moveSinceLastPct: null }))
    ).toBeNull();
  });

  it("builds a factual company arc from real numbers, no invented cause", () => {
    const { title, summary } = describeCompanyArc(
      signal({
        move24hPct: 38,
        streakDays: 0,
        symbol: "SURPLUS",
        companyName: "Surplus Intelligence",
      })
    );
    expect(title).toContain("SURPLUS");
    expect(title).toContain("+38%");
    expect(summary).toContain("Surplus Intelligence");
    // The cause is explicitly unknown — never an invented plausible event.
    expect(summary.toLowerCase()).toContain("cause is anybody's guess");
  });

  it("mentions a real multi-day streak in the arc", () => {
    const { title } = describeCompanyArc(
      signal({ move24hPct: -6, streakDays: -3, symbol: "NOOK" })
    );
    expect(title).toContain("3 straight down days");
  });

  it("builds a factual player streak arc", () => {
    const { title, summary } = describePlayerArc("Jim's desk", "loss", 3);
    expect(title).toBe("Jim's desk: 3 straight losses");
    expect(summary).toContain("3 losses in a row");
  });
});
