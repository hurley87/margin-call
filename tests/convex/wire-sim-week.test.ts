import { describe, it, expect } from "vitest";
import {
  stepWorld,
  freshArc,
  freshFirm,
  dayKeyForIndex,
  postureForDayIndex,
  type WorldState,
} from "./wireSim";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";

/**
 * Acceptance: a simulated week of generation. Starts from the seeded shape
 * (PanAtlantic deep in aftermath + a fresh rumor arc) and runs ~5 trading days
 * × a few hourly slots, feeding fixture game events including a wipeout.
 */
describe("wire: simulated week (acceptance)", () => {
  it("varies tension, retires + spawns arcs, varies mood, and flashes a wipeout", () => {
    // Seed-equivalent starting world: PanAtlantic aftermath (one beat from
    // retiring) + a fresh rumor arc.
    let state: WorldState = {
      arcs: [
        {
          ...freshArc("pan-atlantic-blowup", "pan-atlantic-holdings"),
          arcStage: "aftermath",
          tensionScore: 3,
          climaxFired: true,
          beatsPublishedByStage: {
            rumor: 2,
            denial: 1,
            confirmation: 1,
            escalation: 2,
            climax: 1,
            aftermath: 1,
          },
        },
        freshArc("boy-genius-castle", "castle-securities"),
      ],
      firms: [
        {
          ...freshFirm("pan-atlantic-holdings"),
          status: "collapsing",
          runningLossUsdc: 1_400_000_000,
          notableFacts: ["PanAtlantic losses peaked at $1.4B"],
        },
        freshFirm("castle-securities"),
      ],
    };

    const tensions: number[] = [];
    const moods = new Set<string>();
    let sawRetire = false;
    let sawSpawn = false;
    let wipeoutFlashLed = false;

    let slot = 5000;
    const HOURS_PER_DAY = 6;
    let prevQuietAngleKey: string | null = null;
    let prevQuietAngle: string | null = null;
    for (let day = 0; day < 5; day++) {
      for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
        // Inject a wipeout on day 2, first hour.
        const events: GameEventCtx[] =
          day === 2 && hour === 0
            ? [
                {
                  type: "wipeout",
                  dramatic: true,
                  summary: "Trader liquidated. Cause of death: confidence.",
                  traderId: "trader-x",
                  dealId: "deal-y",
                  magnitudeUsdc: -4200,
                },
              ]
            : [];

        const { advance, next } = stepWorld(state, {
          events,
          dayKey: dayKeyForIndex(day),
          dayPosture: postureForDayIndex(day),
          slot: slot++,
          prevQuietAngleKey,
        });

        if (advance.quietAngle) {
          if (prevQuietAngle) {
            expect(advance.quietAngle.key).not.toBe(prevQuietAngle);
          }
          prevQuietAngle = advance.quietAngle.key;
          prevQuietAngleKey = advance.quietAngle.key;
        } else {
          prevQuietAngle = null;
          prevQuietAngleKey = null;
        }

        for (const a of advance.arcAdvances) tensions.push(a.newTensionScore);
        moods.add(advance.mood);
        if (advance.arcAdvances.some((a) => a.retiring)) sawRetire = true;
        if (advance.spawnRequests.length > 0) sawSpawn = true;
        if (
          events.length > 0 &&
          advance.lead.leadKind === "real_event" &&
          advance.lead.leadEvent?.type === "wipeout"
        ) {
          wipeoutFlashLed = true;
          // Subjects carry deep-link refs for the wiped-out trader + deal.
          expect(advance.lead.subjects).toEqual(
            expect.arrayContaining([
              { type: "trader", id: "trader-x" },
              { type: "deal", id: "deal-y" },
            ])
          );
        }
        state = next;
      }
    }

    // Tension varies across the 2–10 range (not pinned at max).
    const minT = Math.min(...tensions);
    const maxT = Math.max(...tensions);
    expect(minT).toBeLessThanOrEqual(4);
    expect(maxT).toBeGreaterThanOrEqual(8);

    // At least one arc retired and a new one spawned.
    expect(sawRetire).toBe(true);
    expect(sawSpawn).toBe(true);

    // At least three distinct moods.
    expect(moods.size).toBeGreaterThanOrEqual(3);

    // The wipeout led a post (flash-eligible).
    expect(wipeoutFlashLed).toBe(true);

    // PanAtlantic's running loss never dipped below its seeded total.
    const pan = state.firms.find((f) => f.slug === "pan-atlantic-holdings")!;
    expect(pan.runningLossUsdc).toBeGreaterThanOrEqual(1_400_000_000);
  });
});
