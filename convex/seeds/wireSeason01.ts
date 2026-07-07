/**
 * Wire season seed. Under the rebuilt engine the season carries only the tone,
 * style rules, forbidden language, and weekly shape — the "companies" are the
 * real registry tokens (tokens.json), synced into narrativeEntities by
 * registrySync, and arcs are spawned from real price/player streaks. No
 * fictional firms, characters, or seeded arcs.
 */

export interface SeasonSeed {
  seasonKey: string;
  title: string;
  weekRange: { start: number; end: number };
  tone: string;
  forbiddenLanguage: string[];
  styleRules: string[];
  weeklyShape: Record<string, string>;
}

// Week of 2026-07-06 (Mon) → 2026-07-10 (Fri)
const WEEK_START = new Date("2026-07-06T09:30:00-04:00").getTime();
const WEEK_END = new Date("2026-07-10T16:00:00-04:00").getTime();

/** Crypto / finance-tech vocabulary the wire must never print. */
export const CRYPTO_FORBIDDEN_LANGUAGE = [
  "token",
  "tokens",
  "coin",
  "coins",
  "crypto",
  "cryptocurrency",
  "blockchain",
  "onchain",
  "on-chain",
  "wallet",
  "wallets",
  "defi",
  "dex",
  "liquidity",
  "market cap",
  "marketcap",
  "mcap",
  "pump",
  "dump",
  "moon",
  "hodl",
  "airdrop",
  "staking",
  "mint",
  "minting",
  "gas fees",
  "gwei",
  "rollup",
  "memecoin",
  "web3",
  "nft",
  "smart contract",
  "protocol",
];

export const wireSeason: SeasonSeed = {
  seasonKey: "listed-companies-01",
  title: "The Listed Companies",
  weekRange: { start: WEEK_START, end: WEEK_END },
  tone: "A jaded 1980s stock-wire gossip columnist covering a handful of listed companies. Darkly funny, comprehensible to someone with zero finance knowledge, stakes explained through consequence, never jargon.",
  forbiddenLanguage: CRYPTO_FORBIDDEN_LANGUAGE,
  styleRules: [
    "Headline ≤ 12 words. Body 2–3 sentences.",
    "No modern/finance-tech vocabulary. These are companies; holdings are shares or common stock. Use the floor, the tape, the bell, the close, block trades, analysts, 'could not be reached for comment.'",
    "No named fictional humans. The narrator is the anonymous desk voice (the floor, the desk, sources, the interns). Companies may be personified; people may not be invented.",
    "Every company story cites a real number from the tape. The move is real; the explanation is invented and absurd.",
    "Reactive only: explain moves that already happened. Never imply something is about to happen; never attach a rumor to a company with no real move.",
    "Absurd, not plausible. Invented color lives in the wire's world (the interns, the payphone, the coffee cart). Never invent a realistic company/finance event — deals, launches, listings, partnerships, investigations, insolvency — even as a joke.",
    "Real accounts and people appear only via actual public statements provided to you; never invent quotes, actions, or intentions.",
    "The house company gets harder, self-deprecating, never-promotional coverage.",
    "No emoji except a leading ⚡ on flash bulletins.",
  ],
  weeklyShape: {
    monday: "Slow open, everyone hungover; the tape barely moves",
    tuesday: "Quiet floor; positions shuffle where you can't see",
    wednesday: "Things start to move; a name or two catches a bid or a cold",
    thursday: "The floor is awake and loud; somebody's up, somebody's down",
    friday:
      "Whatever's been building finishes the week with a bang or a whimper",
  },
};

/** Back-compat alias for existing imports. */
export const season01 = wireSeason;
