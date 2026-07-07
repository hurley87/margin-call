/** Pure assembler — no Convex imports, fully unit-testable. */

import type { ArcStage } from "./stages";
import type { DropAngle } from "./dropAngles";
import type { ArcSubjectType } from "./arcTemplates";

export interface SeasonCtx {
  title: string;
  tone: string;
  weeklyShape: Record<string, string>;
  styleRules: unknown;
  forbiddenLanguage: string[];
}

export interface EntityCtx {
  slug: string;
  displayName: string;
  traits: string[];
}

export interface RecentDropCtx {
  epochSlot?: number | null;
  dropTitle?: string | null;
  worldState?: { mood?: string } | null;
  headlines?: Array<{ headline?: string; role?: string }> | null;
  confirmedFacts?: string[] | null;
  openQuestions?: string[] | null;
}

/**
 * A real game event (deal / PnL / entry / pot / leaderboard). First-class story
 * material alongside token moves. `magnitudeUsdc` is signed (loss negative).
 */
export interface GameEventCtx {
  type: string;
  dramatic: boolean;
  summary: string;
  traderName?: string;
  deskName?: string;
  magnitudeUsdc?: number;
  dealPrompt?: string;
  traderAddressTrunc?: string;
  traderId?: string;
  dealId?: string;
}

/** One company's stored price facts for the tape (all numbers are real). */
export interface CompanyTapeCtx {
  symbol: string;
  companyName: string;
  xHandle: string;
  isHouseToken: boolean;
  priceUsd?: number | null;
  move24hPct?: number | null;
  moveSinceLastPct?: number | null;
  streakDays: number;
  volumeVsTrailing?: number | null;
  volumeAnomaly: boolean;
  classification: string;
}

/** Arc as presented to the LLM — stage + tension are CODE-decided. */
export interface AssemblerArcCtx {
  slug: string;
  title: string;
  summary: string;
  tensionScore: number;
  arcStage: ArcStage;
  isPrimary: boolean;
  subjectType?: ArcSubjectType | null;
  subjectSymbol?: string | null;
  subjectCompanyName?: string | null;
  movePct?: number | null;
  streakDays?: number | null;
  isHouseToken?: boolean;
}

export interface LeadCtx {
  leadKind: "token" | "game_event" | "quiet";
  isFlash: boolean;
  // token lead
  tokenSymbol?: string | null;
  tokenCompanyName?: string | null;
  tokenXHandle?: string | null;
  tokenMovePct?: number | null;
  tokenStreakDays?: number | null;
  tokenIsHouse?: boolean;
  tokenVolumeNote?: string | null;
  // game-event lead
  gameLine?: string | null;
  gameFigureUsdc?: number | null;
  // quiet
  realStatOneLiner?: string | null;
  patterns: Array<{ phrase: string; count: number; traderLabels: string[] }>;
}

export interface FloorTalkCtx {
  text: string;
  isTrue: boolean;
}

/** A verified public statement from a real account (rule 6). v1: usually empty. */
export interface SourcedStatementCtx {
  company: string;
  statement: string;
  sourceRef: string;
}

export interface AssemblerInput {
  season: SeasonCtx;
  dayPosture: string;
  mood: string;
  lead: LeadCtx;
  companyTape: CompanyTapeCtx[];
  arcs: AssemblerArcCtx[];
  entities: EntityCtx[];
  /** Display name of the house token company, if the registry has one. */
  houseTokenName?: string | null;
  floorTalkClaims: FloorTalkCtx[];
  sourcedStatements: SourcedStatementCtx[];
  recentDrops: RecentDropCtx[];
  isOpeningBell: boolean;
  isClosingBell: boolean;
  quietSlotAngle?: DropAngle | null;
}

function dedupeStrings(values: string[], cap: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= cap) break;
  }
  return result;
}

function pushBulletSection(
  lines: string[],
  header: string,
  items: string[]
): void {
  lines.push(`\n${header}`);
  if (items.length === 0) {
    lines.push("  (none)");
    return;
  }
  for (const item of items) lines.push(`  - ${item}`);
}

export function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

function exactUsdc(n: number): number {
  return Number(n.toFixed(2));
}

/** Signed percent, no decimals, e.g. +38% / -22% / unch. */
export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "n/a";
  const r = Math.round(n);
  if (r === 0) return "unch.";
  return `${r > 0 ? "+" : ""}${r}%`;
}

function streakPhrase(streakDays: number | null | undefined): string | null {
  if (streakDays == null) return null;
  const n = Math.abs(streakDays);
  if (n < 2) return null;
  return `${n} straight ${streakDays > 0 ? "up" : "down"} days`;
}

export function assembleUserMessage(input: AssemblerInput): string {
  const {
    season,
    dayPosture,
    mood,
    lead,
    companyTape,
    arcs,
    entities,
    houseTokenName,
    floorTalkClaims,
    sourcedStatements,
    recentDrops,
    isOpeningBell,
    isClosingBell,
    quietSlotAngle,
  } = input;

  const lines: string[] = [];

  lines.push(`SEASON: ${season.title}`);
  lines.push(`TONE: ${season.tone}`);
  const postureDesc =
    (season.weeklyShape as Record<string, string>)[dayPosture] ?? dayPosture;
  lines.push(`DAY: ${dayPosture} — ${postureDesc}`);

  const styleRules = Array.isArray(season.styleRules)
    ? (season.styleRules as string[]).join("\n  - ")
    : String(season.styleRules);
  lines.push(`\nSTYLE RULES:\n  - ${styleRules}`);
  lines.push(
    `\nFORBIDDEN LANGUAGE (never use, case-insensitive): ${season.forbiddenLanguage.join(", ")}`
  );

  lines.push(`\nCURRENT MOOD (code-set — do not alter): ${mood}`);

  // ── LEAD INSTRUCTION — the single most important section ──
  lines.push(`\nLEAD INSTRUCTION (build the role=main dispatch around THIS):`);
  if (lead.leadKind === "token") {
    const move = fmtPct(lead.tokenMovePct);
    const streak = streakPhrase(lead.tokenStreakDays);
    lines.push(
      `  ${lead.isFlash ? "FLASH BULLETIN" : "COMPANY STORY LEADS"}: Shares of ${lead.tokenCompanyName} (${lead.tokenSymbol}) ${lead.tokenMovePct != null && lead.tokenMovePct < 0 ? "fell" : "rose"} ${move}.`
    );
    lines.push(
      `    Use this EXACT figure and symbol — do not round differently or invent another number: ${lead.tokenSymbol} ${move}.`
    );
    if (streak) lines.push(`    Real streak: ${streak}. You may cite it.`);
    if (lead.tokenVolumeNote) lines.push(`    ${lead.tokenVolumeNote}`);
    lines.push(
      `    The move already happened — explain it with absurd, non-plausible floor color (the interns, the payphone, the coffee cart). NEVER invent a real-sounding reason (deals, deployments, listings, investigations, hacks, insiders).`
    );
    if (lead.tokenIsHouse) {
      lines.push(
        `    THIS IS THE HOUSE COMPANY. Be harder on it, self-deprecating, never promotional. Favorable coverage fails review.`
      );
    }
  } else if (lead.leadKind === "game_event") {
    lines.push(`  REAL GAME EVENT LEADS. Report this as the headline:`);
    lines.push(`    ${lead.gameLine ?? "(see recent game events)"}`);
    if (lead.gameFigureUsdc != null) {
      lines.push(
        `    Use this EXACT figure, do not round or invent: ${fmtUsd(lead.gameFigureUsdc)} (${exactUsdc(lead.gameFigureUsdc)} USDC).`
      );
    }
    lines.push(
      `    Name the desk by its display name or truncated address. Keep it in-world.`
    );
  } else {
    lines.push(
      `  QUIET TAPE (nothing crossed the threshold). Write a competent quiet-day column.`
    );
    if (lead.realStatOneLiner) {
      lines.push(
        `    You may weave in this real one-liner: ${lead.realStatOneLiner}`
      );
    }
    lines.push(
      `    Do NOT attach a rumor or story to any company that is not on the COMPANY TAPE below with a real move. These are thin markets; the wire must not appear to move them.`
    );
  }
  if (lead.patterns.length > 0) {
    lines.push(`  TRAP PATTERNS (real; report as a darkly funny pattern):`);
    for (const p of lead.patterns) {
      lines.push(
        `    - ${p.count} desks lost chasing "${p.phrase}" deals: ${p.traderLabels.join(", ")}`
      );
    }
  }

  if (quietSlotAngle) {
    lines.push(`\nANGLE FOR THIS DROP:`);
    lines.push(`  ${quietSlotAngle.instruction}`);
    lines.push(
      `  Suggested category: ${quietSlotAngle.suggestedCategory} (override only if a real event clearly demands another).`
    );
  }

  // ── COMPANY TAPE — real stored numbers only ──
  lines.push(
    `\nCOMPANY TAPE (real stored figures — cite exactly; anything not listed here has no story today):`
  );
  const movers = companyTape.filter((c) => c.classification !== "none");
  if (movers.length === 0) {
    lines.push("  (quiet tape — no company crossed a mention threshold)");
  } else {
    for (const c of movers) {
      const streak = streakPhrase(c.streakDays);
      const vol =
        c.volumeAnomaly && c.volumeVsTrailing != null
          ? `, volume ~${Math.round(c.volumeVsTrailing)}× normal`
          : "";
      const house = c.isHouseToken
        ? " [HOUSE COMPANY — harder, never promotional]"
        : "";
      lines.push(
        `  - ${c.companyName} (${c.symbol}): 24h ${fmtPct(c.move24hPct)}, since last ${fmtPct(c.moveSinceLastPct)}${streak ? `, ${streak}` : ""}${vol}${house}`
      );
    }
  }

  // ── ARC STATE — stages + tension are code-owned ──
  lines.push(`\nARC STATE (stage + tension are code-set; write to them):`);
  if (arcs.length === 0) {
    lines.push("  (no active arcs)");
  } else {
    for (const arc of arcs) {
      const primary = arc.isPrimary ? " [PRIMARY]" : "";
      const subj =
        arc.subjectType === "company" && arc.subjectSymbol
          ? ` [${arc.subjectSymbol}${arc.movePct != null ? ` ${fmtPct(arc.movePct)}` : ""}]`
          : "";
      lines.push(
        `  -${primary} ${arc.title} — stage ${arc.arcStage}, tension ${arc.tensionScore}/10${subj} [slug: ${arc.slug}]`
      );
      lines.push(`     ${arc.summary}`);
    }
  }

  // ── FLOOR TALK — unreliable gossip, absurd + non-finance only ──
  if (floorTalkClaims.length > 0) {
    lines.push(
      `\nFLOOR TALK (gossip — only ~60% true; use as a floor_talk aside, attributed as rumor):`
    );
    for (const c of floorTalkClaims) {
      lines.push(
        `  - [${c.isTrue ? "TRUE" : "FABRICATED — frame as unverified rumor, never as fact"}] ${c.text}`
      );
    }
  }

  // ── SOURCED STATEMENTS — real accounts, verified quotes only (rule 6) ──
  lines.push(
    `\nSOURCED STATEMENTS (real public statements you may reference; frame in period terms, never invent one):`
  );
  if (sourcedStatements.length === 0) {
    lines.push(
      "  (none supplied — do NOT invent posts, quotes, actions, or intentions for any real account or person)"
    );
  } else {
    for (const s of sourcedStatements) {
      lines.push(`  - ${s.company}: "${s.statement}" [source: ${s.sourceRef}]`);
    }
  }

  lines.push(
    `\nCOMPANY ROSTER (only these companies exist; never reference one not on this list):`
  );
  if (entities.length === 0) {
    lines.push("  (none)");
  } else {
    for (const e of entities) {
      lines.push(
        `  - ${e.slug} (${e.displayName})${e.traits.length ? `: ${e.traits.join(", ")}` : ""}`
      );
    }
  }
  if (houseTokenName) {
    lines.push(
      `  NOTE: ${houseTokenName} is the house company — coverage stance is HARDER and never promotional.`
    );
  }

  const dropsToShow = recentDrops.slice(0, 10);
  pushBulletSection(
    lines,
    "CONFIRMED FACTS (do not contradict; do not re-announce):",
    dedupeStrings(
      dropsToShow.flatMap((drop) => drop.confirmedFacts ?? []),
      20
    )
  );
  pushBulletSection(
    lines,
    "OPEN QUESTIONS (still unresolved):",
    dedupeStrings(
      dropsToShow.flatMap((drop) => drop.openQuestions ?? []),
      12
    )
  );
  pushBulletSection(
    lines,
    "DO NOT RE-ANNOUNCE AS NEW (recent headlines):",
    dedupeStrings(
      dropsToShow.flatMap((drop) =>
        (drop.headlines ?? []).map((dispatch) => dispatch.headline ?? "")
      ),
      30
    )
  );

  lines.push(`\nRECENT WIRE DROPS (newest first, for continuity):`);
  if (dropsToShow.length === 0) {
    lines.push("  (none — this is the first drop)");
  } else {
    for (const drop of dropsToShow) {
      const slot = drop.epochSlot != null ? `slot ${drop.epochSlot}` : "seed";
      lines.push(`  [${slot}] ${drop.dropTitle ?? "(untitled)"}`);
      const dispatches = (drop.headlines ?? []) as Array<{
        headline?: string;
      }>;
      dispatches
        .slice(0, 3)
        .forEach((d) => lines.push(`    • ${d.headline ?? ""}`));
    }
  }

  if (isOpeningBell) {
    lines.push(
      `\nMORNING BRIEFING: First drop of the trading day. Lead with the biggest overnight move on the COMPANY TAPE (size crossed the tape before the bell), who is positioned how, and the one name the floor is watching. Electric, gossipy — not a dry recap.`
    );
  }
  if (isClosingBell) {
    lines.push(
      `\nDAILY WRAP: Last drop before the close. Satirical end-of-day column with superlatives — biggest mover, dullest name, quote of the day (the quote must be your own invented FLOOR voice, never attributed to a real company or person). This is the shareable artifact. Make it land.`
    );
  }

  lines.push(
    `\nOUTPUT: Exactly one dispatch, role "main". Category: wire (default), ticker (a flash one-liner), floor_talk (gossip), positioning (who's leaning where). Unique kebab-case dispatchKey. Headline ≤ 12 words. Body 2–3 complete sentences (each ending in . ! or ?). Every post needs a human detail or a joke. Every number MUST come from the COMPANY TAPE / LEAD / game figures above — never invent a price, percentage, dollar amount, or event. entityMentions: ONLY company roster slugs that are the actual subject.` +
      `\nALSO produce tweetVariant: ONE tweet, ≤ 270 characters, same voice. For a company story include the real move (SYMBOL +/-N%) and @-mention the company's handle. Cashtags allowed. NO URLs of any kind. Zero-context read: it must not be mistakable for real news.`
  );

  return lines.join("\n");
}
