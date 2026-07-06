import { describe, expect, it } from "vitest";
import {
  buildPortraitSeed,
  composePromptFromStored,
  FIELD_INKS,
  PORTRAIT_METADATA_VERSION,
  readPublicTraits,
  resolveTierFromTraitIds,
  SURFACED_SLOTS,
  TRAIT_META,
} from "../../convex/lib/portraitSeed";

const SURFACED_KEYS = [
  "attire",
  "expression",
  "fieldFlourish",
  "fieldInk",
  "vice",
];
const WARM_INKS = new Set(["vermilion", "ochre", "goldleaf"]);

function seedFor(
  seed: string,
  over: Partial<{ name: string; mandate: unknown; personality: string }> = {}
) {
  return buildPortraitSeed({
    seed,
    name: over.name ?? "Bud Fox",
    mandate: over.mandate ?? { bankroll_pct: 25 },
    personality: over.personality ?? "Aggressive credit trader",
  });
}

const traitsOf = (s: ReturnType<typeof buildPortraitSeed>) =>
  s.imagePromptSource.traits;

describe("portrait seed v4", () => {
  it("is deterministic for an identical seed", () => {
    const a = seedFor("seed-alpha");
    const b = seedFor("seed-alpha");
    expect(a.imagePrompt).toBe(b.imagePrompt);
    expect(a.imageStyleSeed).toBe(b.imageStyleSeed);
    expect(a.imageVariant).toBe(b.imageVariant);
    expect(traitsOf(a)).toEqual(traitsOf(b));
  });

  it("traits are a pure function of the seed — name/mandate/personality never affect them", () => {
    const a = seedFor("seed-frozen", {
      name: "Gordon",
      mandate: { bankroll_pct: 5 },
      personality: "cautious",
    });
    const b = seedFor("seed-frozen", {
      name: "Completely Different",
      mandate: { bankroll_pct: 99 },
      personality: "reckless",
    });
    expect(traitsOf(a)).toEqual(traitsOf(b));
    expect(a.imagePrompt).toBe(b.imagePrompt);
    // provenance fields still reflect the caller's inputs
    expect(a.imagePromptSource.traderName).toBe("Gordon");
    expect(b.imagePromptSource.traderName).toBe("Completely Different");
  });

  it("recomputing the prompt from stored trait ids is stable (version-bump inviolability)", () => {
    const seed = seedFor("seed-recompute");
    const traits = traitsOf(seed);
    const demographic = seed.imagePromptSource.demographic;
    const recomposed = composePromptFromStored(traits, demographic);
    expect(recomposed).toBe(seed.imagePrompt);
    expect(resolveTierFromTraitIds(traits)).toBe(seed.imageVariant);
  });

  it("stamps v4 metadata and a seed-derived style seed", () => {
    const seed = seedFor("seed-meta");
    expect(seed.metadataVersion).toBe(PORTRAIT_METADATA_VERSION);
    expect(PORTRAIT_METADATA_VERSION).toBe(4);
    expect(seed.imagePromptSource.version).toBe(4);
    expect(seed.imageStyleSeed).toMatch(/^portrait-v4-/);
    expect(seed.imagePromptSource.seed).toBe("seed-meta");
  });

  it("surfaces exactly the 5 trait slots and never leaks demographics", () => {
    const seed = seedFor("seed-public");
    const publicTraits = readPublicTraits(seed.imagePromptSource);
    expect(publicTraits).not.toBeNull();
    expect(Object.keys(publicTraits!).sort()).toEqual(SURFACED_KEYS);
    // seed-only demographic is stored on a sibling key, never in the public projection
    expect(publicTraits).not.toHaveProperty("skin");
    expect(publicTraits).not.toHaveProperty("gender");
    expect(publicTraits).not.toHaveProperty("age");
    expect(seed.imagePromptSource.demographic).toMatchObject({
      skin: expect.any(String),
      gender: expect.any(String),
      age: expect.any(String),
    });
  });

  it("never renders the trader name into the prompt", () => {
    for (const name of [
      "Hayley",
      "David",
      "Gordon",
      "Jordan",
      "Sarah",
      "Kenneth",
    ]) {
      const prompt = seedFor(`seed-${name}`, { name }).imagePrompt;
      expect(new RegExp(`\\b${name}\\b`, "i").test(prompt)).toBe(false);
    }
  });

  it("keeps the hardened exclusion block (never weakened)", () => {
    const prompt = seedFor("seed-exclude").imagePrompt.toLowerCase();
    for (const phrase of [
      "no readable text",
      "numerals",
      "letters",
      "dates",
      "ticker symbols",
      "logos",
      "watermarks",
      "no modern devices",
      "no cryptocurrency imagery",
      "no '1987'",
      "the trader's name and internal seed must not appear visually in the image.",
    ]) {
      expect(prompt).toContain(phrase);
    }
  });

  it("constrains deep-skin mints to warm inks", () => {
    let deepCount = 0;
    for (let i = 0; i < 3000; i++) {
      const seed = seedFor(`deep-scan-${i}`);
      if (seed.imagePromptSource.demographic.skin === "deep") {
        deepCount++;
        expect(WARM_INKS.has(traitsOf(seed).fieldInk)).toBe(true);
      }
    }
    expect(deepCount).toBeGreaterThan(0); // sanity: we actually saw deep-skin mints
  });

  it("weighted distribution roughly matches the designed odds", () => {
    const N = 4000;
    let none = 0;
    let rareOrBetter = 0;
    const tierRank = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 } as const;
    for (let i = 0; i < N; i++) {
      const traits = traitsOf(seedFor(`dist-${i}`));
      if (traits.vice === "none") none++;
      const tier = resolveTierFromTraitIds(traits);
      if (tierRank[tier] >= tierRank.Rare) rareOrBetter++;
    }
    // Vice "None" is designed at 79.9%
    expect(none / N).toBeGreaterThan(0.72);
    expect(none / N).toBeLessThan(0.87);
    // Rare-or-better is designed at ~7.2%
    expect(rareOrBetter / N).toBeGreaterThan(0.03);
    expect(rareOrBetter / N).toBeLessThan(0.13);
  });

  it("every common trait value is reachable over many seeds", () => {
    const seen: Record<string, Set<string>> = Object.fromEntries(
      SURFACED_SLOTS.map((s) => [s.key, new Set<string>()])
    );
    for (let i = 0; i < 4000; i++) {
      const traits = traitsOf(seedFor(`reach-${i}`));
      for (const slot of SURFACED_SLOTS) seen[slot.key].add(traits[slot.key]);
    }
    for (const slot of SURFACED_SLOTS) {
      for (const value of slot.pool) {
        if (value.tier === "Common") {
          // deep-only ink exclusion never removes a common ink, so all commons appear
          expect(seen[slot.key].has(value.id)).toBe(true);
        }
      }
    }
  });

  it("TRAIT_META covers every value in every slot", () => {
    for (const slot of SURFACED_SLOTS) {
      for (const value of slot.pool) {
        expect(TRAIT_META[slot.key][value.id]).toEqual({
          label: value.label,
          tier: value.tier,
          weight: value.weight,
        });
      }
    }
    // sanity: gold leaf is the legendary ink, silver the rare one
    expect(FIELD_INKS.find((i) => i.id === "goldleaf")?.tier).toBe("Legendary");
    expect(FIELD_INKS.find((i) => i.id === "silver")?.tier).toBe("Rare");
  });
});
