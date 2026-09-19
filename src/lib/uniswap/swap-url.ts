const UNISWAP_SWAP_URL = "https://app.uniswap.org/swap";

/** Native ETH is spelled `ETH` in Uniswap links, never the WETH address. */
export type SwapInputCurrency = `0x${string}` | "ETH";

/** Uniswap swap deep link on Base, with the amount read as the input side. */
export function buildUniswapSwapUrl(args: {
  inputCurrency: SwapInputCurrency;
  outputCurrency: `0x${string}`;
  value?: string;
}): string {
  const url = new URL(UNISWAP_SWAP_URL);
  url.searchParams.set("chain", "base");
  url.searchParams.set("inputCurrency", args.inputCurrency);
  url.searchParams.set("outputCurrency", args.outputCurrency);
  url.searchParams.set("field", "input");

  const value = args.value?.trim();
  if (value) url.searchParams.set("value", value);

  return url.toString();
}
