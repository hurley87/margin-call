/**
 * Arc construction — pure, no Convex imports, NO fictional names or events.
 *
 * Arcs attach to REAL subjects: a registry company on a sustained move, or a
 * desk on a win/loss streak. Titles and summaries are built from real stored
 * numbers only. They are context for the LLM (which supplies the absurd,
 * non-plausible color) — so they must never assert an invented cause, event, or
 * person. "The floor has noticed" is fine; "amid takeover talk" is not.
 */

import type { ArcStage } from "./stages";
import type { TokenSignal } from "./tokenSignals";

export type ArcSubjectType = "company" | "desk";

export interface SpawnedArcSpec {
  slug: string;
  title: string;
  summary: string;
  subjectType: ArcSubjectType;
  /** Company slug or a synthetic desk slug. */
  subjectSlug: string;
  /** Company entity slug for entityRefs; null for desk arcs (no entity row). */
  entitySlug: string | null;
  arcStage: ArcStage;
  tensionScore: number;
}

/** Signed percent, e.g. +38% / -22%, no decimals for readability. */
export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${Math.round(n)}%`;
}

/** The single most representative real move for a company signal. */
export function headlineMovePct(signal: TokenSignal): number | null {
  const candidates = [signal.move24hPct, signal.moveSinceLastPct].filter(
    (x): x is number => x != null
  );
  if (candidates.length === 0) return null;
  // Largest-magnitude move is the story.
  return candidates.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
}

function streakClause(streakDays: number): string {
  const n = Math.abs(streakDays);
  if (n < 2) return "";
  const dir = streakDays > 0 ? "up" : "down";
  return ` — ${n} straight ${dir} days`;
}

/** Factual title/summary for a company arc, from real numbers only. */
export function describeCompanyArc(signal: TokenSignal): {
  title: string;
  summary: string;
} {
  const move = headlineMovePct(signal);
  const dirWord =
    move == null ? "moving" : move > 0 ? "higher" : move < 0 ? "lower" : "flat";
  const moveStr = move == null ? "" : ` ${fmtPct(move)}`;
  const streak = streakClause(signal.streakDays);
  const volStr = signal.volumeAnomaly
    ? ` Volume ran heavy, roughly ${Math.round(signal.volumeVsTrailing ?? 0)}× its usual.`
    : "";

  const title =
    move == null
      ? `${signal.symbol} in play${streak}`
      : `${signal.symbol} ${dirWord}${moveStr}${streak}`;

  const summary =
    `${signal.companyName} (${signal.symbol}) traded ${dirWord}${moveStr} over the session${streak}.` +
    volStr +
    ` The floor has noticed. The cause is anybody's guess.`;

  return { title, summary };
}

/** Factual title/summary for a desk win/loss streak arc. */
export function describePlayerArc(
  deskLabel: string,
  direction: "win" | "loss",
  count: number
): { title: string; summary: string } {
  const word = direction === "win" ? "wins" : "losses";
  return {
    title: `${deskLabel}: ${count} straight ${word}`,
    summary: `${deskLabel} has booked ${count} ${word} in a row on the tape. The floor has opinions about whether it lasts.`,
  };
}
