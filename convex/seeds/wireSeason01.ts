export type ArcStageSeed =
  | "rumor"
  | "denial"
  | "confirmation"
  | "escalation"
  | "climax"
  | "aftermath"
  | "retired";

export interface EntitySeed {
  slug: string;
  kind: "firm" | "trader" | "regulator" | "politician";
  displayName: string;
  aliases: string[];
  bio: string;
  traits: string[];
  // Code-authoritative firm state (firms only).
  status?: "healthy" | "stressed" | "collapsing" | "dead";
  runningLossUsdc?: number;
  notableFacts?: string[];
}

export interface ArcSeed {
  slug: string;
  title: string;
  summary: string;
  status: "active" | "resolved" | "abandoned";
  tensionScore: number;
  entitySlugs: string[];
  // Code-owned lifecycle start state.
  arcStage?: ArcStageSeed;
  climaxFired?: boolean;
  beatsPublishedByStage?: Record<string, number>;
  templateKey?: string;
  primaryFirmSlug?: string;
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
  tone: "A jaded, gossipy 1980s Wall Street wire columnist who has seen every fraud twice and respects no one. Satirical and darkly funny. Stakes explained through consequence, not jargon — comprehensible to someone with zero finance knowledge.",
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
    "Headline ≤ 12 words. Body 2–4 sentences.",
    "Every post contains a human detail or a joke. Never only numbers and jargon.",
    "Explain stakes through consequence: not 'margin calls intensify' but 'lenders want their money back, in cash, today.'",
    "Punch at greed and incompetence. The reader should feel smarter than everyone in the story.",
    "All numbers come from the provided data. Never invent a figure, total, or event.",
    "No emoji except a leading ⚡ on flash bulletins.",
  ],
  weeklyShape: {
    monday: "Slow open, everyone hungover; rumors circulate, nobody confirms",
    tuesday:
      "Quiet floor; the smart money is repositioning where you can't see",
    wednesday: "Things start to move; someone's story stops adding up",
    thursday: "The regulators are awake and the lawyers are billing",
    friday: "Blowups and forced liquidations; someone gets wiped before lunch",
  },
  entities: [
    {
      slug: "pan-atlantic-holdings",
      kind: "firm",
      displayName: "PanAtlantic Holdings",
      aliases: ["PanAtl.", "PANATL.", "PanAtlantic"],
      bio: "A once-diversified financial holding company that bet heavily on rate cuts that never came. Three leveraged desks blew up. The CEO last spoke publicly from the back of a taxi.",
      traits: ["overleveraged", "silent", "desperate", "connected"],
      status: "collapsing",
      runningLossUsdc: 1_400_000_000,
      notableFacts: [
        "PanAtlantic losses peaked at $1.4B",
        "Three leveraged desks forced to liquidate",
        "SEC froze PanAtlantic's structured-products book",
      ],
    },
    {
      slug: "rourke-capital",
      kind: "firm",
      displayName: "Rourke Capital",
      aliases: ["Rourke", "RC"],
      bio: "Runs a concentrated portfolio of opportunistic positions. Was short PanAtlantic before anyone admitted the problem existed. Staffed by ex-PanAtlantic traders who know exactly where the bodies are buried.",
      traits: ["aggressive", "informed", "short-biased", "discreet"],
      status: "healthy",
      runningLossUsdc: 0,
    },
    {
      slug: "blackwell-co",
      kind: "firm",
      displayName: "Blackwell & Co.",
      aliases: ["Blackwell", "B&C"],
      bio: "One of the last white-shoe investment banks that hasn't modernized. Bond desk has $120M in PanAtlantic exposure they've told no one about. All traders instructed to say 'no comment' about PanAtlantic.",
      traits: ["cautious", "exposed", "reputation-conscious", "opaque"],
      status: "stressed",
      runningLossUsdc: 0,
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
    {
      slug: "castle-securities",
      kind: "firm",
      displayName: "Castle Securities",
      aliases: ["Castle"],
      bio: "A boutique fund whose flagship strategy posts smooth, market-beating returns that never have a down month. Allocators are euphoric. The arithmetic is not.",
      traits: ["opaque", "hyped", "hollow"],
      status: "healthy",
      runningLossUsdc: 0,
      notableFacts: [],
    },
    {
      slug: "reggie-kessler",
      kind: "trader",
      displayName: "Reggie Kessler",
      aliases: ["Kessler"],
      bio: "29 years old, runs Castle Securities, declines to explain the strategy because there isn't one. Wears sunglasses indoors and calls everyone 'champ'.",
      traits: ["young", "smug", "evasive"],
    },
  ],
  arcs: [
    {
      // Has peaked for a week — give it a proper ending and retire it.
      slug: "pan-atlantic-blowup",
      title: "PanAtlantic blow-up",
      summary:
        "PanAtlantic is over. Three desks liquidated, $1.4B gone, the CEO doing interviews from a taxi. All that's left is the wake — who gets bought for $1, who takes the assumed liabilities, and who quietly slips out the back.",
      status: "active",
      tensionScore: 3,
      entitySlugs: [
        "pan-atlantic-holdings",
        "rourke-capital",
        "blackwell-co",
        "marty-vale",
      ],
      arcStage: "aftermath",
      climaxFired: true,
      // One aftermath beat published (quota 2) → one more beat then retires.
      beatsPublishedByStage: {
        rumor: 2,
        denial: 1,
        confirmation: 1,
        escalation: 2,
        climax: 1,
        aftermath: 1,
      },
      primaryFirmSlug: "pan-atlantic-holdings",
    },
    {
      // Concluded — kept for backstory, not a live arc.
      slug: "mercer-investigation",
      title: "Mercer investigation",
      summary:
        "SEC investigator Diane Mercer wrapped her probe of PanAtlantic's deal flow. The indictments she's famous for are reportedly being drafted. The floor has moved on; the lawyers have not.",
      status: "resolved",
      tensionScore: 0,
      entitySlugs: ["diane-mercer", "blackwell-co", "pan-atlantic-holdings"],
      arcStage: "retired",
      climaxFired: true,
    },
    {
      // Fresh rumor-stage arc so the season opens with two live arcs at
      // different stages (PanAtlantic aftermath + this rumor).
      slug: "boy-genius-castle-securities",
      title: "Castle Securities posts impossible returns",
      summary:
        "Reggie Kessler's Castle Securities never has a down month, which is exactly the problem. Allocators are piling in. A few people who can do arithmetic are starting to ask questions.",
      status: "active",
      tensionScore: 3,
      entitySlugs: ["castle-securities", "reggie-kessler"],
      arcStage: "rumor",
      climaxFired: false,
      beatsPublishedByStage: {},
      templateKey: "boy-genius-fraud",
      primaryFirmSlug: "castle-securities",
    },
  ],
  initialDrop: {
    dropTitle: "THE WAKE",
    dispatches: [
      {
        headline: "PanAtlantic is dead; nobody is sad",
        body: "PanAtlantic Holdings finished the week $1.4B in the hole and out of excuses. Rourke Capital, short the whole way down, is reportedly buying the desks for a dollar and the assumed liabilities. The CEO could not be reached, last seen explaining things from a taxi.",
        category: "wire",
        role: "main",
        arcSlug: "pan-atlantic-blowup",
      },
    ],
    worldState: { mood: "hungover", sec_heat: 5 },
  },
};
