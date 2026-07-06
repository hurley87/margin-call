// v4 portrait system — two-ink screenprint noir NFT collection.
//
// Pipeline: a random seed is minted at trader creation and stored on the row
// (convex/traders.ts). All trait derivation is a PURE function of that stored
// seed — same seed ⇒ same traits ⇒ same prompt, forever. gpt-image-1 renders
// the composed prompt (no reference/edit conditioning).
//
// Sources of truth: scratchpad/review5.html (locked style + pinned hex),
// review6.html (approved rarity weights/tiers/odds), review7.html (the four
// Phase-2 redesigned values + the hardened no-text clause). Weights are
// PERMANENT post-launch — see docs/portrait-rarity-v4.md.

export const PORTRAIT_METADATA_VERSION = 4;

export type PortraitTier = "Common" | "Uncommon" | "Rare" | "Legendary";

const TIER_RANK: Record<PortraitTier, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Legendary: 3,
};

// ─── Surfaced trait slots (the 5 that appear in metadata) ────────────────────

export type PublicPortraitTraits = {
  expression: string;
  fieldInk: string;
  attire: string;
  vice: string;
  fieldFlourish: string;
};

type SurfacedSlotKey = keyof PublicPortraitTraits;

const PUBLIC_TRAIT_KEYS = [
  "expression",
  "fieldInk",
  "attire",
  "vice",
  "fieldFlourish",
] as const satisfies readonly SurfacedSlotKey[];

type TraitValue = {
  id: string;
  /** Display label — PERMANENT once minted (baked into tokenURI). */
  label: string;
  /** Designed odds within the slot, as a percentage (sums to 100 per slot). */
  weight: number;
  tier: PortraitTier;
  /** Prompt fragment describing the trait; `null` = adds nothing to the prompt. */
  prompt: string | null;
};

// Weights/tiers verbatim from review6; the four redesigned display names +
// prompt fragments (Gold Leaf, Cigarette Bouquet, Champagne Coupe, Bold Ticker
// Bands) from review7. Prompt fragments ported from scratchpad/gen9_roster.py.

export const EXPRESSIONS: readonly TraitValue[] = [
  {
    id: "cold",
    label: "Cold Detached",
    weight: 32.6,
    tier: "Common",
    prompt: "a cold detached stare",
  },
  {
    id: "sharp",
    label: "Sharp Focused",
    weight: 26.2,
    tier: "Common",
    prompt: "a sharp focused predatory gaze, brows slightly lowered",
  },
  {
    id: "tense",
    label: "Tense Alert",
    weight: 22.0,
    tier: "Common",
    prompt: "a tense alert wary look",
  },
  {
    id: "predatory",
    label: "Predatory Grin",
    weight: 12.0,
    tier: "Uncommon",
    prompt: "a wide predatory grin, teeth showing, cold eyes",
  },
  {
    id: "smirk",
    label: "Confident Smirk",
    weight: 6.5,
    tier: "Uncommon",
    prompt: "a confident one-sided smirk",
  },
  {
    id: "manic",
    label: "Manic Laugh",
    weight: 0.7,
    tier: "Rare",
    prompt:
      "head tipped back in a manic wide-eyed open-mouthed laugh, teeth bared",
  },
] as const;

// Field Ink prompt fragments describe the flat background field + accent ink.
export const FIELD_INKS: readonly TraitValue[] = [
  {
    id: "vermilion",
    label: "Vermilion",
    weight: 24.75,
    tier: "Common",
    prompt: "vermilion #DD3B1C",
  },
  {
    id: "cobalt",
    label: "Cobalt",
    weight: 24.75,
    tier: "Common",
    prompt: "cobalt #2A4BD0",
  },
  {
    id: "ochre",
    label: "Ochre",
    weight: 24.75,
    tier: "Common",
    prompt: "ochre #C89012",
  },
  {
    id: "teal",
    label: "Teal",
    weight: 24.75,
    tier: "Common",
    prompt: "teal #147A6E",
  },
  {
    id: "silver",
    label: "Burnished Silver",
    weight: 0.5,
    tier: "Rare",
    prompt:
      "a flat cool burnished-silver grey (single flat metallic-grey tone, not a shiny gradient)",
  },
  {
    id: "goldleaf",
    label: "Gold Leaf",
    weight: 0.5,
    tier: "Legendary",
    prompt:
      "a lustrous METALLIC GOLD-LEAF field — burnished gold foil with clear sheen and darker gold shading, unmistakably shiny gold, NOT flat ochre/amber (this legendary breaks the flat-field rule)",
  },
] as const;

/** Deep-skin mints are constrained to warm inks (review5 locked rule). */
const WARM_INK_IDS = new Set(["vermilion", "ochre", "goldleaf"]);

export const ATTIRE: readonly TraitValue[] = [
  {
    id: "business",
    label: "Business Suit",
    weight: 42.0,
    tier: "Common",
    prompt: "a plain business suit with lapels and tie",
  },
  {
    id: "braces",
    label: "Shirt-sleeves & Braces",
    weight: 20.0,
    tier: "Common",
    prompt: "a dress shirt and tie with bold suspenders/braces",
  },
  {
    id: "jacket",
    label: "Trading Jacket",
    weight: 16.0,
    tier: "Common",
    prompt:
      "a floor-trader's jacket rendered in the accent ink (not a second color) over a cream shirt and tie",
  },
  {
    id: "tuxedo",
    label: "Tuxedo",
    weight: 10.0,
    tier: "Uncommon",
    prompt: "a black tuxedo with bow tie and wing collar",
  },
  {
    id: "fur",
    label: "Fur-Collar Overcoat",
    weight: 11.0,
    tier: "Uncommon",
    prompt: "an opulent fur-collared overcoat over a suit",
  },
  {
    id: "goldthread",
    label: "Gold-Threaded Power Suit",
    weight: 1.0,
    tier: "Rare",
    prompt:
      "a power suit with bold gold-thread pinstripes woven through the fabric",
  },
] as const;

export const VICES: readonly TraitValue[] = [
  { id: "none", label: "None", weight: 79.9, tier: "Common", prompt: null },
  {
    id: "unlitcig",
    label: "Unlit Cigarette",
    weight: 11.0,
    tier: "Uncommon",
    prompt: "an unlit cigarette held at the lips, no smoke",
  },
  {
    id: "cigar",
    label: "Cigar",
    weight: 7.0,
    tier: "Uncommon",
    prompt: "a fat cigar clenched in the teeth, no smoke",
  },
  {
    id: "litcigar",
    label: "Lit Cigar",
    weight: 1.0,
    tier: "Rare",
    prompt: "a lit cigar at the lips with a curl of cream smoke rising",
  },
  {
    id: "martini",
    label: "Martini",
    weight: 0.6,
    tier: "Rare",
    prompt: "one hand raised holding a stemmed martini glass",
  },
  {
    id: "cigbouquet",
    label: "Cigarette Bouquet",
    weight: 0.3,
    tier: "Legendary",
    prompt:
      "a ridiculous fistful of five or more lit cigarettes fanned at the mouth, every tip glowing, smoke rising",
  },
  {
    id: "coupe",
    label: "Champagne Coupe",
    weight: 0.2,
    tier: "Legendary",
    prompt:
      "raising a wide champagne coupe overflowing with foam and bubbles spilling over the rim, in a toast",
  },
] as const;

export const FIELD_FLOURISHES: readonly TraitValue[] = [
  {
    id: "plain",
    label: "Plain Field",
    weight: 85.4,
    tier: "Common",
    prompt: null,
  },
  {
    id: "halftone",
    label: "Halftone Dot Wash",
    weight: 12.0,
    tier: "Uncommon",
    prompt: "a subtle halftone dot texture across the flat field",
  },
  {
    id: "tickerbold",
    label: "Bold Ticker Bands",
    weight: 1.6,
    tier: "Rare",
    prompt:
      "several bold distinct pale horizontal ticker-tape bands running clearly across the flat field (blank shapes)",
  },
  {
    id: "confetti",
    label: "Confetti Storm",
    weight: 1.0,
    tier: "Legendary",
    prompt:
      "the flat field filled with falling ticker-tape confetti streamers as bold graphic shapes",
  },
] as const;

/** Ordered slot definitions: derivation category + surfaced key + display label. */
export const SURFACED_SLOTS = [
  { key: "expression", label: "Expression", pool: EXPRESSIONS },
  { key: "fieldInk", label: "Field Ink", pool: FIELD_INKS },
  { key: "attire", label: "Attire", pool: ATTIRE },
  { key: "vice", label: "Vice", pool: VICES },
  { key: "fieldFlourish", label: "Field Flourish", pool: FIELD_FLOURISHES },
] as const satisfies readonly {
  key: SurfacedSlotKey;
  label: string;
  pool: readonly TraitValue[];
}[];

/** id → {label, tier, weight} per slot. Single source for metadata + display. */
export const TRAIT_META: Record<
  SurfacedSlotKey,
  Record<string, { label: string; tier: PortraitTier; weight: number }>
> = Object.fromEntries(
  SURFACED_SLOTS.map((slot) => [
    slot.key,
    Object.fromEntries(
      slot.pool.map((v) => [
        v.id,
        { label: v.label, tier: v.tier, weight: v.weight },
      ])
    ),
  ])
) as Record<
  SurfacedSlotKey,
  Record<string, { label: string; tier: PortraitTier; weight: number }>
>;

// ─── Seed-only demographic inputs (shape the face, NEVER surfaced) ───────────

type DemographicValue = {
  id: string;
  label: string;
  weight: number;
  prompt: string;
};

const SKIN: readonly DemographicValue[] = [
  {
    id: "fair",
    label: "Fair",
    weight: 40,
    prompt: "face ~80% cream with hard black shadow shapes; no accent on skin.",
  },
  {
    id: "mid",
    label: "Mid",
    weight: 40,
    prompt:
      "face ~55% cream, ~45% hard black shadow shapes, a few accent hatch strokes on cheek/jaw.",
  },
  {
    id: "deep",
    label: "Deep",
    weight: 20,
    prompt:
      "face flat black base + cream highlight planes + the warm accent as midtone; no brown.",
  },
] as const;

const GENDERS: readonly DemographicValue[] = [
  { id: "masculine", label: "Masculine", weight: 55, prompt: "man" },
  { id: "feminine", label: "Feminine", weight: 45, prompt: "woman" },
] as const;

const AGES: readonly DemographicValue[] = [
  { id: "20s", label: "Late 20s", weight: 20, prompt: "late 20s" },
  { id: "30s", label: "Mid 30s", weight: 30, prompt: "mid 30s" },
  { id: "40s", label: "Mid 40s", weight: 30, prompt: "mid 40s" },
  { id: "50s", label: "Late 50s", weight: 20, prompt: "late 50s" },
] as const;

// ─── Hashing + weighted selection (pure, deterministic) ──────────────────────

export function getPortraitPromptVersion(source: unknown): number {
  if (
    typeof source === "object" &&
    source !== null &&
    "version" in source &&
    typeof (source as { version: unknown }).version === "number"
  ) {
    return (source as { version: number }).version;
  }
  return 0;
}

export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function subHash(baseHash: number, category: string): number {
  return stableHash(`${baseHash.toString(36)}:${category}`);
}

export function pickFrom<T>(pool: readonly T[], hash: number): T {
  return pool[hash % pool.length];
}

/**
 * Deterministic weighted selection. Weights are scaled ×100 to integers (all
 * table weights are exact at ≤2 decimals) so the walk is pure integer math —
 * no float drift, identical on every platform. An empty pool falls back to the
 * provided fallback (deep-skin ink-filter safety); if that is empty too, throws.
 */
export function weightedPick<T extends { weight: number }>(
  pool: readonly T[],
  hash: number,
  fallback?: readonly T[]
): T {
  const effective = pool.length > 0 ? pool : (fallback ?? []);
  if (effective.length === 0) {
    throw new Error("weightedPick: empty pool and no fallback");
  }
  const scaled = effective.map((item) => Math.round(item.weight * 100));
  const total = scaled.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return effective[0];
  let r = hash % total;
  for (let i = 0; i < effective.length; i++) {
    r -= scaled[i];
    if (r < 0) return effective[i];
  }
  return effective[effective.length - 1];
}

// ─── Prompt composition (two-ink screenprint noir) ───────────────────────────

// Style + layout ported verbatim from scratchpad/gen9_roster.py.
const STYLE =
  "ART DIRECTION — TWO-INK SCREENPRINT NOIR (locked). Saul Bass silkscreen poster: bold hard-edged flat shapes, " +
  "three tones only — cream #EFE6D0, black #17140F, and one accent ink. No gradients, no soft shading, no hatching to " +
  "model form; only flat shape blocks + subtle flat ink grain. STRICT PALETTE: all wardrobe, props and accessories use " +
  "ONLY those three tones — cream, black, and the single accent ink; NEVER introduce a second color anywhere (a jacket, " +
  "tie, collar or prop is cream, black, or the accent — nothing else). HAIR always a solid black mass; blond/grey/auburn " +
  "shown only as cream highlight strands, never as a yellow, gold, ochre or brown ink.";

const LAYOUT =
  "LAYOUT: square. Uniform cream (#EFE6D0) border on the outer ~6%, thin black keyline just inside the field edge, " +
  "crisp edges — no vignette/glow/bevel. Tight forward head-and-shoulders bust, centered at identical scale: hair near " +
  "field top, eyes upper-middle, chin ~two-thirds down, shoulders exiting the bottom.";

// Hardened exclusion block (review7 fix for the gold-leaf "1987" leak). This is
// the exclusion guardrail — it must never be weakened. NOTE: v4 intentionally
// has a cream border frame (review5), so the old v3 "No border." clause is
// deliberately dropped; the border is verified flat post-generation instead.
const EXCLUSIONS =
  "ABSOLUTELY NO readable text, numerals, letters, dates, years, ticker symbols, denominations, signatures, badges, " +
  "captions, logos, watermarks or UI anywhere — no '1987', no numbers on lapels or fields. Ticker-tape and confetti are " +
  "blank graphic shapes only. No modern devices, no cryptocurrency imagery. Keep the dark 1987 Wall Street satire in " +
  "imagery, never in text. The trader's name and internal seed must not appear visually in the image.";

const INTRO =
  "Create one square collectible trader-character portrait for the PvP game Margin Call — one entry in a unified " +
  "NFT collection where art style, palette, ink and composition are IDENTICAL across the set.";

type ComposeInput = {
  skin: DemographicValue;
  gender: DemographicValue;
  age: DemographicValue;
  expression: TraitValue;
  fieldInk: TraitValue;
  attire: TraitValue;
  vice: TraitValue;
  fieldFlourish: TraitValue;
};

// Plain color words per accent, used to bind a colored garment (the trading
// jacket) to the actual accent so gpt-image-1 can't default it to its own hue.
const ACCENT_WORD: Record<string, string> = {
  vermilion: "vermilion red",
  cobalt: "cobalt blue",
  ochre: "ochre gold-brown",
  teal: "teal",
  silver: "black",
  goldleaf: "black",
};

function composePrompt(input: ComposeInput): string {
  const inkPrompt = input.fieldInk.prompt ?? input.fieldInk.label;
  // Metallic inks (silver/goldleaf) describe the whole field; flat inks are "a flat X field".
  const fieldline =
    input.fieldInk.id === "silver" || input.fieldInk.id === "goldleaf"
      ? inkPrompt
      : `a flat ${inkPrompt} field`;
  const flourPrompt = input.fieldFlourish.prompt;
  const vicePrompt = input.vice.prompt;

  // The trading jacket has a strong "bright red/orange" prior — bind it to the
  // exact accent color so the tile never carries a second ink.
  const attirePrompt =
    input.attire.id === "jacket"
      ? `a floor-trader's jacket that is a single flat block of ${ACCENT_WORD[input.fieldInk.id] ?? "the accent color"} — the SAME accent as the field, with no second color — over a cream shirt and black tie`
      : input.attire.prompt;

  const parts: string[] = [
    INTRO,
    STYLE,
    `${LAYOUT} The background is ${fieldline}.` +
      (flourPrompt
        ? ""
        : " The field is a single flat solid color, no graphics."),
    `SUBJECT: a ${input.age.prompt} ${input.gender.prompt}. SKIN: ${input.skin.prompt} ` +
      `EXPRESSION: ${input.expression.prompt}. ATTIRE: ${attirePrompt}.` +
      (vicePrompt ? "" : " No hands, no held objects, no props."),
  ];
  if (vicePrompt) {
    parts.push(
      `PROP (this rare/legendary mint breaks the no-prop rule): ${vicePrompt}.`
    );
  }
  if (flourPrompt) {
    parts.push(`FIELD FLOURISH: ${flourPrompt}.`);
  }
  parts.push(EXCLUSIONS);
  return parts.join("\n\n");
}

// ─── Public read projection ──────────────────────────────────────────────────

export function readPublicTraits(source: unknown): PublicPortraitTraits | null {
  if (
    typeof source !== "object" ||
    source === null ||
    !("traits" in source) ||
    typeof (source as { traits: unknown }).traits !== "object" ||
    (source as { traits: unknown }).traits === null
  ) {
    return null;
  }

  const traits = (source as { traits: Record<string, unknown> }).traits;
  const publicTraits = {} as Record<SurfacedSlotKey, string>;
  for (const key of PUBLIC_TRAIT_KEYS) {
    const value = traits[key];
    if (typeof value !== "string") return null;
    publicTraits[key] = value;
  }
  return publicTraits;
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────

function tierOf(slot: SurfacedSlotKey, id: string): PortraitTier {
  return TRAIT_META[slot][id]?.tier ?? "Common";
}

/** Overall mint rarity = the highest tier across the 5 surfaced slots. */
export function resolveTierFromTraitIds(
  traits: PublicPortraitTraits
): PortraitTier {
  let best: PortraitTier = "Common";
  for (const key of PUBLIC_TRAIT_KEYS) {
    const t = tierOf(key, traits[key]);
    if (TIER_RANK[t] > TIER_RANK[best]) best = t;
  }
  return best;
}

// ─── Derivation entry points ──────────────────────────────────────────────────

type Demographic = { skin: string; gender: string; age: string };

function byId<T extends { id: string }>(pool: readonly T[], id: string): T {
  return pool.find((v) => v.id === id) ?? pool[0];
}

/**
 * Recompose the prompt from already-derived, stored trait + demographic ids.
 * Used by the reseed path so a version bump can evolve prompt TEXT without ever
 * re-rolling trait IDENTITY — the inviolable-determinism guarantee.
 */
export function composePromptFromStored(
  traits: PublicPortraitTraits,
  demographic: Demographic
): string {
  return composePrompt({
    skin: byId(SKIN, demographic.skin),
    gender: byId(GENDERS, demographic.gender),
    age: byId(AGES, demographic.age),
    expression: byId(EXPRESSIONS, traits.expression),
    fieldInk: byId(FIELD_INKS, traits.fieldInk),
    attire: byId(ATTIRE, traits.attire),
    vice: byId(VICES, traits.vice),
    fieldFlourish: byId(FIELD_FLOURISHES, traits.fieldFlourish),
  });
}

/**
 * Pure derivation from a stored random seed. Only `seed` feeds the hash; name /
 * mandate / personality are provenance-only (written to imagePromptSource, never
 * hashed) so traits never change when a trader is renamed or reconfigured.
 */
export function buildPortraitSeed(args: {
  seed: string;
  name?: string;
  mandate?: unknown;
  personality?: string;
}) {
  const baseHash = stableHash(args.seed);

  // Demographic (seed-only) — picked from its own categories first.
  const skin = weightedPick(SKIN, subHash(baseHash, "skin"));
  const gender = weightedPick(GENDERS, subHash(baseHash, "gender"));
  const age = weightedPick(AGES, subHash(baseHash, "age"));

  // Surfaced slots — each from an independent category (order-independent).
  const expression = weightedPick(EXPRESSIONS, subHash(baseHash, "expression"));
  const inkPool =
    skin.id === "deep"
      ? FIELD_INKS.filter((ink) => WARM_INK_IDS.has(ink.id))
      : FIELD_INKS;
  const fieldInk = weightedPick(
    inkPool,
    subHash(baseHash, "fieldInk"),
    FIELD_INKS
  );
  const attire = weightedPick(ATTIRE, subHash(baseHash, "attire"));
  const vice = weightedPick(VICES, subHash(baseHash, "vice"));
  const fieldFlourish = weightedPick(
    FIELD_FLOURISHES,
    subHash(baseHash, "fieldFlourish")
  );

  const traits: PublicPortraitTraits = {
    expression: expression.id,
    fieldInk: fieldInk.id,
    attire: attire.id,
    vice: vice.id,
    fieldFlourish: fieldFlourish.id,
  };
  const tier = resolveTierFromTraitIds(traits);
  const demographic: Demographic = {
    skin: skin.id,
    gender: gender.id,
    age: age.id,
  };

  const imagePrompt = composePrompt({
    skin,
    gender,
    age,
    expression,
    fieldInk,
    attire,
    vice,
    fieldFlourish,
  });
  const imageStyleSeed = `portrait-v${PORTRAIT_METADATA_VERSION}-${baseHash.toString(36)}`;

  return {
    imageStatus: "pending" as const,
    imagePrompt,
    imagePromptSource: {
      version: PORTRAIT_METADATA_VERSION,
      seed: args.seed,
      traderName: args.name ?? null,
      mandateSnapshot: args.mandate ?? {},
      personalitySnapshot: args.personality ?? null,
      demographic,
      tier,
      traits,
    },
    imageStyleSeed,
    // imageVariant now carries the overall rarity tier (v3 stored archetype.id).
    imageVariant: tier,
    imageRetryCount: 0,
    metadataVersion: PORTRAIT_METADATA_VERSION,
  };
}
