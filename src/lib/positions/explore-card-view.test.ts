import { describe, expect, it } from "vitest";
import { toExploreCardView } from "@/lib/positions/explore-card-view";
import type { PositionListItem } from "@/lib/positions/types";
import type { GalleryNft } from "@/lib/positions/use-gallery-health";

const NVDA = 1;

function position(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    tokenId: "51",
    assetId: NVDA,
    status: "active",
    owner: "0x1234567890abcdef1234567890abcdef12345678",
    ...overrides,
  };
}

function snapshot(
  health: GalleryNft["health"],
  extras?: { thesis?: string; image?: string }
): GalleryNft {
  if (extras === undefined) return { health };
  return {
    health,
    metadata: {
      name: "Margin Call Position #51",
      description: extras.thesis ?? "",
      image: extras.image ?? "https://margincall.fun/nvda/healthy.png",
      attributes: [],
    },
  };
}

describe("toExploreCardView", () => {
  it("names identity from the index alone", () => {
    const view = toExploreCardView(position(), undefined);

    expect(view.href).toBe("/position/51");
    expect(view.assetLabel).toBe("NVDAc");
    expect(view.tokenLabel).toBe("Token #51");
    expect(view.ownerLabel).toBe("Owner 0x1234…5678");
  });

  it("says it is still checking rather than guessing a stage", () => {
    const view = toExploreCardView(position(), undefined);

    expect(view.healthKind).toBe("loading");
    expect(view.healthLabel).toBe("Checking health…");
    expect(view.face).toBe("neutral");
    expect(view.imageSrc).toBe("/logos/nvda.png");
    expect(view.statusLabel).toBe("Active");
  });

  it("shows the dog declared by live metadata for each named stage", () => {
    for (const stage of ["healthy", "warning", "danger"] as const) {
      const view = toExploreCardView(
        position(),
        snapshot(stage, { image: `https://margincall.fun/nvda/${stage}.png` })
      );

      expect(view.healthKind).toBe(stage);
      expect(view.healthLabel).not.toBeNull();
      expect(view.face).toBe(stage);
      expect(view.imageSrc).toBe(`/nvda/${stage}.png`);
    }
  });

  it("keeps the Pricing unavailable label and shows the metadata dog", () => {
    const view = toExploreCardView(
      position(),
      snapshot("pricing_unavailable", {
        image: "https://margincall.fun/nvda/healthy.png",
      })
    );

    expect(view.healthKind).toBe("pricing_unavailable");
    expect(view.healthLabel).toBe("Pricing unavailable");
    expect(view.imageSrc).toBe("/nvda/healthy.png");
    expect(view.statusLabel).toBe("Active");
  });

  it("stays listed and honest when the metadata route declines", () => {
    const view = toExploreCardView(position(), snapshot("unavailable"));

    expect(view.healthLabel).toBe("Health unavailable");
    expect(view.imageSrc).toBe("/logos/nvda.png");
    expect(view.statusLabel).toBe("Active");
  });

  it("tells one story when the index lags a burn on Base", () => {
    // The route is the live read; repeating the index's stale `Active` beside
    // `Position ended` would put two answers on the same card.
    const view = toExploreCardView(position(), snapshot("ended"));

    expect(view.healthLabel).toBe("Position ended");
    expect(view.statusLabel).toBeNull();
    expect(view.imageSrc).toBe("/logos/nvda.png");
  });

  it("asks nothing of a settled position", () => {
    const live = snapshot("healthy", {
      image: "https://margincall.fun/nvda/healthy.png",
    });
    const closed = toExploreCardView(position({ status: "closed" }), live);
    expect(closed.healthKind).toBe("idle");
    expect(closed.healthLabel).toBeNull();
    expect(closed.statusLabel).toBe("Closed");
    expect(closed.face).toBe("closed");
    expect(closed.imageSrc).toBe("/nvda/closed.png");

    const liquidated = toExploreCardView(
      position({ status: "liquidated" }),
      live
    );
    expect(liquidated.healthLabel).toBeNull();
    expect(liquidated.statusLabel).toBe("Liquidated");
    expect(liquidated.face).toBe("liquidated");
    expect(liquidated.imageSrc).toBe("/nvda/liquidated.png");
  });

  it("carries the thesis and has no artwork for an uncurated asset", () => {
    expect(
      toExploreCardView(
        position(),
        snapshot("healthy", { thesis: "Long the puppy." })
      ).description
    ).toBe("Long the puppy.");
    expect(
      toExploreCardView(position(), snapshot("healthy")).description
    ).toBeNull();
    expect(
      toExploreCardView(position({ assetId: 999 }), undefined).imageSrc
    ).toBeNull();
  });
});
