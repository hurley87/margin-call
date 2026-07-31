import { assetRegistryAbi } from "@margin-call/shared";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Address,
} from "viem";
import { describe, expect, it } from "vitest";

import { describeAssetRegistryQuoteError } from "./quote-errors";

const TOKEN = "0x0000000000000000000000000000000000000001" as Address;

function reverted(
  errorName:
    | "FeedStale"
    | "FeedPaused"
    | "FeedInvalid"
    | "FeedZeroPrice"
    | "AssetNotListed"
    | "AssetNotInPriceBasket",
  args: readonly unknown[]
) {
  return new ContractFunctionRevertedError({
    abi: assetRegistryAbi,
    data: encodeErrorResult({
      abi: assetRegistryAbi,
      errorName,
      args: args as never,
    }),
    functionName: "quote",
  });
}

describe("AssetRegistry quote errors", () => {
  it.each([
    [
      reverted("FeedStale", [TOKEN, 1n, 3_600n, 3_602n]),
      "Testnet price is stale — operator action is required",
    ],
    [reverted("FeedPaused", [TOKEN]), "Testnet price feed is paused"],
    [reverted("FeedInvalid", [TOKEN]), "Testnet price feed is marked invalid"],
    [reverted("FeedZeroPrice", [TOKEN]), "Testnet price feed returned zero"],
    [reverted("AssetNotListed", [TOKEN]), "Stock Token is not listed"],
    [
      reverted("AssetNotInPriceBasket", [TOKEN, 2]),
      "Stock Token is not currently eligible",
    ],
  ])("maps a decoded custom error", (error, message) => {
    expect(describeAssetRegistryQuoteError(error)).toContain(message);
  });

  it("keeps transport failures distinct from feed failures", () => {
    expect(describeAssetRegistryQuoteError(new Error("RPC unavailable"))).toBe(
      "Testnet quote unavailable — check the network connection and try again"
    );
  });

  it("finds the decoded error inside viem's readContract wrapper", () => {
    const error = new ContractFunctionExecutionError(
      reverted("FeedPaused", [TOKEN]),
      {
        abi: assetRegistryAbi,
        args: [TOKEN, 1n],
        contractAddress: TOKEN,
        functionName: "quote",
      }
    );

    expect(describeAssetRegistryQuoteError(error)).toBe(
      "Testnet price feed is paused"
    );
  });
});
