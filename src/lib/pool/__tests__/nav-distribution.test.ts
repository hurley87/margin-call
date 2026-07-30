import { describe, expect, it } from "vitest";

import {
  buildNavDistribution,
  formatWadUsd,
  harmonicMeanWad,
  unitPriceFromHm,
  wadToUsdNumber,
  WAD,
} from "@/lib/pool/nav-distribution";

describe("wad formatting", () => {
  it("formats whole dollars", () => {
    expect(formatWadUsd(50n * WAD)).toBe("$50.00");
    expect(wadToUsdNumber(22n * WAD)).toBe(22);
  });

  it("formats fractional dollars", () => {
    expect(formatWadUsd(225n * 10n ** 17n)).toBe("$22.50");
  });
});

describe("buildNavDistribution", () => {
  it("buckets NAVs", () => {
    const dist = buildNavDistribution([
      (22n * WAD).toString(),
      (40n * WAD).toString(),
      (120n * WAD).toString(),
      (307n * WAD).toString(),
    ]);
    expect(dist.find((b) => b.minUsd === 0)?.count).toBe(1);
    expect(dist.find((b) => b.minUsd === 25)?.count).toBe(1);
    expect(dist.find((b) => b.minUsd === 100)?.count).toBe(1);
    expect(dist.find((b) => b.minUsd === 300)?.count).toBe(1);
  });
});

describe("harmonicMeanWad", () => {
  it("returns 0 for empty", () => {
    expect(harmonicMeanWad([])).toBe("0");
  });

  it("returns the sole NAV for n=1", () => {
    expect(harmonicMeanWad([50n * WAD])).toBe((50n * WAD).toString());
  });

  it("computes HM for two equal NAVs", () => {
    expect(harmonicMeanWad([40n * WAD, 40n * WAD])).toBe(
      (40n * WAD).toString()
    );
  });
});

describe("unitPriceFromHm", () => {
  it("applies 10% surcharge", () => {
    const hm = 50n * WAD;
    const surcharge = 10n ** 17n; // 0.10 WAD
    expect(unitPriceFromHm(hm, surcharge)).toBe((55n * WAD).toString());
  });
});
