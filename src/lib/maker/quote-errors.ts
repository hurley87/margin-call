import { BaseError, ContractFunctionRevertedError } from "viem";

const quoteErrorMessages: Record<string, string> = {
  FeedStale: "Testnet price is stale — operator action is required",
  FeedPaused: "Testnet price feed is paused",
  FeedInvalid: "Testnet price feed is marked invalid",
  FeedZeroPrice: "Testnet price feed returned zero",
  AssetNotListed: "Stock Token is not listed for Pack pricing",
  AssetNotInPriceBasket:
    "Stock Token is not currently eligible for Pack pricing",
};

export function describeAssetRegistryQuoteError(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError
    );
    if (revert instanceof ContractFunctionRevertedError) {
      const errorName = revert.data?.errorName;
      if (errorName && quoteErrorMessages[errorName]) {
        return quoteErrorMessages[errorName];
      }
    }
  }

  return "Testnet quote unavailable — check the network connection and try again";
}
