import { describe, expect, it } from "vitest";
import {
  FALLBACK_DESCRIPTION,
  buildNftMetadata,
  parseNftMetadata,
  stageFromMetadata,
  type NftMetadataInput,
} from "@/lib/positions/nft-metadata";

const NVDA = 1;

function input(overrides: Partial<NftMetadataInput> = {}): NftMetadataInput {
  return {
    tokenId: 42n,
    assetId: NVDA,
    currentDebt: 0n,
    nav: null,
    liquidatable: null,
    thesis: "",
    ...overrides,
  };
}

describe("buildNftMetadata", () => {
  it("names the position and points at a static image on the contract's origin", () => {
    expect(buildNftMetadata(input())).toEqual({
      name: "Margin Call Position #42",
      description: FALLBACK_DESCRIPTION,
      image: "https://margincall.fun/nvda/healthy.png",
      attributes: [
        { trait_type: "Stock", value: "NVDA" },
        { trait_type: "Stage", value: "Healthy" },
        { trait_type: "Status", value: "Active" },
      ],
    });
  });

  it("uses the owner's thesis verbatim as the description", () => {
    const thesis =
      "AI capex remains structurally underpriced; NVDA should outperform.";

    expect(buildNftMetadata(input({ thesis })).description).toBe(thesis);
  });

  it("falls back when the thesis is only whitespace", () => {
    expect(buildNftMetadata(input({ thesis: "   " })).description).toBe(
      FALLBACK_DESCRIPTION
    );
  });

  it("tracks live risk into the stage trait and the image", () => {
    const metadata = buildNftMetadata(
      input({
        assetId: 2,
        currentDebt: 550_000n,
        nav: 1_000_000n,
        liquidatable: false,
      })
    );

    expect(metadata.image).toBe("https://margincall.fun/aapl/warning.png");
    expect(metadata.attributes).toContainEqual({
      trait_type: "Stage",
      value: "Warning",
    });
  });

  it("keeps the Stage trait honest and shows the healthy dog while unpriced", () => {
    const metadata = buildNftMetadata(
      input({ currentDebt: 250_000n, nav: null, liquidatable: null })
    );

    expect(metadata.image).toBe("https://margincall.fun/nvda/healthy.png");
    expect(metadata.attributes).toContainEqual({
      trait_type: "Stage",
      value: "Pricing unavailable",
    });
  });

  it("fails loudly for an asset the deployment manifest does not curate", () => {
    // Degrading to partial metadata would hide a manifest that has drifted
    // from the coordinator's asset registry.
    expect(() => buildNftMetadata(input({ assetId: 99 }))).toThrow(
      /No curated launch asset/
    );
  });

  it("never publishes debt or NAV as marketplace traits", () => {
    const traits = buildNftMetadata(
      input({ currentDebt: 550_000n, nav: 1_000_000n, liquidatable: false })
    ).attributes.map((attribute) => attribute.trait_type);

    expect(traits).toEqual(["Stock", "Stage", "Status"]);
  });
});

describe("parseNftMetadata", () => {
  const live = buildNftMetadata(input());

  it("accepts the JSON the metadata route serves", () => {
    expect(parseNftMetadata(live)).toEqual(live);
    expect(stageFromMetadata(live)).toBe("healthy");
  });

  it("maps every stage label the route publishes", () => {
    expect(
      stageFromMetadata(
        buildNftMetadata(
          input({ currentDebt: 550_000n, nav: 1_000_000n, liquidatable: false })
        )
      )
    ).toBe("warning");
    expect(
      stageFromMetadata(
        buildNftMetadata(
          input({ currentDebt: 700_000n, nav: 1_000_000n, liquidatable: false })
        )
      )
    ).toBe("danger");
  });

  it("rejects a payload marketplaces would not render", () => {
    expect(parseNftMetadata(null)).toBeNull();
    expect(parseNftMetadata({ ...live, name: "" })).toBeNull();
    expect(
      parseNftMetadata({ ...live, image: "https://example.com/nvda.png" })
    ).toBeNull();
    expect(stageFromMetadata({ ...live, attributes: [] })).toBeNull();
  });
});
