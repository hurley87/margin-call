import { NarrativeEpochSchema, type NarrativeEpoch } from "./_schemas";

export type ValidatedEpoch = NarrativeEpoch;

/**
 * Phrases the wire must never print — lazy AP-wire filler and compliance-memo
 * cadence. Case-insensitive substrings.
 */
export const BANNED_PHRASES = [
  "watch for fallout",
  "market responds with heightened anxiety",
  "heightened anxiety",
  "concerns mount",
  "pressure intensifies",
  "pressure mounts",
  "in a developing story",
  "remains to be seen",
  "only time will tell",
  "sending shockwaves",
];

/**
 * Hardcoded crypto / finance-tech vocabulary — always blocked, independent of
 * the season's forbiddenLanguage, so a misconfigured season can never let it
 * through. Word-boundary matched (so "minted" ≠ "mint", "coined" ≠ "coin").
 */
export const CRYPTO_TERMS = [
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
  "market cap",
  "marketcap",
  "mcap",
  "pump",
  "hodl",
  "airdrop",
  "memecoin",
  "web3",
  "nft",
  "smart contract",
];

/** Promotional words that fail HARNESS (house company) review. */
const PROMO_WORDS = [
  "surge",
  "surges",
  "soar",
  "soars",
  "rocket",
  "explosive",
  "bullish",
  "undervalued",
  "buy",
  "strong buy",
  "winner",
  "best-in-class",
  "unstoppable",
  "moonshot",
  "breakout",
];

function wordRegex(word: string): RegExp {
  return new RegExp(
    `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  );
}

export interface ValidateResult {
  ok: boolean;
  data?: ValidatedEpoch;
  error?: string;
  /** Non-blocking findings surfaced to logs + the external audit. */
  warnings: string[];
}

export function validateEpoch(
  raw: unknown,
  ctx: {
    arcSlugs: Set<string>;
    entitySlugs: Set<string>;
    forbiddenLanguage: string[];
    /** Rounded absolute percentages that legitimately appear (from signals). */
    allowedPercents?: number[];
    /** True when the drop's subject is the house company. */
    subjectIsHouse?: boolean;
  }
): ValidateResult {
  const warnings: string[] = [];
  const result = NarrativeEpochSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message, warnings };
  }
  const data = result.data;

  if (!data.dispatches.some((d) => d.role === "main")) {
    return {
      ok: false,
      error: "At least one dispatch must have role 'main'",
      warnings,
    };
  }

  const seenKeys = new Set<string>();
  for (const d of data.dispatches) {
    if (seenKeys.has(d.dispatchKey)) {
      return {
        ok: false,
        error: `Duplicate dispatchKey: "${d.dispatchKey}"`,
        warnings,
      };
    }
    seenKeys.add(d.dispatchKey);
    if (d.arcSlug && !ctx.arcSlugs.has(d.arcSlug)) {
      return {
        ok: false,
        error: `Unknown arcSlug in dispatch: "${d.arcSlug}"`,
        warnings,
      };
    }
  }

  // entityMentions is a soft continuity hint — filter unknowns rather than fail.
  if (data.entityMentions) {
    data.entityMentions = data.entityMentions.filter((slug) =>
      ctx.entitySlugs.has(slug)
    );
  }

  // Everything the reader sees (prose + tweet) is subject to the hard filters.
  const fullText = [
    data.dropTitle,
    ...data.dispatches.map((d) => `${d.headline} ${d.body}`),
    data.tweetVariant,
  ]
    .join(" ")
    .toLowerCase();

  // Hard: crypto vocabulary (always) + season forbidden language.
  for (const word of [...CRYPTO_TERMS, ...ctx.forbiddenLanguage]) {
    if (wordRegex(word).test(fullText)) {
      return { ok: false, error: `Forbidden language: "${word}"`, warnings };
    }
  }

  // Hard: banned filler phrases.
  for (const phrase of BANNED_PHRASES) {
    if (fullText.includes(phrase)) {
      return { ok: false, error: `Banned phrase: "${phrase}"`, warnings };
    }
  }

  // Soft: number traceability. Every percentage in prose should match a real
  // move within rounding (±1). Surfaced as a warning, not a hard block.
  if (ctx.allowedPercents && ctx.allowedPercents.length > 0) {
    const allowed = new Set(ctx.allowedPercents.map((p) => Math.round(p)));
    const proseOnly = [
      data.dropTitle,
      ...data.dispatches.map((d) => `${d.headline} ${d.body}`),
      data.tweetVariant,
    ].join(" ");
    const pctMatches = proseOnly.match(/[+-]?\d{1,3}\s?%/g) ?? [];
    for (const m of pctMatches) {
      const n = Math.abs(parseInt(m.replace(/[^0-9-]/g, ""), 10));
      if (Number.isNaN(n)) continue;
      const traces = [...allowed].some((a) => Math.abs(a - n) <= 1);
      if (!traces) warnings.push(`untraceable-percent:${n}`);
    }
  }

  // Soft: promotional coverage of the house company.
  if (ctx.subjectIsHouse) {
    for (const word of PROMO_WORDS) {
      if (wordRegex(word).test(fullText)) {
        warnings.push(`house-promotional:${word}`);
      }
    }
  }

  return { ok: true, data, warnings };
}
