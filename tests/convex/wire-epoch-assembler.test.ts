import { describe, it, expect } from "vitest";
import {
  assembleUserMessage,
  type AssemblerInput,
  type GameEventCtx,
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

function makeEvent(overrides: Partial<GameEventCtx> = {}): GameEventCtx {
  return {
    type: "wipeout",
    dramatic: true,
    summary: "Trader wiped out",
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

describe("assembleUserMessage: recent game events — dramatic vs routine", () => {
  it("places dramatic events under the DRAMATIC heading", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "wipeout",
          dramatic: true,
          summary: "Trader T1 wiped out (sec_bust)",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    expect(msg).toContain("DRAMATIC");
    expect(msg).toContain("Trader T1 wiped out");
  });

  it("places routine events under the ROUTINE heading", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "deal_created",
          dramatic: false,
          summary: "Deal opened: short the market ($300 pot)",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    expect(msg).toContain("ROUTINE");
    expect(msg).toContain("short the market");
  });

  it("dramatic events do NOT appear under the ROUTINE heading", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "wipeout",
          dramatic: true,
          summary: "UNIQUE_DRAMATIC_EVENT",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    const routineIdx = msg.indexOf("RECENT MARKET EVENTS — ROUTINE");
    const summaryIdx = msg.indexOf("UNIQUE_DRAMATIC_EVENT");
    // The summary appears before the ROUTINE section
    expect(summaryIdx).toBeLessThan(routineIdx);
  });

  it("routine events do NOT appear under the DRAMATIC heading", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "deal_entry",
          dramatic: false,
          summary: "UNIQUE_ROUTINE_EVENT",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    const dramaticIdx = msg.indexOf("RECENT MARKET EVENTS — DRAMATIC");
    const routineIdx = msg.indexOf("RECENT MARKET EVENTS — ROUTINE");
    const summaryIdx = msg.indexOf("UNIQUE_ROUTINE_EVENT");
    // Routine summary appears after the DRAMATIC heading
    expect(summaryIdx).toBeGreaterThan(dramaticIdx);
    expect(summaryIdx).toBeGreaterThan(routineIdx);
  });

  it("annotates dramatic events with traderName and deskName", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "wipeout",
          dramatic: true,
          summary: "Trader wiped out — escrow exhausted",
          traderName: "Marty Vale",
          deskName: "PanAtlantic",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    expect(msg).toContain("[Marty Vale @ PanAtlantic]");
  });

  it("omits actor annotation when traderName is absent", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "crowded_trade",
          dramatic: true,
          summary: "3 entries on a deal",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    // Should not contain an actor bracket annotation
    expect(msg).not.toMatch(/\[\w.*@.*\w\]/);
  });

  it("shows (none) for DRAMATIC when all events are routine", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "deal_created",
          dramatic: false,
          summary: "Routine deal opened",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    const lines = msg.split("\n");
    const dramaticIdx = lines.findIndex((l) =>
      l.includes("RECENT MARKET EVENTS — DRAMATIC")
    );
    expect(dramaticIdx).toBeGreaterThan(-1);
    // The line after the DRAMATIC heading should be "(none)"
    expect(lines[dramaticIdx + 1]).toContain("(none)");
  });

  it("shows (none) for ROUTINE when all events are dramatic", () => {
    const input = makeInput({
      recentGameEvents: [
        makeEvent({
          type: "wipeout",
          dramatic: true,
          summary: "Trader wiped out",
        }),
      ],
    });
    const msg = assembleUserMessage(input);
    const lines = msg.split("\n");
    const routineIdx = lines.findIndex((l) =>
      l.includes("RECENT MARKET EVENTS — ROUTINE")
    );
    expect(routineIdx).toBeGreaterThan(-1);
    expect(lines[routineIdx + 1]).toContain("(none)");
  });

  it("shows (none) in both sections when there are no events", () => {
    const msg = assembleUserMessage(makeInput({ recentGameEvents: [] }));
    const lines = msg.split("\n");
    const dramaticIdx = lines.findIndex((l) =>
      l.includes("RECENT MARKET EVENTS — DRAMATIC")
    );
    const routineIdx = lines.findIndex((l) =>
      l.includes("RECENT MARKET EVENTS — ROUTINE")
    );
    expect(dramaticIdx).toBeGreaterThan(-1);
    expect(routineIdx).toBeGreaterThan(-1);
    expect(lines[dramaticIdx + 1]).toContain("(none)");
    expect(lines[routineIdx + 1]).toContain("(none)");
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
