import { describe, it, expect } from "vitest";
import {
  rankAndSelectLead,
  detectPatterns,
  LEAD_THRESHOLD,
} from "../../convex/wire/dramaRanker";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";

function ev(o: Partial<GameEventCtx> & { type: string }): GameEventCtx {
  return { dramatic: true, summary: o.type, ...o };
}

describe("dramaRanker: lead selection", () => {
  it("a wipeout leads the post", () => {
    const sel = rankAndSelectLead([
      ev({
        type: "wipeout",
        traderId: "t1",
        dealId: "d1",
        magnitudeUsdc: -5000,
      }),
      ev({ type: "deal_created", dramatic: false, magnitudeUsdc: 100 }),
    ]);
    expect(sel.leadKind).toBe("real_event");
    expect(sel.leadEvent?.type).toBe("wipeout");
    // Subjects carry the real entity refs for deep-linking.
    expect(sel.subjects).toEqual(
      expect.arrayContaining([
        { type: "trader", id: "t1" },
        { type: "deal", id: "d1" },
      ])
    );
  });

  it("falls back to fiction when nothing clears the threshold", () => {
    const sel = rankAndSelectLead([
      ev({ type: "deal_created", dramatic: false, magnitudeUsdc: 50 }),
      ev({ type: "deal_entry", dramatic: false }),
    ]);
    expect(sel.leadKind).toBe("fiction");
    expect(sel.realStatOneLiner).toBeTruthy();
    const top = sel.ranked[0];
    expect(top.score).toBeLessThan(LEAD_THRESHOLD);
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

  it("a detected pattern can win the lead over a lone loss", () => {
    const sel = rankAndSelectLead([
      ev({
        type: "trap_resolved",
        traderName: "Gordon",
        dealPrompt: "guaranteed returns",
        magnitudeUsdc: -100,
      }),
      ev({
        type: "trap_resolved",
        traderName: "Bud",
        dealPrompt: "guaranteed upside",
        magnitudeUsdc: -100,
      }),
    ]);
    expect(sel.patterns.length).toBeGreaterThanOrEqual(1);
    expect(sel.leadKind).toBe("real_event");
    expect(sel.ranked[0].event.type).toBe("loss_pattern");
  });
});
