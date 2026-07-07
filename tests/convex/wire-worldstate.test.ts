import { describe, it, expect } from "vitest";
import { computeWorldStateAdvance } from "../../convex/wire/worldState";
import { makeSignal, company, stepWorld, type WorldState } from "./wireSim";

describe("worldState: streak arc lifecycle", () => {
  it("spawns a company arc for a story-worthy move", () => {
    const advance = computeWorldStateAdvance({
      arcs: [],
      companies: [company("kupo")],
      signals: [
        makeSignal("kupo", { move24hPct: 14, classification: "story" }),
      ],
      events: [],
      dayKey: "2026-07-06",
      dayPosture: "monday",
      slot: 1,
    });
    expect(advance.spawnRequests.length).toBe(1);
    const spec = advance.spawnRequests[0];
    expect(spec.subjectType).toBe("company");
    expect(spec.subjectSlug).toBe("kupo");
    expect(spec.arcStage).toBe("talked_about");
  });

  it("does not spawn or lead on companies with no real move (reactive only)", () => {
    const advance = computeWorldStateAdvance({
      arcs: [],
      companies: [company("kupo"), company("nook")],
      signals: [
        makeSignal("kupo", { move24hPct: 2, classification: "routine" }),
        makeSignal("nook", { classification: "none" }),
      ],
      events: [],
      dayKey: "2026-07-06",
      dayPosture: "wednesday",
      slot: 2,
    });
    expect(advance.spawnRequests.length).toBe(0);
    expect(advance.lead.leadKind).toBe("quiet");
  });

  it("escalates to peak on an extreme move and fires peak once", () => {
    const spawn = computeWorldStateAdvance({
      arcs: [],
      companies: [company("surplus")],
      signals: [
        makeSignal("surplus", { move24hPct: 40, classification: "flash" }),
      ],
      events: [],
      dayKey: "2026-07-06",
      dayPosture: "wednesday",
      slot: 3,
    });
    expect(spawn.spawnRequests[0].arcStage).toBe("peak");

    // Once peaked, a still-huge move holds at frenzy — peak never re-fires.
    const advance2 = computeWorldStateAdvance({
      arcs: [
        {
          slug: "co-surplus-3",
          title: "t",
          summary: "s",
          tensionScore: 10,
          arcStage: "peak",
          peakFired: true,
          subjectType: "company",
          subjectSlug: "surplus",
        },
      ],
      companies: [company("surplus")],
      signals: [
        makeSignal("surplus", { move24hPct: 45, classification: "flash" }),
      ],
      events: [],
      dayKey: "2026-07-07",
      dayPosture: "thursday",
      slot: 4,
    });
    const adv = advance2.arcAdvances[0];
    expect(adv.peakFiringNow).toBe(false);
    expect(adv.toStage).toBe("frenzy");
  });

  it("cools a company arc to aftermath then retires it when the move fades", () => {
    let state: WorldState = {
      arcs: [
        {
          slug: "co-kupo-1",
          title: "t",
          summary: "s",
          tensionScore: 8,
          arcStage: "frenzy",
          peakFired: false,
          subjectType: "company",
          subjectSlug: "kupo",
        },
      ],
    };
    const quiet = {
      signals: [makeSignal("kupo", { classification: "none" })],
      companies: [company("kupo")],
    };

    const first = stepWorld(state, {
      ...quiet,
      dayKey: "2026-07-08",
      dayPosture: "wednesday",
      slot: 10,
    });
    expect(first.advance.arcAdvances[0].toStage).toBe("aftermath");
    state = first.next;

    const second = stepWorld(state, {
      ...quiet,
      dayKey: "2026-07-09",
      dayPosture: "thursday",
      slot: 11,
    });
    expect(second.advance.arcAdvances[0].toStage).toBe("retired");
    expect(second.advance.arcAdvances[0].retiring).toBe(true);
  });

  it("spawns a player arc from a same-desk losing streak", () => {
    const advance = computeWorldStateAdvance({
      arcs: [],
      companies: [],
      signals: [],
      events: [
        {
          type: "big_loss",
          dramatic: true,
          summary: "lost",
          traderId: "t1",
          traderName: "Jim",
          magnitudeUsdc: -900,
        },
        {
          type: "big_loss",
          dramatic: true,
          summary: "lost",
          traderId: "t1",
          traderName: "Jim",
          magnitudeUsdc: -800,
        },
        {
          type: "wipeout",
          dramatic: true,
          summary: "gone",
          traderId: "t1",
          traderName: "Jim",
          magnitudeUsdc: -700,
        },
      ],
      dayKey: "2026-07-06",
      dayPosture: "friday",
      slot: 5,
    });
    const desk = advance.spawnRequests.find((s) => s.subjectType === "desk");
    expect(desk).toBeDefined();
    expect(desk!.subjectSlug).toBe("desk-t1");
  });
});

describe("worldState: mood + lead", () => {
  it("a token flash down produces a grim mood and a flash lead", () => {
    const advance = computeWorldStateAdvance({
      arcs: [],
      companies: [company("nook")],
      signals: [
        makeSignal("nook", { move24hPct: -22, classification: "flash" }),
      ],
      events: [],
      dayKey: "2026-07-06",
      dayPosture: "wednesday",
      slot: 6,
    });
    expect(advance.lead.leadKind).toBe("token");
    expect(advance.lead.isFlash).toBe(true);
    expect(advance.mood).toBe("grim");
  });

  it("a wipeout produces a grim mood and leads as a game event", () => {
    const advance = computeWorldStateAdvance({
      arcs: [],
      companies: [company("kupo")],
      signals: [makeSignal("kupo", { classification: "none" })],
      events: [
        {
          type: "wipeout",
          dramatic: true,
          summary: "gone",
          traderId: "t1",
          magnitudeUsdc: -5000,
        },
      ],
      dayKey: "2026-07-06",
      dayPosture: "monday",
      slot: 7,
    });
    expect(advance.lead.leadKind).toBe("game_event");
    expect(advance.mood).toBe("grim");
    expect(advance.quietAngle).toBeNull();
  });

  it("assigns a quiet angle on a quiet tape and rotates it", () => {
    const base = {
      arcs: [],
      companies: [company("kupo")],
      signals: [makeSignal("kupo", { classification: "none" })],
      events: [],
      dayPosture: "monday",
    };
    const a = computeWorldStateAdvance({
      ...base,
      dayKey: "2026-07-06",
      slot: 20,
    });
    const b = computeWorldStateAdvance({
      ...base,
      dayKey: "2026-07-06",
      slot: 21,
      prevQuietAngleKey: a.quietAngle?.key ?? null,
    });
    expect(a.quietAngle).not.toBeNull();
    expect(b.quietAngle).not.toBeNull();
    expect(b.quietAngle?.key).not.toBe(a.quietAngle?.key);
  });

  it("attaches floor talk to a company that is in play", () => {
    const advance = computeWorldStateAdvance({
      arcs: [],
      companies: [company("surplus", { displayName: "Surplus Intelligence" })],
      signals: [
        makeSignal("surplus", {
          companyName: "Surplus Intelligence",
          move24hPct: 38,
          classification: "flash",
        }),
      ],
      events: [],
      dayKey: "2026-07-06",
      dayPosture: "wednesday",
      slot: 8,
    });
    expect(advance.floorTalkClaims.length).toBe(1);
    expect(advance.floorTalkClaims[0].text).toContain("Surplus Intelligence");
  });
});
