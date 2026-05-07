import { describe, it, expect } from "vitest";
import {
  assembleUserMessage,
  type AssemblerInput,
} from "../../convex/wire/epochAssembler";

function makeInput(overrides: Partial<AssemblerInput> = {}): AssemblerInput {
  return {
    season: {
      title: "The PanAtlantic Collapse",
      tone: "Paranoid, predatory, terse.",
      weeklyShape: {
        monday: "Rumors circulate; nobody confirms anything",
        wednesday: "Mid-week: positions crystallize",
        friday: "Everyone is covering by noon",
      },
      styleRules: ["Headlines: ~100 chars max.", "No emoji."],
      forbiddenLanguage: ["DeFi", "wagmi"],
    },
    dayPosture: "monday",
    arcs: [
      {
        slug: "arc-a",
        title: "Arc A",
        summary: "High stakes arc",
        tensionScore: 9,
      },
      { slug: "arc-b", title: "Arc B", summary: "Lower arc", tensionScore: 5 },
      { slug: "arc-c", title: "Arc C", summary: "Cold arc", tensionScore: 2 },
    ],
    entities: [
      {
        slug: "marty-vale",
        displayName: "Marty Vale",
        traits: ["aggressive", "liar"],
      },
      { slug: "sec-agent", displayName: "SEC Agent", traits: ["methodical"] },
    ],
    recentDrops: [],
    recentGameEvents: [],
    worldState: { mood: "tense", sec_heat: 7 },
    lastDropWasDealSeed: false,
    ...overrides,
  };
}

describe("assembleUserMessage: arc ordering", () => {
  it("marks the highest-tension arc as [PRIMARY]", () => {
    const msg = assembleUserMessage(makeInput());
    const primaryLine = msg.split("\n").find((l) => l.includes("[PRIMARY]"));
    expect(primaryLine).toBeDefined();
    expect(primaryLine).toContain("Arc A");
    expect(primaryLine).toContain("tension 9");
  });

  it("does not mark the second arc as [PRIMARY]", () => {
    const msg = assembleUserMessage(makeInput());
    const lines = msg.split("\n").filter((l) => l.includes("Arc B"));
    expect(lines.some((l) => l.includes("[PRIMARY]"))).toBe(false);
  });

  it("lists arcs in tension-desc order (caller pre-sorts)", () => {
    const input = makeInput({
      arcs: [
        { slug: "arc-a", title: "Arc A", summary: "Summary", tensionScore: 9 },
        { slug: "arc-b", title: "Arc B", summary: "Summary", tensionScore: 5 },
        { slug: "arc-c", title: "Arc C", summary: "Summary", tensionScore: 2 },
      ],
    });
    const msg = assembleUserMessage(input);
    const idxA = msg.indexOf("Arc A");
    const idxB = msg.indexOf("Arc B");
    const idxC = msg.indexOf("Arc C");
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });
});

describe("assembleUserMessage: recent drops", () => {
  it("includes drop titles in the output", () => {
    const input = makeInput({
      recentDrops: [
        {
          epochSlot: 485100,
          dropTitle: "MARGIN CALLED",
          worldState: { mood: "volatile", sec_heat: 8 },
          headlines: [
            { headline: "PanAtlantic down 12%", role: "main" },
            { headline: "Marty flees to Jersey", role: "supporting" },
          ],
        },
      ],
    });
    const msg = assembleUserMessage(input);
    expect(msg).toContain("MARGIN CALLED");
    expect(msg).toContain("PanAtlantic down 12%");
  });

  it("trims to 10 drops maximum", () => {
    const manyDrops = Array.from({ length: 15 }, (_, i) => ({
      epochSlot: i,
      dropTitle: `Drop ${i}`,
      worldState: null,
      headlines: [],
    }));
    const msg = assembleUserMessage(makeInput({ recentDrops: manyDrops }));
    // Only drops 0–9 should appear (first 10 by newest-first ordering)
    expect(msg).toContain("Drop 0");
    expect(msg).toContain("Drop 9");
    expect(msg).not.toContain("Drop 10");
  });

  it("handles empty recentDrops gracefully", () => {
    const msg = assembleUserMessage(makeInput({ recentDrops: [] }));
    expect(msg).toContain("first drop");
  });
});

describe("assembleUserMessage: entity roster", () => {
  it("includes entity slug and displayName", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("marty-vale");
    expect(msg).toContain("Marty Vale");
  });

  it("includes entity traits", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("aggressive");
  });
});

describe("assembleUserMessage: recent game events", () => {
  it("includes game event summaries", () => {
    const input = makeInput({
      recentGameEvents: [
        { type: "wipeout", summary: "Trader T1 wiped out (sec_bust)" },
      ],
    });
    const msg = assembleUserMessage(input);
    expect(msg).toContain("wipeout");
    expect(msg).toContain("Trader T1 wiped out");
  });

  it("handles empty events gracefully", () => {
    const msg = assembleUserMessage(makeInput({ recentGameEvents: [] }));
    expect(msg).toContain("no notable events");
  });
});

describe("assembleUserMessage: deal-seed guidance", () => {
  it("advises against a deal_seed when last drop was a deal_seed", () => {
    const msg = assembleUserMessage(makeInput({ lastDropWasDealSeed: true }));
    expect(msg).toContain("Do NOT include another deal_seed");
  });

  it("permits a deal_seed when last drop was not a deal_seed", () => {
    const msg = assembleUserMessage(makeInput({ lastDropWasDealSeed: false }));
    expect(msg).toContain("You may include one deal_seed");
  });
});

describe("assembleUserMessage: day posture", () => {
  it("includes the weeklyShape posture for the current day", () => {
    const msg = assembleUserMessage(makeInput({ dayPosture: "monday" }));
    expect(msg).toContain("Rumors circulate; nobody confirms anything");
  });

  it("falls back to the dayPosture string when not in weeklyShape", () => {
    const msg = assembleUserMessage(makeInput({ dayPosture: "tuesday" }));
    expect(msg).toContain("tuesday");
  });
});
