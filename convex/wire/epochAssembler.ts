/** Pure assembler — no Convex imports, fully unit-testable. */

import type { ArcStage } from "./stages";

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
  worldState?: { mood?: string; sec_heat?: number } | null;
  headlines?: Array<{ headline?: string; role?: string }> | null;
  confirmedFacts?: string[] | null;
  openQuestions?: string[] | null;
}

export interface GameEventCtx {
  type: string;
  dramatic: boolean;
  summary: string;
  traderName?: string;
  deskName?: string;
  /** Signed dollar magnitude of the event (loss negative, win positive). */
  magnitudeUsdc?: number;
  /** The deal prompt text, when the event is tied to a deal. */
  dealPrompt?: string;
  /** Truncated wallet address for public display, e.g. "0x4f2…a9". */
  traderAddressTrunc?: string;
  /** Raw entity ids for deep-linking / subjects (never shown verbatim). */
  traderId?: string;
  dealId?: string;
}

/** Arc as presented to the LLM — stage + tension are CODE-decided. */
export interface AssemblerArcCtx {
  slug: string;
  title: string;
  summary: string;
  tensionScore: number;
  arcStage: ArcStage;
  isPrimary: boolean;
  beatThisRun: boolean;
  /** Exact firm-loss figure (USDC) to cite when this arc carries a beat. */
  firmLossUsdc?: number | null;
  firmDisplayName?: string | null;
}

/** Code-computed firm state. The LLM never invents these numbers. */
export interface FirmStateCtx {
  displayName: string;
  status: string;
  runningLossUsdc: number;
  newLossDeltaUsdc?: number | null;
  latestFact?: string | null;
}

export interface LeadCtx {
  leadKind: "real_event" | "fiction";
  /** When real_event: the headline-worthy line, with names/addresses. */
  leadLine?: string | null;
  /** Exact figure to use in prose (no rounding, no invention). */
  leadFigureUsdc?: number | null;
  /** When fiction: weave this real stat in as a one-liner. */
  realStatOneLiner?: string | null;
  patterns: Array<{ phrase: string; count: number; traderLabels: string[] }>;
}

export interface FloorTalkCtx {
  text: string;
  isTrue: boolean;
}

export interface AssemblerInput {
  season: SeasonCtx;
  dayPosture: string;
  /** Pre-sorted by tension desc; first is primary. */
  arcs: AssemblerArcCtx[];
  firmStates: FirmStateCtx[];
  entities: EntityCtx[];
  /** Newest-first, up to 10 drops. */
  recentDrops: RecentDropCtx[];
  recentGameEvents: GameEventCtx[];
  lead: LeadCtx;
  floorTalkClaims: FloorTalkCtx[];
  /** Code-computed mood + SEC heat for this drop. */
  mood: string;
  secHeat: number;
  /** True when this is the first drop of the trading day. */
  isOpeningBell: boolean;
  /** True when this is the last drop before the close (daily wrap). */
  isClosingBell: boolean;
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
  for (const item of items) {
    lines.push(`  - ${item}`);
  }
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function assembleUserMessage(input: AssemblerInput): string {
  const {
    season,
    dayPosture,
    arcs,
    firmStates,
    entities,
    recentDrops,
    recentGameEvents,
    lead,
    floorTalkClaims,
    mood,
    secHeat,
    isOpeningBell,
    isClosingBell,
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

  // World state is CODE-AUTHORED. The LLM must not change these.
  lines.push(`\nCURRENT WORLD STATE (code-set — do not alter):`);
  lines.push(`  mood: ${mood}`);
  lines.push(`  sec_heat: ${secHeat}/10`);

  // ── LEAD INSTRUCTION — the single most important section ──────────────────
  lines.push(`\nLEAD INSTRUCTION (build the role=main dispatch around THIS):`);
  if (lead.leadKind === "real_event") {
    lines.push(`  REAL EVENT LEADS. Report this as the headline:`);
    lines.push(`    ${lead.leadLine ?? "(see recent market events)"}`);
    if (lead.leadFigureUsdc != null) {
      lines.push(
        `    Use this EXACT figure, do not round or invent: ${fmtUsd(lead.leadFigureUsdc)} (${lead.leadFigureUsdc} USDC).`
      );
    }
    lines.push(
      `    Name the desk by its display name or truncated address. A fictional arc may appear only as a one-line aside.`
    );
  } else {
    lines.push(
      `  FICTIONAL BEAT LEADS (no real event cleared the drama threshold).`
    );
    const primary = arcs.find((a) => a.isPrimary);
    if (primary) {
      lines.push(
        `    Lead with the primary arc "${primary.title}" at stage ${primary.arcStage} (tension ${primary.tensionScore}/10).`
      );
      if (primary.firmLossUsdc != null && primary.firmLossUsdc > 0) {
        lines.push(
          `    ${primary.firmDisplayName ?? "The firm"}'s running loss is now ${fmtUsd(primary.firmLossUsdc)} (${primary.firmLossUsdc} USDC) — USE THIS EXACT FIGURE.`
        );
      }
    }
    if (lead.realStatOneLiner) {
      lines.push(`    Weave in this real one-liner: ${lead.realStatOneLiner}`);
    }
  }
  if (lead.patterns.length > 0) {
    lines.push(`  TRAP PATTERNS DETECTED (report as a darkly funny pattern):`);
    for (const p of lead.patterns) {
      lines.push(
        `    - ${p.count} desks lost chasing "${p.phrase}" deals: ${p.traderLabels.join(", ")}`
      );
    }
  }

  // ── ARC STATE — stages + tension are code-owned ───────────────────────────
  lines.push(`\nARC STATE (stage + tension are code-set; write to them):`);
  if (arcs.length === 0) {
    lines.push("  (no active arcs)");
  } else {
    arcs.forEach((arc) => {
      const primary = arc.isPrimary ? " [PRIMARY]" : "";
      const beat = arc.beatThisRun ? " (advance this beat)" : " (simmering)";
      lines.push(
        `  -${primary} ${arc.title} — stage ${arc.arcStage}, tension ${arc.tensionScore}/10${beat} [slug: ${arc.slug}]`
      );
      lines.push(`     ${arc.summary}`);
    });
  }

  // ── FIRM STATE — running totals are code-owned ────────────────────────────
  if (firmStates.length > 0) {
    lines.push(`\nFIRM STATE (running totals are code-set — cite exactly):`);
    for (const f of firmStates) {
      const delta =
        f.newLossDeltaUsdc && f.newLossDeltaUsdc > 0
          ? ` (today +${fmtUsd(f.newLossDeltaUsdc)})`
          : "";
      lines.push(
        `  - ${f.displayName}: ${f.status}, running loss ${fmtUsd(f.runningLossUsdc)}${delta}`
      );
      if (f.latestFact) lines.push(`     fact: ${f.latestFact}`);
    }
  }

  // ── FLOOR TALK — unreliable gossip, truth tagged for coherence ────────────
  if (floorTalkClaims.length > 0) {
    lines.push(
      `\nFLOOR TALK CLAIMS (gossip — only ~60% true; you may use as a floor_talk aside, attributed as rumor):`
    );
    for (const c of floorTalkClaims) {
      lines.push(
        `  - [${c.isTrue ? "TRUE" : "FABRICATED — frame as unverified rumor, never as fact"}] ${c.text}`
      );
    }
  }

  lines.push(`\nENTITY ROSTER (only reference entities on this list):`);
  if (entities.length === 0) {
    lines.push("  (none)");
  } else {
    entities.forEach((e) => {
      lines.push(`  - ${e.slug} (${e.displayName}): ${e.traits.join(", ")}`);
    });
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

  lines.push(`\nRECENT WIRE DROPS (newest first, for narrative continuity):`);
  if (dropsToShow.length === 0) {
    lines.push("  (none — this is the first drop)");
  } else {
    dropsToShow.forEach((drop) => {
      const slot = drop.epochSlot != null ? `slot ${drop.epochSlot}` : "seed";
      lines.push(`  [${slot}] ${drop.dropTitle ?? "(untitled)"}`);
      const dispatches = (drop.headlines ?? []) as Array<{
        headline?: string;
        role?: string;
      }>;
      dispatches.slice(0, 3).forEach((d) => {
        lines.push(`    • ${d.headline ?? ""}`);
      });
    });
  }

  // ── Real market events (raw, for color beyond the chosen lead) ────────────
  const dramaticEvents = recentGameEvents.filter((e) => e.dramatic);
  lines.push(
    `\nRECENT MARKET EVENTS — DRAMATIC (real; name desks when relevant):`
  );
  if (dramaticEvents.length === 0) {
    lines.push("  (none)");
  } else {
    dramaticEvents.forEach((e) => {
      const actor = [e.traderName, e.traderAddressTrunc, e.deskName]
        .filter(Boolean)
        .join(" / ");
      const actorTag = actor ? ` [${actor}]` : "";
      lines.push(`  [${e.type}]${actorTag} ${e.summary}`);
    });
  }

  if (isOpeningBell) {
    lines.push(
      `\nMORNING BRIEFING: First drop of the trading day. Lead with what happened overnight or since yesterday's close, who is positioned how, and the one flashpoint the floor is watching. Electric, gossipy anticipation — not a dry recap.`
    );
  }
  if (isClosingBell) {
    lines.push(
      `\nDAILY WRAP: Last drop before the close. Write a satirical end-of-day column with superlatives — biggest winner, dumbest trade, quote of the day (a quote may be fictional and attributed to a roster character). This is the shareable artifact. Make it land.`
    );
  }

  lines.push(
    `\nOUTPUT: Exactly one dispatch, role "main". Pick the category that fits (wire is the default; use ticker for a flash one-liner, floor_talk for gossip, sec_watch for regulators). Every dispatch needs a unique kebab-case dispatchKey. Headline ≤ 12 words. Body 2–3 complete sentences (every sentence must end with . ! or ?). Every post must contain a human detail or a joke. All numbers must come from the figures above — never invent a dollar amount, total, or event. entityMentions: list ONLY fictional roster slugs from the ENTITY ROSTER above — real desks/traders/addresses belong in the prose, never in entityMentions.`
  );

  return lines.join("\n");
}
