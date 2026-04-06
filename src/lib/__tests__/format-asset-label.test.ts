import { describe, expect, it } from "vitest";
import { shortAssetLabel } from "@/lib/format-asset-label";

describe("shortAssetLabel", () => {
  it("keeps up to 3 words", () => {
    expect(shortAssetLabel("quiet auction slot extra")).toBe(
      "quiet auction slot"
    );
  });

  it("strips parentheticals before counting", () => {
    expect(shortAssetLabel("forgery dossier (fast flip)")).toBe(
      "forgery dossier"
    );
  });

  it("trims accidental USDC suffix on name", () => {
    expect(shortAssetLabel("shadow contact $0.3 USDC")).toBe("shadow contact");
  });
});
