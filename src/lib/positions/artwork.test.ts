import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAGE_LABEL,
  type ArtworkFace,
  artworkPath,
  faceFromStage,
  faceFromStatus,
  resolvePositionStage,
  stockSymbol,
} from "@/lib/positions/artwork";
import { baseDeployment } from "@/lib/protocol/deployment";

const NVDA = 1;
const AAPL = 2;
const META = 3;
const GOOGL = 4;

/** A round NAV so each debt below reads directly as an equity percentage. */
const NAV = 1_000_000n;

describe("resolvePositionStage", () => {
  it("is healthy for a debt-free position even without oracle pricing", () => {
    expect(
      resolvePositionStage({
        currentDebt: 0n,
        nav: null,
        liquidatable: null,
      })
    ).toBe("healthy");
  });

  it("does not claim a health state for a financed position without LIVE pricing", () => {
    expect(
      resolvePositionStage({
        currentDebt: 250_000n,
        nav: null,
        liquidatable: null,
      })
    ).toBe("pricing_unavailable");
  });

  it("maps equity ratio to healthy, warning, and danger at the V1 thresholds", () => {
    const cases: Array<[bigint, string]> = [
      [400_000n, "healthy"], // 60% equity
      [500_000n, "healthy"], // exactly 50% equity
      [500_001n, "warning"], // a hair under 50%
      [600_000n, "warning"], // exactly 40% equity
      [600_001n, "danger"], // a hair under 40%
      [900_000n, "danger"], // 10% equity
    ];

    for (const [currentDebt, expected] of cases) {
      expect(
        resolvePositionStage({ currentDebt, nav: NAV, liquidatable: false })
      ).toBe(expected);
    }
  });

  it("is danger whenever the protocol already calls the position liquidatable", () => {
    // Equity ratio alone would read healthy; the protocol verdict still wins.
    expect(
      resolvePositionStage({
        currentDebt: 100_000n,
        nav: 1_000_000n,
        liquidatable: true,
      })
    ).toBe("danger");
  });

  it("is danger when debt has caught or passed NAV", () => {
    expect(
      resolvePositionStage({
        currentDebt: 1_000_000n,
        nav: 1_000_000n,
        liquidatable: false,
      })
    ).toBe("danger");
    expect(
      resolvePositionStage({
        currentDebt: 2_000_000n,
        nav: 1_000_000n,
        liquidatable: false,
      })
    ).toBe("danger");
    expect(
      resolvePositionStage({ currentDebt: 1n, nav: 0n, liquidatable: false })
    ).toBe("danger");
  });
});

describe("faceFromStage", () => {
  it("passes a named health stage straight through to its artwork", () => {
    expect(faceFromStage("healthy")).toBe("healthy");
    expect(faceFromStage("warning")).toBe("warning");
    expect(faceFromStage("danger")).toBe("danger");
  });

  it("is neutral when there is no honest stage to show", () => {
    expect(faceFromStage("pricing_unavailable")).toBe("neutral");
    expect(faceFromStage(null)).toBe("neutral");
  });
});

describe("faceFromStatus", () => {
  it("shows the liquidated face only for the indexed liquidated status", () => {
    expect(faceFromStatus("liquidated")).toBe("liquidated");
  });

  it("stays neutral for active and closed, which carry no live risk read", () => {
    expect(faceFromStatus("active")).toBe("neutral");
    expect(faceFromStatus("closed")).toBe("neutral");
  });
});

describe("artworkPath", () => {
  it("maps each launch asset to its own stage artwork", () => {
    expect(artworkPath(NVDA, "healthy")).toBe("/nvda/healthy.png");
    expect(artworkPath(AAPL, "warning")).toBe("/aapl/warning.png");
    expect(artworkPath(META, "danger")).toBe("/meta/danger.png");
    expect(artworkPath(GOOGL, "liquidated")).toBe("/googl/liquidated.png");
  });

  it("uses the ticker logo for the neutral face", () => {
    expect(artworkPath(NVDA, "neutral")).toBe("/logos/nvda.png");
  });

  it("has no artwork for an asset outside the launch set", () => {
    expect(artworkPath(99, "healthy")).toBeNull();
    expect(artworkPath(99, "neutral")).toBeNull();
  });
});

describe("stockSymbol", () => {
  it("names the underlying stock, not the curated token", () => {
    expect(stockSymbol(NVDA)).toBe("NVDA");
    expect(stockSymbol(GOOGL)).toBe("GOOGL");
  });

  it("has no symbol for an asset outside the launch set", () => {
    expect(stockSymbol(99)).toBeNull();
  });
});

describe("committed artwork", () => {
  it("has a file behind every path the resolver can emit", () => {
    const faces: ArtworkFace[] = [
      "healthy",
      "warning",
      "danger",
      "liquidated",
      "neutral",
    ];
    const paths = new Set<string>();

    for (const asset of baseDeployment.assets) {
      for (const face of faces) {
        const path = artworkPath(asset.assetId, face);
        expect(path, `no path for ${asset.name} ${face}`).not.toBeNull();
        paths.add(path!);
      }
    }

    // A missing PNG is invisible to every other test here — they assert the
    // string, and `next/image` only fails at request time.
    for (const path of paths) {
      expect(
        existsSync(join(process.cwd(), "public", path)),
        `missing public${path}`
      ).toBe(true);
    }
  });
});

describe("STAGE_LABEL", () => {
  it("names every stage for metadata attributes and UI copy", () => {
    expect(STAGE_LABEL.healthy).toBe("Healthy");
    expect(STAGE_LABEL.warning).toBe("Warning");
    expect(STAGE_LABEL.danger).toBe("Danger");
    expect(STAGE_LABEL.pricing_unavailable).toBe("Pricing unavailable");
  });
});
