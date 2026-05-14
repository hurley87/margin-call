import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  PORTRAIT_METADATA_VERSION,
  buildPortraitSeed,
  inferGenderPresentationFromName,
  readPublicTraits,
} from "../../convex/lib/portraitSeed";

const baseArgs = {
  ownerSubject: "did:privy:owner",
  mandate: { bankroll_pct: 25, max_entry_cost_usdc: 100 },
  personality: "Aggressive credit trader",
};

const TRAIT_KEYS = [
  "archetype",
  "scene",
  "prop",
  "marketMoment",
  "expression",
  "lighting",
  "cameraAngle",
  "genderPresentation",
  "apparentAge",
  "appearanceVariant",
  "hairstyle",
  "clothingStyle",
  "accessory",
] as const;

function seedFor(name: string, ownerSubject = baseArgs.ownerSubject) {
  return buildPortraitSeed({ ...baseArgs, ownerSubject, name });
}

function traitsFrom(seed: ReturnType<typeof buildPortraitSeed>) {
  return seed.imagePromptSource.traits;
}

describe("portrait seed v3", () => {
  it("is deterministic for identical inputs", () => {
    const first = seedFor("Bud Fox");
    const second = seedFor("Bud Fox");

    expect(first.imagePrompt).toBe(second.imagePrompt);
    expect(first.imageStyleSeed).toBe(second.imageStyleSeed);
    expect(first.imageVariant).toBe(second.imageVariant);
    expect(traitsFrom(first)).toEqual(traitsFrom(second));
  });

  it("diversifies traits across distinct names", () => {
    const seeds = Array.from({ length: 50 }, (_, index) =>
      seedFor(`Trader ${index}`)
    );

    expect(
      new Set(seeds.map((s) => traitsFrom(s).archetype)).size
    ).toBeGreaterThanOrEqual(8);
    expect(
      new Set(seeds.map((s) => traitsFrom(s).appearanceVariant)).size
    ).toBeGreaterThanOrEqual(5);
    expect(
      new Set(seeds.map((s) => traitsFrom(s).clothingStyle)).size
    ).toBeGreaterThanOrEqual(4);
  });

  it("uses feminine name inference for curated names", () => {
    for (const name of ["Hayley", "Hailey"]) {
      const seed = seedFor(name);
      expect(seed.imagePromptSource.traits.genderPresentation).toBe("feminine");
      expect(seed.imagePromptSource.genderPresentationSource).toBe(
        "inferred-feminine"
      );
    }
  });

  it("uses a deterministic hash fallback for ambiguous names", () => {
    const first = seedFor("Jordan");
    const second = seedFor("Jordan");

    expect(first.imagePromptSource.genderPresentationSource).toBe("hashed");
    expect(["feminine", "masculine"]).toContain(
      first.imagePromptSource.traits.genderPresentation
    );
    expect(first.imagePromptSource.traits.genderPresentation).toBe(
      second.imagePromptSource.traits.genderPresentation
    );
  });

  it("never includes the raw first name in the prompt", () => {
    const names = [
      "Hayley",
      "David",
      "Marcus",
      "Olivia",
      "Gordon",
      "Bud",
      "Jordan",
      "Taylor",
      "Sarah",
      "Michael",
      "Emily",
      "Anthony",
      "Laura",
      "Ryan",
      "Diane",
      "Frank",
      "Sophie",
      "Peter",
      "Ava",
      "Kenneth",
    ];

    for (const name of names) {
      const prompt = seedFor(name).imagePrompt;
      expect(new RegExp(`\\b${name}\\b`, "i").test(prompt)).toBe(false);
    }
  });

  it("includes the strict exclusions and final safety sentence", () => {
    const prompt = seedFor("Hayley").imagePrompt.toLowerCase();

    for (const phrase of [
      "no readable text",
      "no captions",
      "no name",
      "no nameplate",
      "no labels",
      "no job titles",
      "no ticker symbols",
      "no numbers",
      "no letters",
      "no logos",
      "no watermarks",
      "no ui text",
      "no readable documents",
      "no readable terminal text",
      "no readable screen text",
      "no modern devices",
      "no cryptocurrency imagery",
      "no border",
      "the trader's name and internal seed must not appear visually in the image.",
    ]) {
      expect(prompt).toContain(phrase);
    }
  });

  it("stores provenance and all derived trait keys", () => {
    const seed = seedFor("Hayley Patel");

    expect(seed.imagePromptSource.version).toBe(PORTRAIT_METADATA_VERSION);
    expect(seed.imagePromptSource.traderName).toBe("Hayley Patel");
    expect(seed.imagePromptSource.mandateSnapshot).toEqual(baseArgs.mandate);
    expect(seed.imagePromptSource.personalitySnapshot).toBe(
      baseArgs.personality
    );
    expect(seed.imagePromptSource.genderPresentationSource).toBe(
      "inferred-feminine"
    );
    expect(Object.keys(seed.imagePromptSource.traits).sort()).toEqual(
      [...TRAIT_KEYS].sort()
    );
  });

  it("projects only the public trait map", () => {
    const seed = seedFor("Gordon Gecko");
    const publicShape = {
      name: "Gordon Gecko",
      traits: readPublicTraits(seed.imagePromptSource),
    };

    expect(publicShape.traits).not.toBeNull();
    expect(Object.keys(publicShape.traits!).sort()).toEqual(
      [...TRAIT_KEYS].sort()
    );
    expect(publicShape).not.toHaveProperty("traderName");
    expect(publicShape).not.toHaveProperty("mandateSnapshot");
    expect(publicShape).not.toHaveProperty("personalitySnapshot");
    expect(publicShape).not.toHaveProperty("genderPresentationSource");
    expect(publicShape).not.toHaveProperty("imagePrompt");
    expect(publicShape).not.toHaveProperty("imageStyleSeed");
  });

  it("has sane archetype distribution over 200 deterministic names", () => {
    const counts = new Map<string, number>();

    for (let index = 0; index < 200; index += 1) {
      const archetype = traitsFrom(
        seedFor(`Trader ${index}`, `did:privy:owner-${index}`)
      ).archetype;
      counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
    }

    for (const archetype of ARCHETYPES) {
      expect(counts.get(archetype.id) ?? 0).toBeGreaterThan(0);
    }
    for (const count of counts.values()) {
      expect(count / 200).toBeLessThanOrEqual(0.25);
    }
  });

  it.each([
    ["Hayley", "feminine"],
    ["Hayley Patel", "feminine"],
    ["Jordan", "unknown"],
    ["DAVID", "masculine"],
    ["", "unknown"],
    ["Zxqwer", "unknown"],
  ] as const)("infers %s as %s", (name, expected) => {
    expect(inferGenderPresentationFromName(name)).toBe(expected);
  });
});
