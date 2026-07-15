/**
 * Pure helpers for deal-creation X posts — template + subject resolution.
 * Safe to import from Node actions and unit tests (no Convex / crypto deps).
 */

import { TWEET_MAX_CHARS } from "./tweetVariant";
import {
  tokenByHandle,
  tokenBySlug,
  tokenBySymbol,
  type TokenEntry,
} from "./tokenRegistry";

export type NarrativeSubjectSource = {
  worldState?: { leadTokenSlug?: string | null } | null;
  tweetSubjectHandle?: string | null;
  sourceTrace?: {
    tokenSignals?: Array<{ symbol?: string; slug?: string }>;
    tweetSubjectHandle?: string | null;
  } | null;
};

export type ResolvedDealSubject = {
  subjectSymbol: string | null;
  subjectHandle: string | null;
};

/** Money formatting matching toast / ticker house style. */
export function formatDealTweetMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1000) {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

/**
 * Resolve the company ticker / @handle for a wire epoch the deal was created
 * against. Order: leadTokenSlug → tweetSubjectHandle → first tokenSignal.
 */
export function resolveSubjectFromNarrative(
  narrative: NarrativeSubjectSource | null | undefined
): ResolvedDealSubject {
  if (!narrative) {
    return { subjectSymbol: null, subjectHandle: null };
  }

  const fromSlug = (slug: string | null | undefined): TokenEntry | undefined =>
    slug ? tokenBySlug(slug) : undefined;

  const leadSlug = narrative.worldState?.leadTokenSlug;
  let token = fromSlug(leadSlug ?? undefined);

  const handle =
    narrative.tweetSubjectHandle?.trim() ||
    narrative.sourceTrace?.tweetSubjectHandle?.trim() ||
    null;
  if (!token && handle) {
    token = tokenByHandle(handle);
  }

  if (!token) {
    const signals = narrative.sourceTrace?.tokenSignals ?? [];
    for (const s of signals) {
      token =
        (s.symbol ? tokenBySymbol(s.symbol) : undefined) ??
        (s.slug ? tokenBySlug(s.slug) : undefined);
      if (token) break;
    }
  }

  if (!token) {
    return {
      subjectSymbol: null,
      subjectHandle: handle && handle.startsWith("@") ? handle : null,
    };
  }

  return {
    subjectSymbol: token.symbol,
    subjectHandle: token.xHandle,
  };
}

/**
 * Build the raw deal-created tweet (before sanitizeTweet). Leaves room for
 * sanitizeTweet to append `$SYMBOL` / `@handle` when provided.
 */
export function buildDealTweetText(params: {
  prompt: string;
  potUsdc: number;
  entryCostUsdc: number;
  /** Reserve chars for sanitizer-appended cashtag + handle. */
  reserveChars?: number;
}): string {
  const reserve = params.reserveChars ?? 32;
  const pot = formatDealTweetMoney(params.potUsdc);
  const entry = formatDealTweetMoney(params.entryCostUsdc);
  const suffix = `". Pot ${pot} / entry ${entry}.`;
  const prefix = `NEW DEAL HIT THE FLOOR — "`;
  const maxPrompt = TWEET_MAX_CHARS - reserve - prefix.length - suffix.length;
  const compact = params.prompt.replace(/\s+/g, " ").trim();
  let promptText = compact;
  if (maxPrompt > 8 && compact.length > maxPrompt) {
    const slice = compact.slice(0, maxPrompt - 1);
    const lastSpace = slice.lastIndexOf(" ");
    promptText =
      (lastSpace > 12 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
  }
  return `${prefix}${promptText}${suffix}`;
}
