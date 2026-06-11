/**
 * Code-authoritative world-state engine — pure, no Convex imports.
 *
 * Each run this computes EVERY number and state transition the wire needs:
 *   - per-firm running-loss deltas + totals (monotonic, deterministic)
 *   - arc stage advances through the lifecycle pipeline
 *   - mood + SEC heat
 *   - which fresh arcs to spawn when live arcs run low
 *   - floor-talk gossip with code-assigned truth tags
 *   - the lead directive (real event vs. fiction) from the drama ranker
 *
 * The LLM receives this output and writes prose only — it never invents
 * figures, tension, stages, or transitions.
 */

import type { GameEventCtx } from "./epochAssembler";
import { rankAndSelectLead, type LeadSelection } from "./dramaRanker";
import {
  spawnArc,
  templatePeakLossUsdc,
  type SpawnedArcSpec,
} from "./arcTemplates";
import {
  type ArcStage,
  STAGE_TARGET_TENSION,
  STAGE_BEAT_QUOTA,
  LIVE_STAGES,
  DEFAULT_PEAK_LOSS_USDC,
  nextStage,
  firmStatusForStage,
  targetLossUsdc,
  seededInt,
  seededUnit,
} from "./stages";

export type FirmStatus = "healthy" | "stressed" | "collapsing" | "dead";

export interface ArcInput {
  slug: string;
  title: string;
  summary: string;
  tensionScore: number;
  arcStage: ArcStage;
  beatsPublishedByStage: Record<string, number>;
  climaxFired: boolean;
  lastBeatDayKey?: string | null;
  templateKey?: string | null;
  primaryFirmSlug?: string | null;
}

export interface FirmInput {
  slug: string;
  displayName: string;
  status?: FirmStatus;
  runningLossUsdc: number;
  notableFacts: string[];
  oneOffEventsFired: string[];
  lastLossDayKey?: string | null;
}

export interface FirmDelta {
  slug: string;
  lossDeltaUsdc: number;
  newRunningLossUsdc: number;
  newStatus: FirmStatus;
  appendNotableFacts: string[];
  lastLossDayKey: string;
}

export interface ArcAdvance {
  slug: string;
  fromStage: ArcStage;
  toStage: ArcStage;
  newTensionScore: number;
  beatPublishedThisRun: boolean;
  climaxFiringNow: boolean;
  retiring: boolean;
  newBeatsPublishedByStage: Record<string, number>;
  newLastBeatDayKey: string | null;
}

export interface FloorTalkClaim {
  text: string;
  isTrue: boolean;
}

export interface WorldStateAdvanceInput {
  arcs: ArcInput[];
  firms: FirmInput[];
  events: GameEventCtx[];
  dayKey: string;
  dayPosture: string;
  /** Epoch slot — seeds spawns so back-to-back runs differ deterministically. */
  slot: number;
}

export interface WorldStateAdvance {
  firmDeltas: FirmDelta[];
  arcAdvances: ArcAdvance[];
  mood: string;
  secHeat: number;
  spawnRequests: SpawnedArcSpec[];
  floorTalkClaims: FloorTalkClaim[];
  lead: LeadSelection;
  primaryArcSlug: string | null;
}

const TARGET_LIVE_ARCS = 2;

function peakForArc(arc: ArcInput): number {
  return templatePeakLossUsdc(arc.templateKey) ?? DEFAULT_PEAK_LOSS_USDC;
}

/**
 * Advance the primary fictional arc by at most one beat, gated to ≤1 beat per
 * day, advancing its stage when the stage quota is met. Never advances an arc
 * into a stage another live arc currently occupies (keeps the two live arcs at
 * different stages). Climax fires exactly once.
 */
function advancePrimaryArc(
  primary: ArcInput,
  occupiedStages: Set<ArcStage>,
  dayKey: string
): ArcAdvance {
  const fromStage = primary.arcStage;
  const beats = { ...primary.beatsPublishedByStage };

  // Gate: at most one published beat per day.
  const canBeat = primary.lastBeatDayKey !== dayKey && fromStage !== "retired";

  if (!canBeat) {
    return {
      slug: primary.slug,
      fromStage,
      toStage: fromStage,
      newTensionScore: STAGE_TARGET_TENSION[fromStage],
      beatPublishedThisRun: false,
      climaxFiringNow: false,
      retiring: false,
      newBeatsPublishedByStage: beats,
      newLastBeatDayKey: primary.lastBeatDayKey ?? null,
    };
  }

  beats[fromStage] = (beats[fromStage] ?? 0) + 1;

  let toStage: ArcStage = fromStage;
  let climaxFiringNow = false;
  let retiring = false;

  if (beats[fromStage] >= STAGE_BEAT_QUOTA[fromStage]) {
    let candidate = nextStage(fromStage);

    // Skip climax if it already fired (can never re-enter).
    if (candidate === "climax" && primary.climaxFired) {
      candidate = nextStage("climax"); // → aftermath
    }

    // Don't collide with the other live arc's stage (keep them distinct).
    // Exception: "retired" is terminal and never collides.
    if (candidate !== "retired" && occupiedStages.has(candidate)) {
      candidate = fromStage; // hold this run
    }

    if (candidate !== fromStage) {
      toStage = candidate;
      if (toStage === "climax") climaxFiringNow = true;
      if (toStage === "retired") retiring = true;
    }
  }

  return {
    slug: primary.slug,
    fromStage,
    toStage,
    newTensionScore: STAGE_TARGET_TENSION[toStage],
    beatPublishedThisRun: true,
    climaxFiringNow,
    retiring,
    newBeatsPublishedByStage: beats,
    newLastBeatDayKey: dayKey,
  };
}

/** Step a firm's running loss toward its stage target (monotonic up). */
function computeFirmDelta(
  firm: FirmInput,
  arc: ArcInput,
  toStage: ArcStage,
  stageAdvanced: boolean,
  dayKey: string
): FirmDelta | null {
  const peak = peakForArc(arc);
  const stageTarget = targetLossUsdc(peak, toStage);

  const isNewDay = firm.lastLossDayKey !== dayKey;
  // Only move the number on a stage advance or a fresh trading day.
  if (!stageAdvanced && !isNewDay) return null;

  let newTotal = Math.max(firm.runningLossUsdc, stageTarget);

  // Within-stage daily drift (small, deterministic, never past the next band —
  // and never below the current total, so running losses stay monotonic).
  if (isNewDay && toStage !== "retired" && toStage !== "climax") {
    const driftPct = seededInt(`drift:${firm.slug}:${dayKey}`, 3, 9); // 3–9%
    const drift = Math.round((stageTarget * driftPct) / 100);
    const cap = Math.max(stageTarget, targetLossUsdc(peak, nextStage(toStage)));
    const drifted = Math.min(newTotal + drift, cap);
    newTotal = Math.max(newTotal, drifted);
  }

  const lossDelta = newTotal - firm.runningLossUsdc;
  const newStatus = firmStatusForStage(toStage);

  const appendNotableFacts: string[] = [];
  if (stageAdvanced) {
    const m = `$${(newTotal / 1_000_000).toFixed(0)}M`;
    if (toStage === "confirmation") {
      appendNotableFacts.push(`${firm.displayName} losses confirmed at ${m}`);
    } else if (toStage === "climax") {
      appendNotableFacts.push(`${firm.displayName} losses peaked at ${m}`);
    } else if (toStage === "retired") {
      appendNotableFacts.push(
        `${firm.displayName} wound down; final hole ${m}`
      );
    }
  }

  return {
    slug: firm.slug,
    lossDeltaUsdc: lossDelta,
    newRunningLossUsdc: newTotal,
    newStatus,
    appendNotableFacts,
    lastLossDayKey: dayKey,
  };
}

function computeSecHeat(
  arcs: ArcInput[],
  advancesByStage: Map<string, ArcStage>,
  lead: LeadSelection
): number {
  let heat = 3;
  for (const arc of arcs) {
    const stage = advancesByStage.get(arc.slug) ?? arc.arcStage;
    if (stage === "confirmation") heat += 1;
    else if (stage === "escalation") heat += 2;
    else if (stage === "climax") heat += 3;
  }
  if (lead.leadEvent?.type === "wipeout") heat += 1;
  if (lead.patterns.length > 0) heat += 2;
  return Math.max(0, Math.min(10, heat));
}

function computeMood(
  maxStage: ArcStage,
  lead: LeadSelection,
  events: GameEventCtx[],
  dayPosture: string,
  dayKey: string
): string {
  if (lead.leadEvent?.type === "wipeout") return "grim";
  if (maxStage === "climax") return "panic";
  if (maxStage === "escalation") return "nervous";
  if (maxStage === "confirmation") return "tense";

  // Quiet stages (rumor/denial/aftermath): vary honestly with the day.
  const hasBigWin = events.some((e) => e.type === "big_win");
  if (hasBigWin) return "greedy";
  if (dayPosture === "monday" || dayPosture === "tuesday") {
    return seededUnit(`mood:${dayKey}`) < 0.5 ? "hungover" : "bored";
  }
  if (events.filter((e) => e.dramatic).length === 0) return "bored";
  return "watchful";
}

function buildFloorTalkClaims(
  arcs: ArcInput[],
  advancesByStage: Map<string, ArcStage>,
  dayKey: string,
  slot: number
): FloorTalkClaim[] {
  const claims: FloorTalkClaim[] = [];
  const hot = [...arcs].sort((a, b) => b.tensionScore - a.tensionScore)[0];
  if (!hot) return claims;
  const stage = advancesByStage.get(hot.slug) ?? hot.arcStage;

  const candidates = [
    `${hot.title}: someone senior was seen leaving with boxes`,
    `${hot.title}: a counterparty stopped answering calls this morning`,
    `${hot.title}: the auditors asked for a second conference room`,
  ];
  const n = stage === "rumor" ? 2 : 1;
  for (let i = 0; i < n && i < candidates.length; i++) {
    const isTrue = seededInt(`gossip:${slot}:${dayKey}:${i}`, 0, 99) < 60;
    claims.push({ text: candidates[i], isTrue });
  }
  return claims;
}

export function computeWorldStateAdvance(
  input: WorldStateAdvanceInput
): WorldStateAdvance {
  const { arcs, firms, events, dayKey, dayPosture, slot } = input;

  const lead = rankAndSelectLead(events);

  const liveArcs = arcs
    .filter((a) => a.arcStage !== "retired")
    .sort((a, b) => b.tensionScore - a.tensionScore);
  const primary = liveArcs[0] ?? null;
  const primaryArcSlug = primary?.slug ?? null;

  // Stages occupied by OTHER live arcs (for the distinct-stage rule).
  const occupiedStages = new Set<ArcStage>(
    liveArcs.filter((a) => a.slug !== primary?.slug).map((a) => a.arcStage)
  );

  const arcAdvances: ArcAdvance[] = [];
  if (primary) {
    arcAdvances.push(advancePrimaryArc(primary, occupiedStages, dayKey));
  }
  // Secondary arcs simmer (tension held at their stage target, no beat).
  for (const arc of liveArcs.slice(1)) {
    arcAdvances.push({
      slug: arc.slug,
      fromStage: arc.arcStage,
      toStage: arc.arcStage,
      newTensionScore: STAGE_TARGET_TENSION[arc.arcStage],
      beatPublishedThisRun: false,
      climaxFiringNow: false,
      retiring: false,
      newBeatsPublishedByStage: { ...arc.beatsPublishedByStage },
      newLastBeatDayKey: arc.lastBeatDayKey ?? null,
    });
  }

  const advancesByStage = new Map<string, ArcStage>(
    arcAdvances.map((a) => [a.slug, a.toStage])
  );

  // Firm losses, keyed by each arc's primaryFirmSlug.
  const firmBySlug = new Map(firms.map((f) => [f.slug, f]));
  const arcBySlug = new Map(arcs.map((a) => [a.slug, a]));
  const firmDeltas: FirmDelta[] = [];
  for (const advance of arcAdvances) {
    const arc = arcBySlug.get(advance.slug);
    if (!arc?.primaryFirmSlug) continue;
    const firm = firmBySlug.get(arc.primaryFirmSlug);
    if (!firm) continue;
    const stageAdvanced = advance.fromStage !== advance.toStage;
    const delta = computeFirmDelta(
      firm,
      arc,
      advance.toStage,
      stageAdvanced,
      dayKey
    );
    if (delta) firmDeltas.push(delta);
  }

  // Spawn fresh arcs when live count (after this run's retirements) drops below
  // the target. Gentle: at most one spawn per run.
  const retiringCount = arcAdvances.filter((a) => a.retiring).length;
  const liveAfter = liveArcs.length - retiringCount;
  const spawnRequests: SpawnedArcSpec[] = [];
  if (liveAfter < TARGET_LIVE_ARCS) {
    const taken = new Set<string>();
    for (const a of arcs) {
      taken.add(a.slug);
      if (a.primaryFirmSlug) taken.add(a.primaryFirmSlug);
    }
    for (const f of firms) taken.add(f.slug);
    spawnRequests.push(spawnArc(`${slot}`, taken));
  }

  const maxStage =
    LIVE_STAGES.filter((s) => arcAdvances.some((a) => a.toStage === s)).slice(
      -1
    )[0] ?? "rumor";

  const secHeat = computeSecHeat(arcs, advancesByStage, lead);
  const mood = computeMood(maxStage, lead, events, dayPosture, dayKey);
  const floorTalkClaims = buildFloorTalkClaims(
    arcs,
    advancesByStage,
    dayKey,
    slot
  );

  return {
    firmDeltas,
    arcAdvances,
    mood,
    secHeat,
    spawnRequests,
    floorTalkClaims,
    lead,
    primaryArcSlug,
  };
}
