import { describe, it, expect } from "vitest";
import {
  assembleUserMessage,
  type AssemblerInput,
} from "../../convex/wire/epochAssembler";

function makeInput(overrides: Partial<AssemblerInput> = {}): AssemblerInput {
  return {
    season: {
      title: "The PanAtlantic Collapse",
      tone: "Jaded, gossipy, darkly funny.",
      weeklyShape: { monday: "Slow open, everyone hungover" },
      styleRules: ["Headline ≤ 12 words.", "No emoji except a leading ⚡."],
      forbiddenLanguage: ["DeFi", "wagmi"],
    },
    dayPosture: "monday",
    arcs: [
      {
        slug: "pan-atlantic-blowup",
        title: "PanAtlantic blow-up",
        summary: "The wake.",
        tensionScore: 3,
        arcStage: "aftermath",
        isPrimary: true,
        beatThisRun: true,
        firmLossUsdc: 1_400_000_000,
        firmDisplayName: "PanAtlantic Holdings",
      },
    ],
    firmStates: [
      {
        displayName: "PanAtlantic Holdings",
        status: "collapsing",
        runningLossUsdc: 1_400_000_000,
        newLossDeltaUsdc: 0,
        latestFact: "PanAtlantic losses peaked at $1.4B",
      },
    ],
    entities: [
      { slug: "marty-vale", displayName: "Marty Vale", traits: ["loud"] },
    ],
    recentDrops: [],
    recentGameEvents: [],
    lead: {
      leadKind: "fiction",
      leadLine: null,
      leadFigureUsdc: null,
      realStatOneLiner: "4 entries on one deal this hour.",
      patterns: [],
    },
    floorTalkClaims: [],
    mood: "hungover",
    secHeat: 5,
    isOpeningBell: false,
    isClosingBell: false,
    ...overrides,
  };
}

describe("assembleUserMessage", () => {
  it("renders the code-set mood and SEC heat", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("mood: hungover");
    expect(msg).toContain("sec_heat: 5/10");
  });

  it("instructs a fiction lead with the exact firm figure", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("FICTIONAL BEAT LEADS");
    expect(msg).toContain("USE THIS EXACT FIGURE");
    expect(msg).toContain("(1400000000 USDC)");
  });

  it("instructs a real-event lead with the exact figure", () => {
    const msg = assembleUserMessage(
      makeInput({
        lead: {
          leadKind: "real_event",
          leadLine: "Gordon2 / 0x4f2…a9: Trader wiped out",
          leadFigureUsdc: 612,
          realStatOneLiner: null,
          patterns: [],
        },
      })
    );
    expect(msg).toContain("REAL EVENT LEADS");
    expect(msg).toContain("Gordon2");
    expect(msg).toContain("(612 USDC)");
  });

  it("labels fabricated floor talk so it is framed as rumor", () => {
    const msg = assembleUserMessage(
      makeInput({
        floorTalkClaims: [
          { text: "CEO seen with boxes", isTrue: false },
          { text: "Auditors booked a second room", isTrue: true },
        ],
      })
    );
    expect(msg).toContain("FABRICATED");
    expect(msg).toContain("TRUE");
  });

  it("adds the daily-wrap instruction on the closing bell", () => {
    const msg = assembleUserMessage(makeInput({ isClosingBell: true }));
    expect(msg).toContain("DAILY WRAP");
  });

  it("adds the morning-briefing instruction on the opening bell", () => {
    const msg = assembleUserMessage(makeInput({ isOpeningBell: true }));
    expect(msg).toContain("MORNING BRIEFING");
  });

  it("renders detected trap patterns", () => {
    const msg = assembleUserMessage(
      makeInput({
        lead: {
          leadKind: "real_event",
          leadLine: "pattern",
          leadFigureUsdc: null,
          realStatOneLiner: null,
          patterns: [
            {
              phrase: "risk-free",
              count: 4,
              traderLabels: ["A", "B", "C", "D"],
            },
          ],
        },
      })
    );
    expect(msg).toContain("TRAP PATTERNS DETECTED");
    expect(msg).toContain("risk-free");
  });
});
