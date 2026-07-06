import { describe, expect, it } from "vitest";
import {
  buildTraderMetadataUrl,
  buildTraderNftMetadata,
} from "@/lib/trader-metadata";

describe("trader NFT metadata helpers", () => {
  it("builds a stable public metadata URL for minting", () => {
    expect(
      buildTraderMetadataUrl("https://margin-call.example/", "abc123")
    ).toBe("https://margin-call.example/api/trader/abc123/metadata");
  });

  it("uses the absolute placeholder PNG when the portrait is not ready", () => {
    const metadata = buildTraderNftMetadata(
      {
        traderId: "trader-1",
        name: "Gordon Gecko",
        status: "active",
        portraitStatus: "pending",
        rarity: "Common",
        riskProfile: "Aggressive",
        tokenId: null,
        profileImageUrl: null,
        traits: null,
      },
      "https://margin-call.example"
    );

    expect(metadata).toMatchObject({
      name: "Gordon Gecko",
      image: "https://margin-call.example/trader-placeholder.png",
      external_url: "https://margin-call.example/traders/trader-1",
    });
    expect(metadata.attributes.map((a) => a.trait_type)).not.toContain(
      "Token ID"
    );
    // Rarity is always present; demographics/gameplay state are never surfaced.
    expect(metadata.attributes).toContainEqual({
      trait_type: "Rarity",
      value: "Common",
    });
  });

  it("uses the generated image URL and Token ID attribute when ready", () => {
    const metadata = buildTraderNftMetadata(
      {
        traderId: "trader-2",
        name: "Bud Fox",
        status: "active",
        portraitStatus: "ready",
        rarity: "Uncommon",
        riskProfile: "Balanced",
        tokenId: 42,
        profileImageUrl: "https://storage.example/portrait.png",
        traits: null,
      },
      "https://margin-call.example"
    );

    expect(metadata.image).toBe("https://storage.example/portrait.png");
    expect(metadata.attributes).toContainEqual({
      trait_type: "Token ID",
      value: 42,
    });
  });

  it("emits the 5 surfaced slots (tier + odds) + Rarity + Token ID, and no demographics", () => {
    const metadata = buildTraderNftMetadata(
      {
        traderId: "trader-4",
        name: "The Bonfire",
        status: "active",
        portraitStatus: "ready",
        rarity: "Legendary",
        riskProfile: "Aggressive",
        tokenId: 7,
        profileImageUrl: "https://storage.example/portrait.png",
        traits: {
          expression: "sharp",
          fieldInk: "vermilion",
          attire: "business",
          vice: "litcigar",
          fieldFlourish: "confetti",
        },
      },
      "https://margin-call.example"
    );

    expect(metadata.attributes).toEqual([
      {
        trait_type: "Expression",
        value: "Sharp Focused",
        tier: "Common",
        designed_odds: "26.2%",
      },
      {
        trait_type: "Field Ink",
        value: "Vermilion",
        tier: "Common",
        designed_odds: "24.75%",
      },
      {
        trait_type: "Attire",
        value: "Business Suit",
        tier: "Common",
        designed_odds: "42%",
      },
      {
        trait_type: "Vice",
        value: "Lit Cigar",
        tier: "Rare",
        designed_odds: "1%",
      },
      {
        trait_type: "Field Flourish",
        value: "Confetti Storm",
        tier: "Legendary",
        designed_odds: "1%",
      },
      { trait_type: "Rarity", value: "Legendary" },
      { trait_type: "Token ID", value: 7 },
    ]);

    const types = metadata.attributes.map((a) => a.trait_type);
    for (const forbidden of [
      "Gender Presentation",
      "Apparent Age",
      "Appearance",
      "Skin",
      "Archetype",
      "Status",
      "Portrait Status",
      "Risk Profile",
    ]) {
      expect(types).not.toContain(forbidden);
    }
  });
});
