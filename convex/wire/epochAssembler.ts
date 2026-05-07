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
  /** True if the previous drop contained a deal_seed dispatch. */
  lastDropWasDealSeed: boolean;
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
    lastDropWasDealSeed,
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

  lines.push(`\nCURRENT WORLD STATE:`);
  if (worldState) {
    lines.push(`  mood: ${worldState.mood ?? "unknown"}`);
    lines.push(`  sec_heat: ${worldState.sec_heat ?? 5}/10`);
  } else {
    lines.push("  (no prior state — establish the opening conditions)");
  }

  lines.push(`\nACTIVE STORYLINE ARCS (highest tension first):`);
  if (arcs.length === 0) {
    lines.push("  (no active arcs)");
  } else {
    arcs.forEach((arc, i) => {
      const primary = i === 0 ? " [PRIMARY]" : "";
      lines.push(
        `  ${i + 1}.${primary} ${arc.title} (tension ${arc.tensionScore}/10, slug: ${arc.slug})`
      );
      lines.push(`     ${arc.summary}`);
    });
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

  const dealSeedGuidance = lastDropWasDealSeed
    ? "The previous drop already contained a deal_seed dispatch. Do NOT include another deal_seed dispatch this drop."
    : "You may include one deal_seed dispatch if the storyline warrants it, but it is not required.";
  lines.push(`\nDEAL-SEED GUIDANCE: ${dealSeedGuidance}`);

  lines.push(
    `\nGenerate the next Wire Drop JSON for this hour. Advance the primary arc. Keep it terse and 1980s Wall Street.`
  );

  return lines.join("\n");
}
