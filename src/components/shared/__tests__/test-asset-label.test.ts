import { describe, expect, it } from "vitest";
import { ROBINHOOD_TESTNET_SLUG, assetLabel, isTestAsset } from "@/lib/network";

describe("Test Asset labelling", () => {
  it("labels Test Asset fallbacks with Margin Call Test Asset", () => {
    expect(isTestAsset(ROBINHOOD_TESTNET_SLUG, "usdg")).toBe(true);
    expect(assetLabel(ROBINHOOD_TESTNET_SLUG, "usdg")).toMatch(
      /Margin Call Test Asset/
    );
  });

  it("never labels canonical assets as Test Assets", () => {
    expect(isTestAsset(ROBINHOOD_TESTNET_SLUG, "erc6551-registry")).toBe(false);
    expect(assetLabel(ROBINHOOD_TESTNET_SLUG, "erc6551-registry")).not.toMatch(
      /Margin Call Test Asset/
    );
  });
});
