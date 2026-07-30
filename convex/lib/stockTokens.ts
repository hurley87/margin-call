const TOKENS: Record<string, string> = {
  "0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02": "AMZN",
  "0x71178bac73cbeb415514eb542a8995b82669778d": "AMD",
  "0x3b8262a63d25f0477c4dde23f83cfe22cb768c93": "NFLX",
  "0x1fbe1a0e43594b3455993b5de5fd0a7a266298d0": "PLTR",
  "0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e": "TSLA",
};

export function stockSymbolForAddress(address: string): string | null {
  return TOKENS[address.toLowerCase()] ?? null;
}
