import { describe, expect, it } from "vitest";
import {
  FALLBACK_DESCRIPTION,
  buildNftMetadata,
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

  it("reports pricing unavailable with neutral art instead of guessing health", () => {
    const metadata = buildNftMetadata(
      input({ currentDebt: 250_000n, nav: null, liquidatable: null })
    );

    expect(metadata.image).toBe("https://margincall.fun/logos/nvda.png");
    expect(metadata.attributes).toContainEqual({
      trait_type: "Stage",
      value: "Pricing unavailable",
    });
  });

  it("never publishes debt or NAV as marketplace traits", () => {
    const traits = buildNftMetadata(
      input({ currentDebt: 550_000n, nav: 1_000_000n, liquidatable: false })
    ).attributes.map((attribute) => attribute.trait_type);

    expect(traits).toEqual(["Stock", "Stage", "Status"]);
  });
});
