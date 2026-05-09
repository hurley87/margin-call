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
        archetype: "Equity Salesman",
        riskProfile: "Balanced",
        tokenId: 42,
        profileImageUrl: "https://storage.example/portrait.png",
      },
      "https://margin-call.example"
    );

    expect(metadata.image).toBe("https://storage.example/portrait.png");
    expect(metadata.attributes).toContainEqual({
      trait_type: "Token ID",
      value: 42,
    });
  });
});
