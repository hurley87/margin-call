import { describe, it, expect } from "vitest";
import {
  assembleUserMessage,
  type AssemblerInput,
} from "../../convex/wire/epochAssembler";

function makeInput(overrides: Partial<AssemblerInput> = {}): AssemblerInput {
  return {
    season: {
      title: "The Listed Companies",
      tone: "Jaded, gossipy, darkly funny.",
      weeklyShape: { monday: "Slow open, everyone hungover" },
      styleRules: ["Headline ≤ 12 words.", "No emoji except a leading ⚡."],
      forbiddenLanguage: ["token", "wallet"],
    },
    dayPosture: "monday",
    mood: "greedy",
    lead: {
      leadKind: "quiet",
      isFlash: false,
      realStatOneLiner: "SURPLUS up 4%",
      patterns: [],
    },
    companyTape: [
      {
        symbol: "SURPLUS",
        companyName: "Surplus Intelligence",
        xHandle: "@AskSurplus",
        isHouseToken: false,
        priceUsd: 1,
        move24hPct: 38,
        moveSinceLastPct: 5,
        streakDays: 0,
        volumeVsTrailing: null,
        volumeAnomaly: false,
        classification: "flash",
      },
    ],
    arcs: [],
    entities: [
      { slug: "surplus", displayName: "Surplus Intelligence", traits: [] },
      { slug: "harness", displayName: "Harness", traits: [] },
    ],
    houseTokenName: "Harness",
    floorTalkClaims: [],
    sourcedStatements: [],
    recentDrops: [],
    isOpeningBell: false,
    isClosingBell: false,
    ...overrides,
  };
}

describe("assembleUserMessage", () => {
  it("renders the code-set mood and no SEC heat", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("CURRENT MOOD (code-set — do not alter): greedy");
    expect(msg).not.toContain("sec_heat");
  });

  it("instructs a token lead with the exact symbol + move", () => {
    const msg = assembleUserMessage(
      makeInput({
        lead: {
          leadKind: "token",
          isFlash: true,
          tokenSymbol: "SURPLUS",
          tokenCompanyName: "Surplus Intelligence",
          tokenXHandle: "@AskSurplus",
          tokenMovePct: 38,
          tokenStreakDays: 0,
          tokenIsHouse: false,
          tokenVolumeNote: null,
          patterns: [],
        },
      })
    );
    expect(msg).toContain("FLASH BULLETIN");
    expect(msg).toContain("Surplus Intelligence (SURPLUS)");
    expect(msg).toContain("SURPLUS +38%");
    expect(msg).toContain("NEVER invent a real-sounding reason");
  });

  it("instructs a game-event lead with the exact USDC figure", () => {
    const msg = assembleUserMessage(
      makeInput({
        lead: {
          leadKind: "game_event",
          isFlash: false,
          gameLine: "Jim's desk: lost $0.99 on someone else's deal",
          gameFigureUsdc: 0.99,
          patterns: [],
        },
      })
    );
    expect(msg).toContain("REAL GAME EVENT LEADS");
    expect(msg).toContain("Jim's desk");
    expect(msg).toContain("(0.99 USDC)");
  });

  it("renders the company tape with exact figures and flags the house company", () => {
    const msg = assembleUserMessage(
      makeInput({
        companyTape: [
          {
            symbol: "HARNESS",
            companyName: "Harness",
            xHandle: "@tryharness",
            isHouseToken: true,
            priceUsd: 1,
            move24hPct: 0,
            moveSinceLastPct: 0,
            streakDays: 0,
            volumeVsTrailing: null,
            volumeAnomaly: false,
            classification: "routine",
          },
        ],
      })
    );
    expect(msg).toContain("COMPANY TAPE");
    expect(msg).toContain("Harness (HARNESS)");
    expect(msg).toContain("HOUSE COMPANY");
  });

  it("labels fabricated floor talk so it is framed as rumor", () => {
    const msg = assembleUserMessage(
      makeInput({
        floorTalkClaims: [
          { text: "the interns started a betting pool", isTrue: false },
          { text: "the coffee cart guy has opinions", isTrue: true },
        ],
      })
    );
    expect(msg).toContain("FABRICATED");
    expect(msg).toContain("TRUE");
  });

  it("warns against inventing statements when none are supplied", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("SOURCED STATEMENTS");
    expect(msg).toContain(
      "do NOT invent posts, quotes, actions, or intentions"
    );
  });

  it("adds the daily-wrap + morning-briefing instructions on the bells", () => {
    expect(assembleUserMessage(makeInput({ isClosingBell: true }))).toContain(
      "DAILY WRAP"
    );
    expect(assembleUserMessage(makeInput({ isOpeningBell: true }))).toContain(
      "MORNING BRIEFING"
    );
  });

  it("always instructs a URL-free tweet variant", () => {
    const msg = assembleUserMessage(makeInput());
    expect(msg).toContain("tweetVariant");
    expect(msg).toContain("NO URLs");
  });

  it("renders detected trap patterns", () => {
    const msg = assembleUserMessage(
      makeInput({
        lead: {
          leadKind: "quiet",
          isFlash: false,
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
    expect(msg).toContain("TRAP PATTERNS");
    expect(msg).toContain("risk-free");
  });

  it("renders + omits the quiet-slot angle section", () => {
    const withAngle = assembleUserMessage(
      makeInput({
        quietSlotAngle: {
          key: "junior-analyst",
          instruction: "Junior-analyst gallows humor.",
          suggestedCategory: "wire",
        },
      })
    );
    expect(withAngle).toContain("ANGLE FOR THIS DROP");
    expect(withAngle).toContain("Suggested category: wire");
    expect(
      assembleUserMessage(makeInput({ quietSlotAngle: null }))
    ).not.toContain("ANGLE FOR THIS DROP");
  });
});
