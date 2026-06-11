/**
 * Pure simulation harness for the wire world-state engine (NOT a test file —
 * the vitest include glob only picks up *.test.ts). Threads state forward the
 * same way the persist mutation does, so tests can drive arcs through their
 * whole lifecycle deterministically.
 */
import {
  computeWorldStateAdvance,
  type ArcInput,
  type FirmInput,
  type WorldStateAdvance,
} from "../../convex/wire/worldState";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";
import { STAGE_TARGET_TENSION } from "../../convex/wire/stages";

export interface WorldState {
  arcs: ArcInput[];
  firms: FirmInput[];
}

/** Apply one advance to the world, mirroring convex/wire/persist.ts. */
export function applyAdvance(
  state: WorldState,
  advance: WorldStateAdvance
): WorldState {
  const arcs = state.arcs.map((arc) => {
    const adv = advance.arcAdvances.find((a) => a.slug === arc.slug);
    if (!adv) return arc;
    return {
      ...arc,
      arcStage: adv.toStage,
      tensionScore: adv.newTensionScore,
      beatsPublishedByStage: adv.newBeatsPublishedByStage,
      climaxFired: arc.climaxFired || adv.climaxFiringNow,
      lastBeatDayKey: adv.newLastBeatDayKey,
    };
  });

  const firms = state.firms.map((firm) => {
    const delta = advance.firmDeltas.find((d) => d.slug === firm.slug);
    if (!delta) return firm;
    return {
      ...firm,
      runningLossUsdc: delta.newRunningLossUsdc,
      status: delta.newStatus,
      notableFacts: [...firm.notableFacts, ...delta.appendNotableFacts],
      lastLossDayKey: delta.lastLossDayKey,
    };
  });

  // Spawn fresh arcs + firms (rumor stage, loss 0).
  for (const spec of advance.spawnRequests) {
    arcs.push({
      slug: spec.slug,
      title: spec.title,
      summary: spec.summary,
      tensionScore: STAGE_TARGET_TENSION.rumor,
      arcStage: "rumor",
      beatsPublishedByStage: {},
      climaxFired: false,
      lastBeatDayKey: null,
      templateKey: spec.templateKey,
      primaryFirmSlug: spec.firm.slug,
    });
    firms.push({
      slug: spec.firm.slug,
      displayName: spec.firm.displayName,
      status: "healthy",
      runningLossUsdc: 0,
      notableFacts: [],
      oneOffEventsFired: [],
      lastLossDayKey: null,
    });
  }

  return { arcs, firms };
}

/** Run one step: compute the advance and apply it. */
export function stepWorld(
  state: WorldState,
  opts: {
    events?: GameEventCtx[];
    dayKey: string;
    dayPosture: string;
    slot: number;
  }
): { advance: WorldStateAdvance; next: WorldState } {
  const advance = computeWorldStateAdvance({
    arcs: state.arcs,
    firms: state.firms,
    events: opts.events ?? [],
    dayKey: opts.dayKey,
    dayPosture: opts.dayPosture,
    slot: opts.slot,
  });
  return { advance, next: applyAdvance(state, advance) };
}

/** A clean single-firm rumor-stage arc to drive through its lifecycle. */
export function freshArc(slug: string, firmSlug: string): ArcInput {
  return {
    slug,
    title: `${slug} title`,
    summary: `${slug} summary`,
    tensionScore: STAGE_TARGET_TENSION.rumor,
    arcStage: "rumor",
    beatsPublishedByStage: {},
    climaxFired: false,
    lastBeatDayKey: null,
    templateKey: null,
    primaryFirmSlug: firmSlug,
  };
}

export function freshFirm(slug: string): FirmInput {
  return {
    slug,
    displayName: `${slug} Co.`,
    status: "healthy",
    runningLossUsdc: 0,
    notableFacts: [],
    oneOffEventsFired: [],
    lastLossDayKey: null,
  };
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
export function postureForDayIndex(i: number): string {
  return WEEKDAYS[i % WEEKDAYS.length];
}
export function dayKeyForIndex(i: number): string {
  // Deterministic ET-style YYYY-MM-DD keys.
  const day = String(5 + i).padStart(2, "0");
  return `2026-05-${day}`;
}
