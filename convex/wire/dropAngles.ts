/**
 * Deterministic narrative angles for quiet wire slots — pure, no Convex imports.
 *
 * When the primary arc has no beat to publish and the lead is fiction, the
 * world state is unchanged hour-to-hour. Rotating angles gives the LLM a fresh
 * lens on the same facts without inventing new events or figures.
 */

import type { Category } from "./_schemas";
import { seededInt } from "./stages";

export interface DropAngle {
  key: string;
  instruction: string;
  suggestedCategory: Category;
}

export const DROP_ANGLES: readonly DropAngle[] = [
  {
    key: "quiet-tape",
    instruction:
      "A quiet-tape column — nothing crossed the wire today, and you say so with style. Light on numbers, heavy on the boredom of a flat session. Do NOT invent figures, events, or moves.",
    suggestedCategory: "wire",
  },
  {
    key: "junior-analyst",
    instruction:
      "Junior-analyst gallows humor on the floor — darkly funny, self-aware, citing only the provided figures. Do NOT invent numbers or developments.",
    suggestedCategory: "wire",
  },
  {
    key: "floor-schadenfreude",
    instruction:
      "Floor schadenfreude — the desk enjoying a slow day at someone's expense, attributed as gossip. Do NOT invent facts beyond what is provided.",
    suggestedCategory: "floor_talk",
  },
  {
    key: "ticker-recap",
    instruction:
      "Terse ticker-style recap — one sharp line of context, one punchline. Minimal words, maximum attitude. Use only provided figures.",
    suggestedCategory: "ticker",
  },
  {
    key: "mundane-human",
    instruction:
      "Mundane human detail — elevator small talk, coffee run, someone pretending not to check the tape. The market is background noise. No new facts.",
    suggestedCategory: "wire",
  },
  {
    key: "echo-confirmed",
    instruction:
      "Echo an earlier confirmed fact from a new angle — reframe something already on the tape. Do NOT claim anything new happened.",
    suggestedCategory: "wire",
  },
  {
    key: "positioning-whisper",
    instruction:
      "Positioning whisper — who on the floor is quietly leaning which way, cynical and insider-y, but strictly no invented figures or events.",
    suggestedCategory: "positioning",
  },
] as const;

const ANGLE_BY_KEY = new Map(DROP_ANGLES.map((a) => [a.key, a]));

/**
 * Pick a deterministic angle for a quiet slot, excluding the previous drop's
 * angle so consecutive quiet hours never repeat the same lens.
 */
export function pickQuietAngle(
  seed: string,
  prevKey: string | null
): DropAngle {
  const pool = prevKey
    ? DROP_ANGLES.filter((a) => a.key !== prevKey)
    : [...DROP_ANGLES];
  if (pool.length === 0) {
    return DROP_ANGLES[0]!;
  }
  const idx = seededInt(`quiet-angle:${seed}`, 0, pool.length - 1);
  return pool[idx]!;
}

/** Look up an angle by key (for retry after near-duplicate detection). */
export function angleByKey(key: string): DropAngle | undefined {
  return ANGLE_BY_KEY.get(key);
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "what",
  "which",
  "who",
  "whom",
  "whose",
]);

/** Tokenize a headline for similarity comparison. */
export function tokenizeHeadline(headline: string): Set<string> {
  const tokens = headline
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/** Jaccard similarity between two token sets. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const NEAR_DUPLICATE_THRESHOLD = 0.65;

/** True when headline is too similar to any recent headline. */
export function isNearDuplicateHeadline(
  headline: string,
  recentHeadlines: string[]
): boolean {
  const tokens = tokenizeHeadline(headline);
  for (const recent of recentHeadlines) {
    const recentTokens = tokenizeHeadline(recent);
    if (jaccardSimilarity(tokens, recentTokens) >= NEAR_DUPLICATE_THRESHOLD) {
      return true;
    }
  }
  return false;
}

/** Collect main headlines from recent drops (newest-first). */
export function recentHeadlinesFromDrops(
  drops: Array<{
    headlines?: Array<{ headline?: string; role?: string }> | null;
  }>
): string[] {
  const result: string[] = [];
  for (const drop of drops) {
    const dispatches = drop.headlines ?? [];
    const main = dispatches.find((d) => d.role === "main") ?? dispatches[0];
    if (main?.headline) result.push(main.headline);
  }
  return result;
}
