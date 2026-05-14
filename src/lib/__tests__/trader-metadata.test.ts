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
        archetype: "Junk Bond Operator",
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
    expect(metadata.attributes.map((attr) => attr.trait_type)).not.toContain(
      "Token ID"
    );
  });

  it("uses the generated image URL and token ID attribute when ready", () => {
    const metadata = buildTraderNftMetadata(
      {
        traderId: "trader-2",
        name: "Bud Fox",
        status: "active",
        portraitStatus: "ready",
        archetype: "Junk Bond Operator",
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

  it("humanizes special-case archetype attributes", () => {
    const metadata = buildTraderNftMetadata(
      {
        traderId: "trader-3",
        name: "Hayley Patel",
        status: "active",
        portraitStatus: "ready",
        archetype: "M&A Rainmaker",
        riskProfile: "Balanced",
        tokenId: null,
        profileImageUrl: "https://storage.example/portrait.png",
        traits: {
          archetype: "mna_rainmaker",
          scene: "private deal-room office at midnight, walnut paneling",
          prop: "open binder of deal docs, brass desk lamp",
          marketMoment: "mid-deal closing crunch",
          expression: "calm_calculating",
          lighting: "amber_desk_lamp",
          cameraAngle: "head_and_shoulders_centered",
          genderPresentation: "feminine",
          apparentAge: "mid_30s",
          appearanceVariant: "fair_auburn_subtle_waves",
          hairstyle: "tight_chignon",
          clothingStyle: "pinstripe_double_breasted",
          accessory: "gold_signet_ring",
        },
      },
      "https://margin-call.example"
    );

    expect(metadata.attributes).toContainEqual({
      trait_type: "Archetype",
      value: "M&A Rainmaker",
    });
  });

  it("adds public portrait traits to NFT attributes", () => {
    const metadata = buildTraderNftMetadata(
      {
        traderId: "trader-4",
        name: "Jordan Cross",
        status: "active",
        portraitStatus: "ready",
        archetype: "Junk Bond Operator",
        riskProfile: "Aggressive",
        tokenId: null,
        profileImageUrl: "https://storage.example/portrait.png",
        traits: {
          archetype: "junk_bond_operator",
          scene: "high-yield bond desk, paper-stacked horizon",
          prop: "thick stapled prospectus, half-empty coffee mug",
          marketMoment: "leveraged-buyout euphoria",
          expression: "sharp_focused",
          lighting: "green_crt_glow",
          cameraAngle: "three_quarter_left",
          genderPresentation: "masculine",
          apparentAge: "mid_40s",
          appearanceVariant: "olive_dark_wavy",
          hairstyle: "slicked_back",
          clothingStyle: "charcoal_three_piece",
          accessory: "no_accessory",
        },
      },
      "https://margin-call.example"
    );

    expect(metadata.attributes).toEqual([
      { trait_type: "Status", value: "active" },
      { trait_type: "Portrait Status", value: "ready" },
      { trait_type: "Archetype", value: "Junk Bond Operator" },
      { trait_type: "Risk Profile", value: "Aggressive" },
      { trait_type: "Gender Presentation", value: "Masculine" },
      { trait_type: "Apparent Age", value: "Mid 40s" },
      { trait_type: "Appearance", value: "Olive Dark Wavy" },
      { trait_type: "Hairstyle", value: "Slicked Back" },
      { trait_type: "Clothing", value: "Charcoal Three Piece" },
      { trait_type: "Accessory", value: "No Accessory" },
      { trait_type: "Expression", value: "Sharp Focused" },
      { trait_type: "Lighting", value: "Green Crt Glow" },
      { trait_type: "Camera", value: "Three Quarter Left" },
      { trait_type: "Market Moment", value: "Leveraged-Buyout Euphoria" },
    ]);
  });
});
