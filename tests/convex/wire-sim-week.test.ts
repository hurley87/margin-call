import { describe, it, expect } from "vitest";
import {
  stepWorld,
  makeSignal,
  company,
  dayKeyForIndex,
  postureForDayIndex,
  type WorldState,
} from "./wireSim";
import type { TokenSignal } from "../../convex/wire/tokenSignals";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";

/**
 * Acceptance: a simulated week driven by real price signals. One company runs
 * up to a peak, then cools and retires; a wipeout lands on a quiet-price day and
 * leads as a flash bulletin.
 */
describe("wire: simulated week (acceptance)", () => {
  it("varies tension, spawns + retires an arc, varies mood, and flashes a wipeout", () => {
    let state: WorldState = { arcs: [] };
    const companies = [company("kupo", { displayName: "Kupo" })];

    // Per-day KUPO signal + optional events.
    const days: Array<{ signal: TokenSignal; events: GameEventCtx[] }> = [
      {
        signal: makeSignal("kupo", { move24hPct: 14, classification: "story" }),
        events: [],
      },
      {
        signal: makeSignal("kupo", { move24hPct: 25, classification: "flash" }),
        events: [],
      },
      {
        signal: makeSignal("kupo", { move24hPct: 40, classification: "flash" }),
        events: [],
      },
      {
        signal: makeSignal("kupo", { classification: "none" }),
        events: [
          {
            type: "wipeout",
            dramatic: true,
            summary: "Trader liquidated. Cause of death: confidence.",
            traderId: "trader-x",
            dealId: "deal-y",
            magnitudeUsdc: -4200,
          },
        ],
      },
      { signal: makeSignal("kupo", { classification: "none" }), events: [] },
    ];

    const tensions: number[] = [];
    const moods = new Set<string>();
    let sawSpawn = false;
    let sawRetire = false;
    let wipeoutFlashLed = false;

    for (let day = 0; day < days.length; day++) {
      const { advance, next } = stepWorld(state, {
        signals: [days[day].signal],
        companies,
        events: days[day].events,
        dayKey: dayKeyForIndex(day),
        dayPosture: postureForDayIndex(day),
        slot: 5000 + day,
      });

      for (const a of advance.arcAdvances) tensions.push(a.newTensionScore);
      for (const s of advance.spawnRequests) tensions.push(s.tensionScore);
      moods.add(advance.mood);
      if (advance.spawnRequests.length > 0) sawSpawn = true;
      if (advance.arcAdvances.some((a) => a.retiring)) sawRetire = true;
      if (
        advance.lead.leadKind === "game_event" &&
        advance.lead.gameLead?.type === "wipeout"
      ) {
        wipeoutFlashLed = true;
        expect(advance.lead.isFlash).toBe(true);
        expect(advance.lead.subjects).toEqual(
          expect.arrayContaining([
            { type: "trader", id: "trader-x" },
            { type: "deal", id: "deal-y" },
          ])
        );
      }
      state = next;
    }

    expect(Math.min(...tensions)).toBeLessThanOrEqual(4);
    expect(Math.max(...tensions)).toBeGreaterThanOrEqual(8);
    expect(sawSpawn).toBe(true);
    expect(sawRetire).toBe(true);
    expect(moods.size).toBeGreaterThanOrEqual(3);
    expect(wipeoutFlashLed).toBe(true);
  });
});
