/** Pure assembler — no Convex imports, fully unit-testable. */

export interface SeasonCtx {
  title: string;
  tone: string;
  weeklyShape: Record<string, string>;
  styleRules: unknown;
  forbiddenLanguage: string[];
}

export interface ArcCtx {
  slug: string;
  title: string;
  summary: string;
  tensionScore: number;
  phase?: string | null;
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
}

export interface AssemblerInput {
  season: SeasonCtx;
  dayPosture: string;
  /** Pre-sorted by tensionScore desc by the caller. */
  arcs: ArcCtx[];
  entities: EntityCtx[];
  /** Newest-first, up to 10 drops. */
  recentDrops: RecentDropCtx[];
  recentGameEvents: GameEventCtx[];
  /** worldState from the most recent drop, or null. */
  worldState: { mood?: string; sec_heat?: number } | null;
  /** True when this is the first drop of the trading day. */
  isOpeningBell: boolean;
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

export function assembleUserMessage(input: AssemblerInput): string {
  const {
    season,
    dayPosture,
    arcs,
    entities,
    recentDrops,
    recentGameEvents,
    worldState,
    isOpeningBell,
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
    `\nFORBIDDEN LANGUAGE (never use): ${season.forbiddenLanguage.join(", ")}`
  );
  lines.push(
    "\nPHASES: rumor -> crack -> panic -> rupture -> fallout -> countermove -> resolution. Emit a phase on arcUpdates only when the arc shifts."
  );

  lines.push(`\nCURRENT WORLD STATE:`);
  if (worldState) {
    lines.push(`  mood: ${worldState.mood ?? "unknown"}`);
    lines.push(`  sec_heat: ${worldState.sec_heat ?? 5}/10`);
  } else {
    lines.push("  (no prior state — establish the opening conditions)");
  }

  if (isOpeningBell) {
    lines.push(
      `\nOPENING BELL: This is the first Wire Drop of the trading day. Structure it as a morning briefing:\n  - Lead with what happened overnight or since yesterday's close\n  - State who is positioned how heading into today\n  - Name the one central flashpoint the floor will be watching\n  - Tone: electric anticipation. The bell just rang. Not a recap — a call to arms.`
    );
  }

  lines.push(`\nACTIVE STORYLINE ARCS (highest tension first):`);
  if (arcs.length === 0) {
    lines.push("  (no active arcs)");
  } else {
    arcs.forEach((arc, i) => {
      const primary = i === 0 ? " [PRIMARY]" : "";
      const phase = arc.phase ? ` — phase: ${arc.phase}` : "";
      lines.push(
        `  ${i + 1}.${primary} ${arc.title} (tension ${arc.tensionScore}/10, slug: ${arc.slug})${phase}`
      );
      lines.push(`     ${arc.summary}`);
    });
  }

  const primaryArc = arcs[0] ?? null;
  if (primaryArc && primaryArc.tensionScore >= 9) {
    lines.push(
      `\nMATERIAL EVENT REQUIRED: The PRIMARY arc "${primaryArc.title}" (slug: ${primaryArc.slug}) is at tension ${primaryArc.tensionScore}/10. The role=main dispatch carrying this arc MUST set materialChange: { kind, entitySlug, magnitude? }. kind must be one of asset_loss, personnel_exit, regulatory_action, counterparty_break, filing, position_unwind. entitySlug must come from the roster. Vague escalation language alone does not satisfy this.`
    );
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
      if (drop.worldState) {
        const ws = drop.worldState as { mood?: string; sec_heat?: number };
        lines.push(
          `    world: ${ws.mood ?? "unknown"}, SEC heat ${ws.sec_heat ?? "?"}/10`
        );
      }
    });
  }

  const dramaticEvents = recentGameEvents.filter((e) => e.dramatic);
  const routineEvents = recentGameEvents.filter((e) => !e.dramatic);

  lines.push(
    `\nRECENT MARKET EVENTS — DRAMATIC (name traders/desks directly when relevant):`
  );
  if (dramaticEvents.length === 0) {
    lines.push("  (none)");
  } else {
    dramaticEvents.forEach((e) => {
      const actor = [e.traderName, e.deskName].filter(Boolean).join(" @ ");
      const actorTag = actor ? ` [${actor}]` : "";
      lines.push(`  [${e.type}]${actorTag} ${e.summary}`);
    });
  }

  lines.push(
    `\nRECENT MARKET EVENTS — ROUTINE (influence mood, SEC heat, arc tension in aggregate; do not name every player):`
  );
  if (routineEvents.length === 0) {
    lines.push("  (none)");
  } else {
    routineEvents.forEach((e) => {
      lines.push(`  [${e.type}] ${e.summary}`);
    });
  }

  lines.push(
    '\nWIRE FORMAT OVERRIDE: Generate exactly one dispatch for this hour. It must have role "main". Set dealSeed to null and do not emit role "deal_seed" dispatches.'
  );

  lines.push(
    `\nGenerate the next Wire Drop JSON for this hour. Advance the primary arc. Keep it terse and 1980s Wall Street. Every dispatch MUST have a unique dispatchKey (short, kebab-case, e.g. "panatl-margin-call").`
  );

  return lines.join("\n");
}
