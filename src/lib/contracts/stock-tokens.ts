/**
 * Canonical Stock Token map for Robinhood testnet (mirrors
 * contracts/deployments/robinhood-testnet.stock-tokens.json).
 */

export type StockToken = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
};

export const ROBINHOOD_TESTNET_STOCK_TOKENS: readonly StockToken[] = [
  {
    symbol: "AMZN",
    address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    decimals: 18,
  },
  {
    symbol: "AMD",
    address: "0x71178BAc73cBeb415514eB542a8995b82669778d",
    decimals: 18,
  },
  {
    symbol: "NFLX",
    address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
    decimals: 18,
  },
  {
    symbol: "PLTR",
    address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    decimals: 18,
  },
  {
    symbol: "TSLA",
    address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    decimals: 18,
  },
] as const;

const BY_ADDRESS = new Map(
  ROBINHOOD_TESTNET_STOCK_TOKENS.map((t) => [t.address.toLowerCase(), t])
);

/** Resolve ticker symbol for a Stock Token address, or null if unknown. */
export function stockSymbolForAddress(address: string): string | null {
  return BY_ADDRESS.get(address.toLowerCase())?.symbol ?? null;
}
