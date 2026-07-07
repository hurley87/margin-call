import { describe, it, expect } from "vitest";
import {
  DROP_ANGLES,
  pickQuietAngle,
  isNearDuplicateHeadline,
  jaccardSimilarity,
  tokenizeHeadline,
  recentHeadlinesFromDrops,
} from "../../convex/wire/dropAngles";

describe("pickQuietAngle", () => {
  it("is deterministic for the same seed", () => {
    const a = pickQuietAngle("slot-42:2026-05-05", null);
    const b = pickQuietAngle("slot-42:2026-05-05", null);
    expect(a.key).toBe(b.key);
  });

  it("excludes the previous angle key", () => {
    const prev = DROP_ANGLES[0]!.key;
    for (let slot = 1; slot <= 50; slot++) {
      const angle = pickQuietAngle(`slot-${slot}`, prev);
      expect(angle.key).not.toBe(prev);
    }
  });

  it("rotates through all angles when prevKey cycles", () => {
    const seen = new Set<string>();
    let prev: string | null = null;
    for (let slot = 0; slot < DROP_ANGLES.length * 20; slot++) {
      const angle = pickQuietAngle(`rotate-${slot}`, prev);
      seen.add(angle.key);
      prev = angle.key;
    }
    expect(seen.size).toBe(DROP_ANGLES.length);
  });
});

describe("headline dedup", () => {
  it("tokenizes and compares similar headlines", () => {
    const a = tokenizeHeadline("PanAtlantic Loses Another $300M Today");
    const b = tokenizeHeadline("PanAtlantic Loses Another 300M Today");
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.8);
  });

  it("flags near-duplicates", () => {
    expect(
      isNearDuplicateHeadline("PanAtlantic loses another $300M today", [
        "PanAtlantic loses another $300M today on the wire",
      ])
    ).toBe(true);
  });

  it("allows clearly different headlines", () => {
    expect(
      isNearDuplicateHeadline("Junior analyst cries in stairwell", [
        "PanAtlantic loses another $300M",
      ])
    ).toBe(false);
  });

  it("extracts main headlines from recent drops", () => {
    const headlines = recentHeadlinesFromDrops([
      {
        headlines: [
          { role: "main", headline: "Lead story" },
          { role: "supporting", headline: "Aside" },
        ],
      },
      { headlines: [{ headline: "Fallback main" }] },
    ]);
    expect(headlines).toEqual(["Lead story", "Fallback main"]);
  });
});
