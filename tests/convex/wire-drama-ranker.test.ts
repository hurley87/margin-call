import { describe, it, expect } from "vitest";
import {
  rankAndSelectLead,
  detectPatterns,
} from "../../convex/wire/dramaRanker";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";
import type { TokenSignal } from "../../convex/wire/tokenSignals";

function ev(o: Partial<GameEventCtx> & { type: string }): GameEventCtx {
  return { dramatic: true, summary: o.type, ...o };
}

function sig(over: Partial<TokenSignal>): TokenSignal {
  return {
    slug: "kupo",
    symbol: "KUPO",
    companyName: "Kupo",
    xHandle: "@kupo_gg",
    isHouseToken: false,
    ok: true,
    priceUsd: 1,
    moveSinceLastPct: null,
    move24hPct: null,
    move24hSource: "computed",
    volume24hUsd: null,
    volumeVsTrailing: null,
    volumeAnomaly: false,
    streakDays: 0,
    classification: "none",
    latestSnapshotId: "s1",
    refSnapshotIds: ["s1"],
    ...over,
  };
}

describe("dramaRanker: lead selection", () => {
  it("a token flash leads and is flagged as a flash bulletin", () => {
    const sel = rankAndSelectLead({
      signals: [sig({ move24hPct: -22, classification: "flash" })],
      events: [],
    });
    expect(sel.leadKind).toBe("token");
    expect(sel.tokenLead?.symbol).toBe("KUPO");
    expect(sel.isFlash).toBe(true);
  });

  it("a wipeout leads when there is no token story", () => {
    const sel = rankAndSelectLead({
      signals: [sig({ classification: "none" })],
      events: [
        ev({
          type: "wipeout",
          traderId: "t1",
          dealId: "d1",
          magnitudeUsdc: -5000,
        }),
        ev({ type: "deal_created", dramatic: false, magnitudeUsdc: 100 }),
      ],
    });
    expect(sel.leadKind).toBe("game_event");
    expect(sel.gameLead?.type).toBe("wipeout");
    expect(sel.isFlash).toBe(true);
    expect(sel.subjects).toEqual(
      expect.arrayContaining([
        { type: "trader", id: "t1" },
        { type: "deal", id: "d1" },
      ])
    );
  });

  it("falls back to a quiet tape when nothing clears the threshold", () => {
    const sel = rankAndSelectLead({
      signals: [sig({ move24hPct: 3, classification: "routine" })],
      events: [ev({ type: "deal_entry", dramatic: false })],
    });
    expect(sel.leadKind).toBe("quiet");
    expect(sel.realStatOneLiner).toBeTruthy();
  });

  it("bars the previous drop's lead token from leading twice in a row", () => {
    const lfi = sig({
      slug: "lienfi",
      symbol: "LFI",
      move24hPct: 43,
      classification: "flash",
    });
    const kupo = sig({
      slug: "kupo",
      symbol: "KUPO",
      move24hPct: 12,
      classification: "story",
    });

    // Without a prior lead, the biggest mover (LFI flash) leads.
    const first = rankAndSelectLead({ signals: [lfi, kupo], events: [] });
    expect(first.tokenLead?.symbol).toBe("LFI");

    // Next drop: LFI is barred, so the next-best token (KUPO) leads instead.
    const second = rankAndSelectLead({
      signals: [lfi, kupo],
      events: [],
      prevLeadTokenSlug: "lienfi",
    });
    expect(second.leadKind).toBe("token");
    expect(second.tokenLead?.symbol).toBe("KUPO");
  });

  it("falls to a quiet tape when the only mover led the previous drop", () => {
    const lfi = sig({
      slug: "lienfi",
      symbol: "LFI",
      move24hPct: 43,
      classification: "flash",
    });
    const sel = rankAndSelectLead({
      signals: [lfi],
      events: [],
      prevLeadTokenSlug: "lienfi",
    });
    expect(sel.leadKind).toBe("quiet");
    // The repeat may still be woven in as the quiet stat, but it does not lead.
    expect(sel.tokenLead).toBeNull();
    expect(sel.realStatOneLiner).toContain("LFI");
  });

  it("detects a trap-phrase pattern across multiple traders", () => {
    const patterns = detectPatterns([
      ev({
        type: "trap_resolved",
        traderName: "Gordon",
        dealPrompt: "Risk-free arbitrage, can't miss",
        magnitudeUsdc: -300,
      }),
      ev({
        type: "big_loss",
        traderName: "Bud",
        dealPrompt: "A totally risk-free play",
        magnitudeUsdc: -200,
      }),
    ]);
    const riskFree = patterns.find((p) => p.phrase === "risk-free");
    expect(riskFree).toBeDefined();
    expect(riskFree!.count).toBe(2);
  });
});
