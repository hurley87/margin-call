import { describe, it, expect } from "vitest";
import { computeWorldStateAdvance } from "../../convex/wire/worldState";
import {
  stepWorld,
  freshArc,
  freshFirm,
  dayKeyForIndex,
  postureForDayIndex,
  type WorldState,
} from "./wireSim";

/** Drive the world for N simulated days (one beat-eligible step per day). */
function runDays(initial: WorldState, days: number) {
  let state = initial;
  const advances = [];
  for (let i = 0; i < days; i++) {
    const { advance, next } = stepWorld(state, {
      dayKey: dayKeyForIndex(i),
      dayPosture: postureForDayIndex(i),
      slot: 1000 + i,
    });
    advances.push(advance);
    state = next;
  }
  return { state, advances };
}

describe("worldState: arc lifecycle", () => {
  it("advances an arc through every stage to retired, firing climax once", () => {
    const initial: WorldState = {
      arcs: [freshArc("alpha", "alpha-co")],
      firms: [freshFirm("alpha-co")],
    };
    const { state, advances } = runDays(initial, 20);

    const stages = advances.flatMap((a) =>
      a.arcAdvances.filter((x) => x.slug === "alpha").map((x) => x.toStage)
    );
    // Reaches climax and retirement.
    expect(stages).toContain("climax");
    expect(stages).toContain("aftermath");
    // Climax fires exactly once for this arc.
    const climaxFirings = advances.filter((a) =>
      a.arcAdvances.some((x) => x.slug === "alpha" && x.climaxFiringNow)
    ).length;
    expect(climaxFirings).toBe(1);
    // The original arc ends retired.
    const alpha = state.arcs.find((a) => a.slug === "alpha");
    expect(alpha?.arcStage).toBe("retired");
  });

  it("keeps the firm running-loss total monotonically non-decreasing", () => {
    const initial: WorldState = {
      arcs: [freshArc("alpha", "alpha-co")],
      firms: [freshFirm("alpha-co")],
    };
    let state = initial;
    let prevLoss = 0;
    for (let i = 0; i < 20; i++) {
      const { next } = stepWorld(state, {
        dayKey: dayKeyForIndex(i),
        dayPosture: postureForDayIndex(i),
        slot: 2000 + i,
      });
      const loss = next.firms.find(
        (f) => f.slug === "alpha-co"
      )!.runningLossUsdc;
      expect(loss).toBeGreaterThanOrEqual(prevLoss);
      prevLoss = loss;
      state = next;
    }
    // It actually accumulated a real loss by the end.
    expect(prevLoss).toBeGreaterThan(0);
  });

  it("publishes at most one beat per arc per day", () => {
    const initial: WorldState = {
      arcs: [freshArc("alpha", "alpha-co")],
      firms: [freshFirm("alpha-co")],
    };
    // Same dayKey twice → the second run must not publish a beat.
    const first = stepWorld(initial, {
      dayKey: "2026-05-05",
      dayPosture: "monday",
      slot: 10,
    });
    const second = stepWorld(first.next, {
      dayKey: "2026-05-05",
      dayPosture: "monday",
      slot: 11,
    });
    expect(first.advance.arcAdvances[0].beatPublishedThisRun).toBe(true);
    expect(second.advance.arcAdvances[0].beatPublishedThisRun).toBe(false);
  });

  it("spawns a fresh arc when live arcs drop below two", () => {
    // Single arc → liveAfter (1) < target (2) → spawn immediately.
    const initial: WorldState = {
      arcs: [freshArc("alpha", "alpha-co")],
      firms: [freshFirm("alpha-co")],
    };
    const { advance } = stepWorld(initial, {
      dayKey: "2026-05-05",
      dayPosture: "monday",
      slot: 42,
    });
    expect(advance.spawnRequests.length).toBeGreaterThanOrEqual(1);
    const spawned = advance.spawnRequests[0];
    expect(spawned.firm.slug).not.toBe("alpha-co");
    expect(spawned.slug).not.toBe("alpha");
  });

  it("does not advance two live arcs into the same stage", () => {
    const initial: WorldState = {
      arcs: [freshArc("alpha", "alpha-co"), freshArc("beta", "beta-co")],
      firms: [freshFirm("alpha-co"), freshFirm("beta-co")],
    };
    const { state } = runDays(initial, 12);
    const liveStages = state.arcs
      .filter((a) => a.arcStage !== "retired")
      .map((a) => a.arcStage);
    const uniq = new Set(liveStages);
    expect(uniq.size).toBe(liveStages.length);
  });

  it("produces at least three distinct moods across a simulated week", () => {
    const initial: WorldState = {
      arcs: [freshArc("alpha", "alpha-co"), freshArc("beta", "beta-co")],
      firms: [freshFirm("alpha-co"), freshFirm("beta-co")],
    };
    const moods = new Set<string>();
    let state = initial;
    for (let i = 0; i < 15; i++) {
      const events =
        i === 7
          ? [
              {
                type: "wipeout",
                dramatic: true,
                summary: "Trader wiped out",
                traderId: "t1",
                magnitudeUsdc: -5000,
              },
            ]
          : [];
      const { advance, next } = stepWorld(state, {
        events,
        dayKey: dayKeyForIndex(i),
        dayPosture: postureForDayIndex(i),
        slot: 3000 + i,
      });
      moods.add(advance.mood);
      state = next;
    }
    expect(moods.size).toBeGreaterThanOrEqual(3);
  });
});

describe("worldState: mood + SEC heat", () => {
  it("a real wipeout lead produces a grim mood and bumps SEC heat", () => {
    const advance = computeWorldStateAdvance({
      arcs: [freshArc("alpha", "alpha-co")],
      firms: [freshFirm("alpha-co")],
      events: [
        {
          type: "wipeout",
          dramatic: true,
          summary: "Trader wiped out",
          traderId: "t1",
          magnitudeUsdc: -9000,
        },
      ],
      dayKey: "2026-05-05",
      dayPosture: "monday",
      slot: 1,
    });
    expect(advance.lead.leadKind).toBe("real_event");
    expect(advance.mood).toBe("grim");
    expect(advance.secHeat).toBeGreaterThanOrEqual(4);
    expect(advance.secHeat).toBeLessThanOrEqual(10);
  });
});
