import { describe, expect, it } from "vitest";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";
import { buildUniswapSwapUrl } from "@/lib/uniswap/swap-url";

function params(url: string): URLSearchParams {
  const parsed = new URL(url);
  expect(`${parsed.origin}${parsed.pathname}`).toBe(
    "https://app.uniswap.org/swap"
  );
  return parsed.searchParams;
}

describe("buildUniswapSwapUrl", () => {
  it("spends USDC on Base for the selected stock", () => {
    const query = params(
      buildUniswapSwapUrl({
        inputCurrency: baseDeployment.usdc,
        outputCurrency: getAssetByName("NVDAc").stock,
      })
    );

    expect(query.get("chain")).toBe("base");
    expect(query.get("inputCurrency")).toBe(baseDeployment.usdc);
    expect(query.get("outputCurrency")).toBe(getAssetByName("NVDAc").stock);
    expect(query.get("field")).toBe("input");
    expect(query.get("value")).toBeNull();
  });

  it("spends native ETH rather than a wrapped address", () => {
    const query = params(
      buildUniswapSwapUrl({
        inputCurrency: "ETH",
        outputCurrency: getAssetByName("NVDAc").stock,
      })
    );

    expect(query.get("inputCurrency")).toBe("ETH");
    expect(query.get("chain")).toBe("base");
    expect(query.get("field")).toBe("input");
  });

  it("targets each launch asset without hardcoding a per-stock link", () => {
    const outputs = baseDeployment.assets.map(
      (asset) =>
        params(
          buildUniswapSwapUrl({
            inputCurrency: baseDeployment.usdc,
            outputCurrency: asset.stock,
          })
        ).get("outputCurrency") ?? ""
    );

    expect(outputs).toEqual(baseDeployment.assets.map((asset) => asset.stock));
    expect(new Set(outputs).size).toBe(baseDeployment.assets.length);
  });

  it("prefills the input amount only when one is given", () => {
    const withValue = params(
      buildUniswapSwapUrl({
        inputCurrency: baseDeployment.usdc,
        outputCurrency: getAssetByName("AAPLc").stock,
        value: "25.5",
      })
    );
    expect(withValue.get("value")).toBe("25.5");

    const blankValue = params(
      buildUniswapSwapUrl({
        inputCurrency: baseDeployment.usdc,
        outputCurrency: getAssetByName("AAPLc").stock,
        value: "   ",
      })
    );
    expect(blankValue.get("value")).toBeNull();
  });
});
