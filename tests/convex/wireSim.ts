/**
 * Pure simulation harness for the rebuilt wire world-state engine (NOT a test
 * file — the vitest glob only picks up *.test.ts). Threads arc state forward the
 * same way persist.ts does, so tests can drive streak arcs through their whole
 * lifecycle deterministically.
 */
import {
  computeWorldStateAdvance,
  type ArcInput,
  type CompanyCtx,
  type WorldStateAdvance,
} from "../../convex/wire/worldState";
import type { TokenSignal } from "../../convex/wire/tokenSignals";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";

export interface WorldState {
  arcs: ArcInput[];
}

/** Build a token signal with sensible defaults. */
export function makeSignal(
  slug: string,
  over: Partial<TokenSignal> = {}
): TokenSignal {
  return {
    slug,
    symbol: slug.toUpperCase(),
    companyName: slug,
    xHandle: `@${slug}`,
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
    latestSnapshotId: `${slug}-s`,
    refSnapshotIds: [`${slug}-s`],
    ...over,
  };
}

export function company(
  slug: string,
  over: Partial<CompanyCtx> = {}
): CompanyCtx {
  return {
    slug,
    displayName: slug,
    symbol: slug.toUpperCase(),
    isHouseToken: false,
    ...over,
  };
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
      peakFired: arc.peakFired || adv.peakFiringNow,
      lastBeatDayKey: adv.newLastBeatDayKey,
    };
  });

  for (const spec of advance.spawnRequests) {
    arcs.push({
      slug: spec.slug,
      title: spec.title,
      summary: spec.summary,
      tensionScore: spec.tensionScore,
      arcStage: spec.arcStage,
      peakFired: spec.arcStage === "peak",
      lastBeatDayKey: null,
      subjectType: spec.subjectType,
      subjectSlug: spec.subjectSlug,
    });
  }

  return { arcs };
}

export function stepWorld(
  state: WorldState,
  opts: {
    signals?: TokenSignal[];
    companies?: CompanyCtx[];
    events?: GameEventCtx[];
    dayKey: string;
    dayPosture: string;
    slot: number;
    prevQuietAngleKey?: string | null;
  }
): { advance: WorldStateAdvance; next: WorldState } {
  const advance = computeWorldStateAdvance({
    arcs: state.arcs,
    companies: opts.companies ?? [],
    signals: opts.signals ?? [],
    events: opts.events ?? [],
    dayKey: opts.dayKey,
    dayPosture: opts.dayPosture,
    slot: opts.slot,
    prevQuietAngleKey: opts.prevQuietAngleKey ?? null,
  });
  return { advance, next: applyAdvance(state, advance) };
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
export function postureForDayIndex(i: number): string {
  return WEEKDAYS[i % WEEKDAYS.length];
}
export function dayKeyForIndex(i: number): string {
  const day = String(6 + i).padStart(2, "0");
  return `2026-07-${day}`;
}
