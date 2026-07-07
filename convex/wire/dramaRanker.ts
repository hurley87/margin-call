/**
 * Lead selection — pure, no Convex imports.
 *
 * Ranks TOKEN price signals and GAME events as uniform candidates and decides
 * what leads the drop:
 *   - a token move over the flash threshold → flash bulletin
 *   - the strongest token story vs. the strongest game event → whichever scores
 *     higher leads
 *   - nothing over threshold → a quiet-tape drop (best real stat woven in)
 *
 * The lead always carries a REAL number (a move % + symbol, or a USDC figure)
 * so every led story is anchored to a stored datum. Also detects trap-phrase
 * patterns across losing deals as darkly-funny game color.
 */

import type { GameEventCtx } from "./epochAssembler";
import type { TokenSignal } from "./tokenSignals";
import { headlineMovePct } from "./arcTemplates";

/** Score floor a candidate must clear to lead the drop. */
export const LEAD_THRESHOLD = 60;

/** Phrases whose recurrence in losing deals the wire calls out as a pattern. */
export const TRAP_PHRASES = [
  "risk-free",
  "risk free",
  "guaranteed",
  "can't lose",
  "cant lose",
  "sure thing",
  "no downside",
  "easy money",
];

export type LeadKind = "token" | "game_event" | "quiet";

export interface PatternFinding {
  phrase: string;
  traderLabels: string[];
  count: number;
}

export interface LeadSelection {
  leadKind: LeadKind;
  /** Set when leadKind === "token". */
  tokenLead: TokenSignal | null;
  /** Set when leadKind === "game_event". */
  gameLead: GameEventCtx | null;
  /** True when the drop is a flash bulletin (big move / wipeout). */
  isFlash: boolean;
  /** Best real one-liner to weave into a quiet drop. */
  realStatOneLiner: string | null;
  patterns: PatternFinding[];
  subjects: Array<{ type: "trader" | "deal" | "manager"; id: string }>;
}

// ── game-event scoring ───────────────────────────────────────────────────────

function gameScore(e: GameEventCtx, topDecileAbsUsdc: number): number {
  switch (e.type) {
    case "wipeout":
      return 100;
    case "loss_pattern":
      return 90;
    case "trap_resolved":
      return 85;
    case "new_number_one":
      return 80;
    case "big_win":
    case "big_loss": {
      const mag = Math.abs(e.magnitudeUsdc ?? 0);
      return mag >= topDecileAbsUsdc ? 70 : 40;
    }
    case "large_entry":
    case "high_pot_deal":
      return 35;
    case "crowded_trade":
      return 30;
    default:
      return 10;
  }
}

function traderLabel(e: GameEventCtx): string {
  return e.traderName ?? e.traderAddressTrunc ?? "an unnamed desk";
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9 -]+/g, " ");
}

export function detectPatterns(events: GameEventCtx[]): PatternFinding[] {
  const byPhrase = new Map<string, Set<string>>();
  for (const e of events) {
    const losing =
      e.type === "big_loss" ||
      e.type === "wipeout" ||
      e.type === "trap_resolved";
    if (!losing || !e.dealPrompt) continue;
    const text = normalizePrompt(e.dealPrompt);
    for (const phrase of TRAP_PHRASES) {
      if (text.includes(phrase)) {
        const set = byPhrase.get(phrase) ?? new Set<string>();
        set.add(traderLabel(e));
        byPhrase.set(phrase, set);
      }
    }
  }
  const findings: PatternFinding[] = [];
  for (const [phrase, labels] of byPhrase) {
    if (labels.size >= 2) {
      findings.push({ phrase, traderLabels: [...labels], count: labels.size });
    }
  }
  findings.sort((a, b) => b.count - a.count);
  return findings;
}

function topDecileThreshold(events: GameEventCtx[]): number {
  const mags = events
    .map((e) => Math.abs(e.magnitudeUsdc ?? 0))
    .filter((m) => m > 0)
    .sort((a, b) => a - b);
  if (mags.length === 0) return Infinity;
  const idx = Math.floor(mags.length * 0.9);
  return mags[Math.min(idx, mags.length - 1)];
}

function gameOneLiner(e: GameEventCtx): string {
  if (e.traderName || e.traderAddressTrunc) {
    return `${traderLabel(e)}: ${e.summary}`;
  }
  return e.summary;
}

function subjectsFor(e: GameEventCtx): LeadSelection["subjects"] {
  const subs: LeadSelection["subjects"] = [];
  if (e.traderId) subs.push({ type: "trader", id: e.traderId });
  if (e.dealId) subs.push({ type: "deal", id: e.dealId });
  return subs;
}

// ── token scoring ────────────────────────────────────────────────────────────

/** Score a token signal on the same scale as game events. */
function tokenScore(signal: TokenSignal): number {
  if (!signal.ok) return 0;
  const move = Math.abs(headlineMovePct(signal) ?? 0);
  if (signal.classification === "flash") return 100 + Math.min(move, 50);
  if (signal.classification === "story") return 65 + Math.min(move, 30);
  if (signal.classification === "routine") return 30 + Math.min(move, 20);
  return 0;
}

function tokenOneLiner(signal: TokenSignal): string {
  const move = headlineMovePct(signal);
  const moveStr =
    move == null
      ? "moving on heavy volume"
      : `${move > 0 ? "up" : "off"} ${Math.abs(Math.round(move))}%`;
  return `${signal.symbol} ${moveStr}`;
}

// ── unified selection ────────────────────────────────────────────────────────

export function rankAndSelectLead(input: {
  signals: TokenSignal[];
  events: GameEventCtx[];
}): LeadSelection {
  const { signals, events } = input;
  const patterns = detectPatterns(events);

  // Fold detected trap patterns in as synthetic game events (can win the lead).
  const patternEvents: GameEventCtx[] = patterns.map((p) => ({
    type: "loss_pattern",
    dramatic: true,
    summary: `${p.count} desks burned chasing "${p.phrase}" deals`,
  }));
  const allEvents = [...patternEvents, ...events];
  const topDecile = topDecileThreshold(events);

  const rankedGame = allEvents
    .map((event) => ({ event, score: gameScore(event, topDecile) }))
    .sort((a, b) => b.score - a.score);
  const topGame = rankedGame[0] ?? null;

  const rankedTokens = signals
    .filter((s) => s.ok)
    .map((signal) => ({ signal, score: tokenScore(signal) }))
    .sort((a, b) => b.score - a.score);
  const topToken = rankedTokens[0] ?? null;

  const gameScoreTop = topGame?.score ?? 0;
  const tokenScoreTop = topToken?.score ?? 0;

  // Nothing crosses the bar → quiet tape.
  if (gameScoreTop < LEAD_THRESHOLD && tokenScoreTop < LEAD_THRESHOLD) {
    // Best available real stat to weave in (token routine move or top game stat).
    const bestRoutineToken = rankedTokens.find((t) => t.score > 0)?.signal;
    const realStatOneLiner = bestRoutineToken
      ? tokenOneLiner(bestRoutineToken)
      : topGame && topGame.score > 0
        ? gameOneLiner(topGame.event)
        : null;
    return {
      leadKind: "quiet",
      tokenLead: null,
      gameLead: null,
      isFlash: false,
      realStatOneLiner,
      patterns,
      subjects: [],
    };
  }

  // Token leads when it scores at least as high as the top game candidate.
  if (topToken && tokenScoreTop >= gameScoreTop) {
    return {
      leadKind: "token",
      tokenLead: topToken.signal,
      gameLead: null,
      isFlash: topToken.signal.classification === "flash",
      realStatOneLiner: null,
      patterns,
      subjects: [],
    };
  }

  // Otherwise a game event leads.
  const gameLead = topGame!.event;
  const subjectSeen = new Set<string>();
  const subjects: LeadSelection["subjects"] = [];
  for (const { event, score } of rankedGame) {
    if (score < LEAD_THRESHOLD) break;
    for (const s of subjectsFor(event)) {
      const key = `${s.type}:${s.id}`;
      if (!subjectSeen.has(key)) {
        subjectSeen.add(key);
        subjects.push(s);
      }
    }
  }
  return {
    leadKind: "game_event",
    tokenLead: null,
    gameLead,
    isFlash: gameLead.type === "wipeout",
    realStatOneLiner: null,
    patterns,
    subjects,
  };
}
