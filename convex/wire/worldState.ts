/**
 * Code-authoritative world-state engine — pure, no Convex imports.
 *
 * Each run this computes, from REAL signals only:
 *   - which company / desk arcs to spawn (a move crossed the story threshold)
 *   - how existing arcs advance or cool (attention lifecycle, reactive)
 *   - the market mood (aggregate tape + game events)
 *   - absurd, non-finance floor-talk gossip tied to a company already in play
 *   - the lead directive (token vs. game event vs. quiet)
 *
 * The LLM receives this and writes prose only — it never invents a figure, a
 * stage, a tension level, or an event. Nothing here fabricates a number:
 * cooled/absent signals simply produce no story.
 */

import type { GameEventCtx } from "./epochAssembler";
import { pickQuietAngle, type DropAngle } from "./dropAngles";
import { rankAndSelectLead, type LeadSelection } from "./dramaRanker";
import {
  describeCompanyArc,
  describePlayerArc,
  headlineMovePct,
  type SpawnedArcSpec,
  type ArcSubjectType,
} from "./arcTemplates";
import { type ArcStage, STAGE_TARGET_TENSION, seededInt } from "./stages";
import { MOVE_THRESHOLDS } from "./priceConfig";
import type { TokenSignal } from "./tokenSignals";

export interface ArcInput {
  slug: string;
  title: string;
  summary: string;
  tensionScore: number;
  arcStage: ArcStage;
  peakFired: boolean;
  lastBeatDayKey?: string | null;
  subjectType?: ArcSubjectType | null;
  subjectSlug?: string | null;
}

export interface CompanyCtx {
  slug: string;
  displayName: string;
  symbol: string;
  isHouseToken: boolean;
}

export interface ArcAdvance {
  slug: string;
  fromStage: ArcStage;
  toStage: ArcStage;
  newTensionScore: number;
  peakFiringNow: boolean;
  retiring: boolean;
  ledThisRun: boolean;
  newLastBeatDayKey: string | null;
}

export interface FloorTalkClaim {
  text: string;
  isTrue: boolean;
}

export interface WorldStateAdvanceInput {
  arcs: ArcInput[];
  companies: CompanyCtx[];
  signals: TokenSignal[];
  events: GameEventCtx[];
  dayKey: string;
  dayPosture: string;
  slot: number;
  prevQuietAngleKey?: string | null;
  /** Token slug that led the previous drop; barred from leading again. */
  prevLeadTokenSlug?: string | null;
}

export interface WorldStateAdvance {
  arcAdvances: ArcAdvance[];
  spawnRequests: SpawnedArcSpec[];
  mood: string;
  floorTalkClaims: FloorTalkClaim[];
  lead: LeadSelection;
  primaryArcSlug: string | null;
  quietAngle: DropAngle | null;
}

/** Max fresh arcs to spawn per run, to keep the world legible. */
const MAX_SPAWNS_PER_RUN = 3;
/** Same-direction dramatic outcomes by one desk that make a player streak. */
const PLAYER_STREAK_MIN = 3;

const PEAK_MULTIPLE = 1.5;

/** Derive a company arc's stage from its live signal. */
function stageForCompanySignal(
  signal: TokenSignal,
  peakFired: boolean
): ArcStage {
  const move = Math.abs(headlineMovePct(signal) ?? 0);
  const streak = Math.abs(signal.streakDays);
  if (!peakFired && move >= MOVE_THRESHOLDS.flashPct * PEAK_MULTIPLE) {
    return "peak";
  }
  if (move >= MOVE_THRESHOLDS.flashPct || streak >= 5) return "frenzy";
  if (
    move >= MOVE_THRESHOLDS.storyPct ||
    streak >= MOVE_THRESHOLDS.routinePct
  ) {
    return "talked_about";
  }
  return "noticed";
}

function isStoryWorthy(signal: TokenSignal | undefined): boolean {
  return (
    !!signal &&
    signal.ok &&
    (signal.classification === "story" || signal.classification === "flash")
  );
}

// ── mood ─────────────────────────────────────────────────────────────────────

function computeMood(
  signals: TokenSignal[],
  events: GameEventCtx[],
  lead: LeadSelection,
  dayPosture: string,
  dayKey: string
): string {
  if (lead.gameLead?.type === "wipeout") return "grim";

  if (lead.leadKind === "token" && lead.tokenLead) {
    const move = headlineMovePct(lead.tokenLead) ?? 0;
    if (lead.isFlash) return move < 0 ? "grim" : "electric";
  }

  const priced = signals.filter((s) => s.ok && s.move24hPct != null);
  const red = priced.filter((s) => (s.move24hPct ?? 0) < 0).length;
  const green = priced.length - red;
  if (priced.length >= 4) {
    if (red >= priced.length * 0.7) return "nervous";
    if (green >= priced.length * 0.7) return "greedy";
  }

  if (events.some((e) => e.type === "big_win")) return "greedy";
  if (dayPosture === "monday" || dayPosture === "tuesday") {
    return seededInt(`mood:${dayKey}`, 0, 1) === 0 ? "hungover" : "bored";
  }
  if (events.filter((e) => e.dramatic).length === 0) return "bored";
  return "watchful";
}

// ── floor talk (absurd, non-finance color only) ──────────────────────────────

const FLOOR_TALK_TEMPLATES = [
  (co: string) =>
    `${co}: the intern who covers it went to lunch and hasn't come back`,
  (co: string) => `${co}: someone unplugged the ticker to charge a phone`,
  (co: string) => `${co}: the floor has a betting pool nobody will admit to`,
  (co: string) => `${co}: the payphone by the elevator has rung all morning`,
  (co: string) => `${co}: three people claim they "called it," none in writing`,
  (co: string) => `${co}: the coffee cart guy has a strong opinion today`,
  (co: string) => `${co}: a stack of it is being used to prop open a window`,
] as const;

function buildFloorTalkClaims(
  companyName: string | null,
  dayKey: string,
  slot: number
): FloorTalkClaim[] {
  if (!companyName) return [];
  const startIdx = seededInt(
    `gossip-start:${slot}:${dayKey}`,
    0,
    FLOOR_TALK_TEMPLATES.length - 1
  );
  const idx = startIdx % FLOOR_TALK_TEMPLATES.length;
  const isTrue = seededInt(`gossip:${slot}:${dayKey}:${idx}`, 0, 99) < 60;
  return [{ text: FLOOR_TALK_TEMPLATES[idx]!(companyName), isTrue }];
}

// ── player streaks ───────────────────────────────────────────────────────────

interface PlayerStreak {
  deskSlug: string;
  deskLabel: string;
  direction: "win" | "loss";
  count: number;
}

function detectPlayerStreaks(events: GameEventCtx[]): PlayerStreak[] {
  const byDesk = new Map<
    string,
    { wins: number; losses: number; label: string }
  >();
  for (const e of events) {
    if (!e.traderId) continue;
    const isWin = e.type === "big_win";
    const isLoss =
      e.type === "big_loss" ||
      e.type === "wipeout" ||
      e.type === "trap_resolved";
    if (!isWin && !isLoss) continue;
    const rec = byDesk.get(e.traderId) ?? {
      wins: 0,
      losses: 0,
      label: e.traderName ?? e.traderAddressTrunc ?? "a desk",
    };
    if (isWin) rec.wins++;
    else rec.losses++;
    byDesk.set(e.traderId, rec);
  }
  const streaks: PlayerStreak[] = [];
  for (const [traderId, rec] of byDesk) {
    if (rec.wins >= PLAYER_STREAK_MIN && rec.wins > rec.losses) {
      streaks.push({
        deskSlug: `desk-${traderId}`,
        deskLabel: rec.label,
        direction: "win",
        count: rec.wins,
      });
    } else if (rec.losses >= PLAYER_STREAK_MIN && rec.losses > rec.wins) {
      streaks.push({
        deskSlug: `desk-${traderId}`,
        deskLabel: rec.label,
        direction: "loss",
        count: rec.losses,
      });
    }
  }
  return streaks;
}

// ── main ─────────────────────────────────────────────────────────────────────

export function computeWorldStateAdvance(
  input: WorldStateAdvanceInput
): WorldStateAdvance {
  const {
    arcs,
    companies,
    signals,
    events,
    dayKey,
    dayPosture,
    slot,
    prevQuietAngleKey,
    prevLeadTokenSlug,
  } = input;

  const lead = rankAndSelectLead({ signals, events, prevLeadTokenSlug });

  const signalBySlug = new Map(signals.map((s) => [s.slug, s]));
  const companyBySlug = new Map(companies.map((c) => [c.slug, c]));
  const activeArcSubjectSlugs = new Set(
    arcs.map((a) => a.subjectSlug).filter((s): s is string => !!s)
  );

  // ── advance / cool existing arcs ──
  const arcAdvances: ArcAdvance[] = [];
  for (const arc of arcs) {
    const fromStage = arc.arcStage;
    if (fromStage === "retired") continue;

    let toStage: ArcStage = fromStage;
    let peakFiringNow = false;
    let retiring = false;

    if (arc.subjectType === "company" && arc.subjectSlug) {
      const signal = signalBySlug.get(arc.subjectSlug);
      if (isStoryWorthy(signal)) {
        toStage = stageForCompanySignal(signal!, arc.peakFired);
        if (toStage === "peak" && !arc.peakFired) peakFiringNow = true;
      } else {
        // The move cooled — walk toward aftermath, then retire.
        toStage = fromStage === "aftermath" ? "retired" : "aftermath";
        retiring = toStage === "retired";
      }
    } else {
      // Desk arcs: cool by default (re-spawn/advance below if still streaking).
      toStage = fromStage === "aftermath" ? "retired" : "aftermath";
      retiring = toStage === "retired";
    }

    arcAdvances.push({
      slug: arc.slug,
      fromStage,
      toStage,
      newTensionScore: STAGE_TARGET_TENSION[toStage],
      peakFiringNow,
      retiring,
      ledThisRun: false,
      newLastBeatDayKey: arc.lastBeatDayKey ?? null,
    });
  }

  // ── spawn fresh company arcs for story-worthy signals with no active arc ──
  const spawnRequests: SpawnedArcSpec[] = [];
  const storyCandidates = signals
    .filter((s) => isStoryWorthy(s) && !activeArcSubjectSlugs.has(s.slug))
    .sort(
      (a, b) =>
        Math.abs(headlineMovePct(b) ?? 0) - Math.abs(headlineMovePct(a) ?? 0)
    );
  for (const signal of storyCandidates.slice(0, MAX_SPAWNS_PER_RUN)) {
    const stage = stageForCompanySignal(signal, false);
    const { title, summary } = describeCompanyArc(signal);
    spawnRequests.push({
      slug: `co-${signal.slug}-${slot}`,
      title,
      summary,
      subjectType: "company",
      subjectSlug: signal.slug,
      entitySlug: signal.slug,
      arcStage: stage,
      tensionScore: STAGE_TARGET_TENSION[stage],
    });
  }

  // ── player streak arcs (spawn or re-advance) ──
  const playerStreaks = detectPlayerStreaks(events);
  for (const streak of playerStreaks) {
    const existing = arcs.find(
      (a) => a.subjectSlug === streak.deskSlug && a.arcStage !== "retired"
    );
    const stage: ArcStage = streak.count >= 5 ? "frenzy" : "talked_about";
    if (existing) {
      // Re-heat the cooling advance we may have queued above.
      const adv = arcAdvances.find((a) => a.slug === existing.slug);
      if (adv) {
        adv.toStage = stage;
        adv.newTensionScore = STAGE_TARGET_TENSION[stage];
        adv.retiring = false;
      }
    } else if (spawnRequests.length < MAX_SPAWNS_PER_RUN + 1) {
      const { title, summary } = describePlayerArc(
        streak.deskLabel,
        streak.direction,
        streak.count
      );
      spawnRequests.push({
        slug: `${streak.deskSlug}-${slot}`,
        title,
        summary,
        subjectType: "desk",
        subjectSlug: streak.deskSlug,
        entitySlug: null,
        arcStage: stage,
        tensionScore: STAGE_TARGET_TENSION[stage],
      });
    }
  }

  // ── primary arc + lead bookkeeping ──
  let primaryArcSlug: string | null = null;
  if (lead.leadKind === "token" && lead.tokenLead) {
    const leadSlug = lead.tokenLead.slug;
    // Prefer an existing active arc for the lead company, else its fresh spawn.
    const existing = arcs.find(
      (a) => a.subjectSlug === leadSlug && a.arcStage !== "retired"
    );
    const spawned = spawnRequests.find((s) => s.subjectSlug === leadSlug);
    primaryArcSlug = existing?.slug ?? spawned?.slug ?? null;
  }
  if (!primaryArcSlug) {
    // Highest-tension arc after advancing (fall back to any spawn).
    const ranked = [...arcAdvances]
      .filter((a) => !a.retiring)
      .sort((a, b) => b.newTensionScore - a.newTensionScore);
    primaryArcSlug = ranked[0]?.slug ?? spawnRequests[0]?.slug ?? null;
  }
  if (primaryArcSlug) {
    const adv = arcAdvances.find((a) => a.slug === primaryArcSlug);
    if (adv) {
      adv.ledThisRun = true;
      adv.newLastBeatDayKey = dayKey;
    }
  }

  // ── mood, floor talk, quiet angle ──
  const mood = computeMood(signals, events, lead, dayPosture, dayKey);

  // Company for floor talk: the lead company, else the primary arc's company.
  let floorCompanyName: string | null = null;
  if (lead.leadKind === "token" && lead.tokenLead) {
    floorCompanyName = lead.tokenLead.companyName;
  } else if (primaryArcSlug) {
    const spawned = spawnRequests.find((s) => s.slug === primaryArcSlug);
    const arc = arcs.find((a) => a.slug === primaryArcSlug);
    const subjSlug = spawned?.subjectSlug ?? arc?.subjectSlug ?? null;
    if (subjSlug)
      floorCompanyName = companyBySlug.get(subjSlug)?.displayName ?? null;
  }
  const floorTalkClaims = buildFloorTalkClaims(floorCompanyName, dayKey, slot);

  const quietAngle =
    lead.leadKind === "quiet"
      ? pickQuietAngle(`${slot}:${dayKey}`, prevQuietAngleKey ?? null)
      : null;

  return {
    arcAdvances,
    spawnRequests,
    mood,
    floorTalkClaims,
    lead,
    primaryArcSlug,
    quietAngle,
  };
}
