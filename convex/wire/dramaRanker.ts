/**
 * Drama ranking + lead selection — pure, no Convex imports.
 *
 * Takes the real game events gathered since the last wire drop and decides
 * whether a real event is dramatic enough to LEAD the post. If yes, the wire
 * reports the game; if no, a fictional arc beat leads and the best real stat
 * becomes a one-liner. Also detects trap-phrase patterns ("risk-free", etc.)
 * across multiple losing traders.
 */

import type { GameEventCtx } from "./epochAssembler";

/** Score floor a real event must clear to lead the post. */
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

export interface RankedEvent {
  event: GameEventCtx;
  score: number;
}

export interface PatternFinding {
  phrase: string;
  traderLabels: string[];
  count: number;
}

export interface LeadSelection {
  leadKind: "real_event" | "fiction";
  /** Set when leadKind === "real_event". */
  leadEvent: GameEventCtx | null;
  /** A one-liner describing the best real stat, for fiction-lead drops. */
  realStatOneLiner: string | null;
  ranked: RankedEvent[];
  patterns: PatternFinding[];
  /** Real entities behind the lead/secondary events, for subjects deep-links. */
  subjects: Array<{ type: "trader" | "deal" | "manager"; id: string }>;
}

function baseScore(e: GameEventCtx, topDecileAbsUsdc: number): number {
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
  // Keep hyphens so multi-word trap phrases like "risk-free" match intact.
  return prompt.toLowerCase().replace(/[^a-z0-9 -]+/g, " ");
}

/**
 * Detect trap-phrase patterns: ≥2 distinct traders losing on deals whose
 * prompts share a phrase. Emitted as synthetic `loss_pattern` lead candidates.
 */
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
        const label = traderLabel(e);
        const set = byPhrase.get(phrase) ?? new Set<string>();
        set.add(label);
        byPhrase.set(phrase, set);
      }
    }
  }

  const findings: PatternFinding[] = [];
  for (const [phrase, labels] of byPhrase) {
    if (labels.size >= 2) {
      findings.push({
        phrase,
        traderLabels: [...labels],
        count: labels.size,
      });
    }
  }
  // Most-traders-burned first.
  findings.sort((a, b) => b.count - a.count);
  return findings;
}

/** Compute the top-decile absolute magnitude threshold from recent events. */
function topDecileThreshold(events: GameEventCtx[]): number {
  const mags = events
    .map((e) => Math.abs(e.magnitudeUsdc ?? 0))
    .filter((m) => m > 0)
    .sort((a, b) => a - b);
  if (mags.length === 0) return Infinity; // nothing qualifies as "large"
  const idx = Math.floor(mags.length * 0.9);
  return mags[Math.min(idx, mags.length - 1)];
}

function oneLiner(e: GameEventCtx): string {
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

export function rankAndSelectLead(events: GameEventCtx[]): LeadSelection {
  const patterns = detectPatterns(events);

  // Fold detected patterns in as synthetic events so they can win the lead.
  const patternEvents: GameEventCtx[] = patterns.map((p) => ({
    type: "loss_pattern",
    dramatic: true,
    summary: `${p.count} desks burned chasing "${p.phrase}" deals`,
  }));

  const allEvents = [...patternEvents, ...events];
  const topDecile = topDecileThreshold(events);

  const ranked: RankedEvent[] = allEvents
    .map((event) => ({ event, score: baseScore(event, topDecile) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0] ?? null;

  if (top && top.score >= LEAD_THRESHOLD) {
    // Gather subjects from the lead plus any other high-scoring real events.
    const subjectSeen = new Set<string>();
    const subjects: LeadSelection["subjects"] = [];
    for (const { event, score } of ranked) {
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
      leadKind: "real_event",
      leadEvent: top.event,
      realStatOneLiner: null,
      ranked,
      patterns,
      subjects,
    };
  }

  return {
    leadKind: "fiction",
    leadEvent: null,
    realStatOneLiner: top ? oneLiner(top.event) : null,
    ranked,
    patterns,
    subjects: top ? subjectsFor(top.event) : [],
  };
}
