import { describe, it, expect } from "vitest";
import { validateEpoch } from "../../convex/wire/epochValidator";

const arcSlugs = new Set(["arc-a", "arc-b"]);
const entitySlugs = new Set(["marty-vale", "sec-agent"]);
const forbiddenLanguage = ["DeFi", "wagmi", "stakeholders"];

function makeValidPayload() {
  return {
    dropTitle: "MARGIN CALLED",
    worldState: {
      mood: "tense",
      sec_heat: 7,
      sectors: null,
      active_storylines: null,
      notable_traders: null,
    },
    dispatches: [
      {
        headline: "PanAtlantic down 12%",
        body: "The bond desk is silent. Nobody is picking up calls from Jersey.",
        category: "market",
        role: "main" as const,
        arcSlug: "arc-a",
        referenceEpoch: null,
      },
      {
        headline: "Marty Vale exits the building",
        body: "Vale's coat is on. His assistant is shredding paper.",
        category: "floor_talk",
        role: "supporting" as const,
        arcSlug: "arc-b",
        referenceEpoch: null,
      },
    ],
    arcUpdates: [{ arcSlug: "arc-a", tensionDelta: 2 }],
    entityMentions: ["marty-vale"],
  };
}

describe("validateEpoch: accepts valid payloads", () => {
  it("accepts a valid 2-dispatch payload", () => {
    const result = validateEpoch(makeValidPayload(), {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a valid 3-dispatch payload", () => {
    const payload = makeValidPayload();
    payload.dispatches.push({
      headline: "SEC files subpoena",
      body: "Document request covers three years of trading records.",
      category: "regulatory",
      role: "supporting" as const,
      arcSlug: "arc-b",
      referenceEpoch: null,
    });
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a payload with null arcUpdates", () => {
    const payload = makeValidPayload();
    (payload as Record<string, unknown>).arcUpdates = null;
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a payload with a deal_seed dispatch role", () => {
    const payload = makeValidPayload();
    payload.dispatches[1].role = "deal_seed" as never;
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects invalid dispatch counts", () => {
  it("rejects a 1-dispatch payload", () => {
    const payload = makeValidPayload();
    payload.dispatches = [payload.dispatches[0]];
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a 4-dispatch payload", () => {
    const payload = makeValidPayload();
    for (let i = 2; i < 4; i++) {
      payload.dispatches.push({
        headline: `Extra dispatch ${i}`,
        body: "Extra body text here.",
        category: "market",
        role: "supporting" as const,
        arcSlug: null,
        referenceEpoch: null,
      });
    }
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a 2-dispatch payload with no 'main' role", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].role = "supporting" as never;
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/main/i);
  });
});

describe("validateEpoch: rejects unknown arcSlugs", () => {
  it("rejects unknown arcSlug in dispatch", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].arcSlug = "arc-unknown";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "arc-unknown"
    );
  });

  it("rejects unknown arcSlug in arcUpdates", () => {
    const payload = makeValidPayload();
    payload.arcUpdates = [{ arcSlug: "arc-ghost", tensionDelta: 1 }];
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "arc-ghost"
    );
  });
});

describe("validateEpoch: rejects off-roster entity mentions", () => {
  it("rejects unknown entity slug", () => {
    const payload = makeValidPayload();
    payload.entityMentions = ["ghost-trader"];
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "ghost-trader"
    );
  });
});

describe("validateEpoch: rejects too-long headlines and bodies", () => {
  it("rejects headline > 100 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "A".repeat(101);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects body > 180 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "B".repeat(181);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts headline of exactly 100 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "A".repeat(100);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts body of exactly 180 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "B".repeat(180);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects forbidden language", () => {
  it("rejects forbidden word in headline (case-insensitive)", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "DeFi plays are back on the floor";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("DeFi");
  });

  it("rejects forbidden word in body", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "wagmi says the floor trader.";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects forbidden word in dropTitle", () => {
    const payload = makeValidPayload();
    payload.dropTitle = "stakeholders meeting at noon";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("catches forbidden language case-insensitively (uppercase)", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "WAGMI confirmed on the floor";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("does not flag a forbidden word embedded inside another word", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "The trader shrugged and lit a cigarette.";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage: ["rug"],
    });
    expect(result.ok).toBe(true);
  });
});
