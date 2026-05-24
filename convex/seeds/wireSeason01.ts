export interface EntitySeed {
  slug: string;
  kind: "firm" | "trader" | "regulator" | "politician";
  displayName: string;
  aliases: string[];
  bio: string;
  traits: string[];
}

export interface ArcSeed {
  slug: string;
  title: string;
  summary: string;
  status: "active" | "resolved" | "abandoned";
  tensionScore: number;
  entitySlugs: string[];
}

export interface DispatchSeed {
  headline: string;
  body: string;
  category: string;
  role: "main" | "supporting";
  arcSlug: string;
}

export interface InitialDropSeed {
  dropTitle: string;
  dispatches: DispatchSeed[];
  worldState: { mood: string; sec_heat: number };
}

export interface SeasonSeed {
  seasonKey: string;
  title: string;
  weekRange: { start: number; end: number };
  tone: string;
  forbiddenLanguage: string[];
  styleRules: string[];
  weeklyShape: Record<string, string>;
  entities: EntitySeed[];
  arcs: ArcSeed[];
  initialDrop: InitialDropSeed;
}

// Week of 2026-05-04 (Mon) → 2026-05-08 (Fri)
const WEEK_START = new Date("2026-05-04T09:30:00-04:00").getTime();
const WEEK_END = new Date("2026-05-08T16:00:00-04:00").getTime();

export const season01: SeasonSeed = {
  seasonKey: "season-01",
  title: "The PanAtlantic Collapse",
  weekRange: { start: WEEK_START, end: WEEK_END },
  tone: "Paranoid, predatory, terse. 1980s Wall Street financial thriller. Every dispatch implies danger. Funny, never goofy.",
  forbiddenLanguage: [
    "DeFi",
    "rug",
    "wagmi",
    "wen moon",
    "L2",
    "gas fees",
    "leveraged buyout synergies",
    "exciting opportunity",
    "paradigm shift",
    "stakeholders",
    "going forward",
    "algorithm",
    "machine learning",
    "AI",
  ],
  styleRules: [
    "Headlines: ~100 chars max. Terse. Present tense.",
    "Bodies: ~180 chars max. One to three sentences.",
    "No emoji. No ellipses for drama.",
    "Sentences end in facts, not adjectives. 'Down $340M.' Not 'in bad shape.'",
    "Floor Talk dispatches quote Marty Vale directly when he is the source.",
    "Every dispatch must imply a player action: exploit, create, avoid, or watch.",
  ],
  weeklyShape: {
    monday: "Rumors circulate; nobody confirms anything",
    tuesday: "Cracks appear in the official story",
    wednesday: "Full mania; everyone knows something is wrong",
    thursday: "SEC pressure mounts; desks go quiet",
    friday: "Blowups. Forced liquidations. Someone gets wiped.",
  },
  entities: [
    {
      slug: "pan-atlantic-holdings",
      kind: "firm",
      displayName: "PanAtlantic Holdings",
      aliases: ["PanAtl.", "PANATL.", "PanAtlantic"],
      bio: "A once-diversified financial holding company that bet heavily on rate cuts that never came. Three leveraged desks under margin pressure. CEO has not spoken publicly in eleven days.",
      traits: ["overleveraged", "silent", "desperate", "connected"],
    },
    {
      slug: "rourke-capital",
      kind: "firm",
      displayName: "Rourke Capital",
      aliases: ["Rourke", "RC"],
      bio: "Runs a concentrated portfolio of opportunistic positions. Was short PanAtlantic before anyone admitted the problem existed. Staffed by ex-PanAtlantic traders who know exactly where the bodies are buried.",
      traits: ["aggressive", "informed", "short-biased", "discreet"],
    },
    {
      slug: "blackwell-co",
      kind: "firm",
      displayName: "Blackwell & Co.",
      aliases: ["Blackwell", "B&C"],
      bio: "One of the last white-shoe investment banks that hasn't modernized. Bond desk has $120M in PanAtlantic exposure they've told no one about. All traders instructed to say 'no comment' about PanAtlantic.",
      traits: ["cautious", "exposed", "reputation-conscious", "opaque"],
    },
    {
      slug: "diane-mercer",
      kind: "regulator",
      displayName: "Diane Mercer",
      aliases: ["Mercer"],
      bio: "SEC investigator who ran the Drexel probe in the mid-80s. She doesn't announce investigations — she announces indictments. Her desk has subpoenaed records from at least four firms.",
      traits: ["methodical", "patient", "dangerous", "connected"],
    },
    {
      slug: "marty-vale",
      kind: "trader",
      displayName: "Marty Vale",
      aliases: ["Vale", "Marty"],
      bio: "Floor trader with fifteen years on the pit. Been right three times before the market moved and is currently right about PanAtlantic. Nobody knows how he knows things. He broadcasts everything.",
      traits: ["loud", "well-connected", "usually right", "indiscreet"],
    },
  ],
  arcs: [
    {
      slug: "pan-atlantic-blowup",
      title: "PanAtlantic blow-up",
      summary:
        "PanAtlantic Holdings squeezed by margin calls on three overleveraged desks. Rourke Capital building a short position. CEO silent eleven days. Market waiting for the forced liquidation event.",
      status: "active",
      tensionScore: 7,
      entitySlugs: [
        "pan-atlantic-holdings",
        "rourke-capital",
        "blackwell-co",
        "marty-vale",
      ],
    },
    {
      slug: "mercer-investigation",
      title: "Mercer investigation widens",
      summary:
        "SEC investigator Diane Mercer has widened her probe of suspicious deal flow connected to PanAtlantic structured products filings. Subpoenas have reached at least four counterparty firms. No public announcement.",
      status: "active",
      tensionScore: 5,
      entitySlugs: ["diane-mercer", "blackwell-co", "pan-atlantic-holdings"],
    },
  ],
  initialDrop: {
    dropTitle: "MARGIN CALLED",
    dispatches: [
      {
        headline:
          "PANATL. SERVED MARGIN NOTICE — THREE DESKS FORCED TO LIQUIDATE BY 16:00",
        body: "PanAtlantic Holdings hit with intraday margin notice across three desks. Shortfall estimated at $340M. Rourke Capital seen moving against PanAtlantic's book since the open.",
        category: "breaking",
        role: "main",
        arcSlug: "pan-atlantic-blowup",
      },
    ],
    worldState: { mood: "tense", sec_heat: 6 },
  },
};
