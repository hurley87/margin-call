"use node";

import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  isMarketOpen,
  currentEpochSlot,
  dayPosture,
  isOpeningBell,
} from "./tradingHours";
import { assembleUserMessage } from "./epochAssembler";
import { normalizeGeneratedEpoch } from "./epochNormalizer";
import { validateEpoch } from "./epochValidator";
import type { GeneratedNarrativeEpoch, Phase } from "./_schemas";
import type { Id, Doc } from "../_generated/dataModel";

const FALLBACK_NARRATIVE_GENERATION_SYSTEM = `You are the Wire narrative engine for a 1980s Wall Street trading game.
You produce hourly Wire Drop dispatches that serialize an ongoing financial thriller.

OUTPUT FORMAT: Return valid JSON matching the narrative_epoch schema.
- dispatches: exactly 1 item; it must have role "main"
- every dispatch carries a unique kebab-case dispatchKey (e.g. "panatl-margin-call")
- dispatch categories must be one of: wire, floor_talk, sec_watch, boardroom, ticker, positioning. Use wire as the default channel.
- role and category are separate fields. Do not emit role "deal_seed" dispatches.
- dispatch headlines: max 100 characters; present tense; terse
- dispatch bodies: max 180 characters; 1-3 sentences
- dealSeed: always null. Do not emit Deal Seed dispatches.
- arcUpdates: optional, max 3 arcs; tensionDelta between -3 and +3. phase is optional and must be one of: rumor, crack, panic, rupture, fallout, countermove, resolution. Emit phase only when the arc shifts.
- entityMentions: list all entity slugs you referenced in dispatches
- confirmedFacts: optional array, max 8 strings, each <= 160 chars. Use accepted facts from this drop that future drops must not contradict.
- openQuestions: optional array, max 6 strings, each <= 160 chars. Use unresolved concrete questions this drop leaves open.
- materialChange: optional on dispatches, null when absent. Shape: { kind, entitySlug, magnitude? }. kind must be one of asset_loss, personnel_exit, regulatory_action, counterparty_break, filing, position_unwind. entitySlug must be a known roster entity. magnitude may include unitsUsdc and/or label.
- When the PRIMARY arc tension is >= 9, the role=main dispatch carrying that arc MUST set materialChange. Do not satisfy this with vague escalation language alone — the structured materialChange is what counts.

TONE: Paranoid, predatory, terse. 1980s Wall Street financial thriller. Every dispatch implies danger. Funny, never goofy.

STYLE RULES:
- Headlines: ~100 chars max. Terse. Present tense.
- Bodies: ~180 chars max. One to three sentences.
- No emoji. No ellipses for drama.
- Sentences end in facts, not adjectives. "Down $340M." Not "in bad shape."
- Every dispatch must imply a player action: exploit, create, avoid, or watch.

FORBIDDEN LANGUAGE: Never use DeFi, rug, wagmi, wen moon, L2, gas fees, leveraged buyout synergies, exciting opportunity, paradigm shift, stakeholders, going forward, algorithm, machine learning, AI.

NARRATIVE CONTINUITY: Reference previous drops. Advance active arcs. Apply tension updates that reflect what happened in the dispatches.`;

async function runGenerator(
  ctx: ActionCtx,
  opts: { slot: number; sinceMs: number; testLlmStub?: GeneratedNarrativeEpoch }
): Promise<
  | { skipped: "outside-market-hours" | "duplicate-slot" }
  | { skipped: "validation-failed"; error: string }
  | { inserted: boolean; dropId: string; epoch?: number }
> {
  const now = Date.now();
  const { slot, sinceMs } = opts;

  // Load all context in parallel
  const [seasonData, recentDrops, recentGameEvents] = (await Promise.all([
    ctx.runQuery(internal.wire.internal.loadActiveSeason, {}),
    ctx.runQuery(internal.wire.internal.listRecentDrops, { limit: 10 }),
    ctx.runQuery(internal.wire.internal.listRecentGameEvents, {
      since: sinceMs,
    }),
  ])) as [
    {
      season: Doc<"narrativeSeasons">;
      entities: Doc<"narrativeEntities">[];
      arcs: Doc<"narrativeArcs">[];
    } | null,
    Doc<"marketNarratives">[],
    import("./epochAssembler").GameEventCtx[],
  ];

  if (!seasonData) {
    console.warn("[wire/generator] no active season found — skipping");
    return { skipped: "outside-market-hours" };
  }

  const { season, entities, arcs } = seasonData;

  const sortedArcs = [...arcs].sort((a, b) => b.tensionScore - a.tensionScore);
  const topTitles = recentDrops
    .slice(0, 2)
    .map((d) => d.topArcTitle)
    .filter(Boolean);
  const repeatedTopTitle =
    topTitles.length === 2 && topTitles[0] === topTitles[1]
      ? topTitles[0]
      : null;
  const matchingActiveArcs = repeatedTopTitle
    ? sortedArcs.filter((a) => a.title === repeatedTopTitle)
    : [];
  const suppressedSlug =
    matchingActiveArcs.length === 1 ? matchingActiveArcs[0].slug : null;
  const assemblerArcs = suppressedSlug
    ? sortedArcs.filter((a) => a.slug !== suppressedSlug)
    : sortedArcs;
  const postSuppressionPrimaryArc = assemblerArcs[0] ?? null;

  // Current world state from latest drop
  const lastDrop = recentDrops[0];
  const worldState = lastDrop?.worldState as
    | { mood?: string; sec_heat?: number }
    | null
    | undefined;

  const posture = dayPosture(now);
  const lastDropSlot = lastDrop?.epochSlot ?? null;
  const openingBell = isOpeningBell(slot, lastDropSlot);

  const userMessage = assembleUserMessage({
    season: {
      title: season.title,
      tone: season.tone,
      weeklyShape: season.weeklyShape as Record<string, string>,
      styleRules: season.styleRules,
      forbiddenLanguage: season.forbiddenLanguage,
    },
    dayPosture: posture,
    arcs: assemblerArcs.map((a) => ({
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      tensionScore: a.tensionScore,
      phase: a.phase ?? null,
    })),
    entities: entities.map((e) => ({
      slug: e.slug,
      displayName: e.displayName,
      traits: e.traits,
    })),
    recentDrops: recentDrops.map((d) => ({
      epochSlot: d.epochSlot,
      dropTitle: d.dropTitle,
      worldState: d.worldState as { mood?: string; sec_heat?: number } | null,
      headlines: d.headlines as Array<{
        headline?: string;
        role?: string;
      }> | null,
      confirmedFacts: d.confirmedFacts ?? null,
      openQuestions: d.openQuestions ?? null,
    })),
    recentGameEvents,
    worldState: worldState ?? null,
    isOpeningBell: openingBell,
  });

  // ── LLM call (or test stub) ──────────────────────────────────────────────────
  let parsed: GeneratedNarrativeEpoch;

  if (opts.testLlmStub) {
    parsed = opts.testLlmStub;
  } else {
    const OpenAI = (await import("openai")).default;
    const { zodResponseFormat } = await import("openai/helpers/zod");
    const { GeneratedNarrativeEpochSchema } = await import("./_schemas");

    const systemPromptContent = await ctx.runQuery(
      internal.systemPrompts.getActive,
      { name: "narrative_generation" }
    );
    const systemPrompt =
      systemPromptContent ?? FALLBACK_NARRATIVE_GENERATION_SYSTEM;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.parse(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: zodResponseFormat(
          GeneratedNarrativeEpochSchema,
          "narrative_epoch"
        ),
      },
      { timeout: 30_000 }
    );

    const msg = completion.choices[0]?.message;
    if (msg?.refusal) {
      throw new Error(`[wire/generator] LLM refused: ${msg.refusal}`);
    }
    if (!msg?.parsed) {
      throw new Error("[wire/generator] LLM returned no parsed response");
    }
    parsed = msg.parsed as GeneratedNarrativeEpoch;
  }

  // ── Validate ──────────────────────────────────────────────────────────────────
  const arcSlugs = new Set(arcs.map((a) => a.slug));
  const entitySlugs = new Set(entities.map((e) => e.slug));

  const normalized = normalizeGeneratedEpoch(parsed);
  if (normalized.repairedCategoryAliases > 0) {
    console.warn(
      `[wire/generator] normalized ${normalized.repairedCategoryAliases} legacy dispatch category alias(es)`
    );
  }

  const validation = validateEpoch(normalized.epoch, {
    arcSlugs,
    entitySlugs,
    forbiddenLanguage: season.forbiddenLanguage,
    topArcSlug: postSuppressionPrimaryArc?.slug ?? null,
    topArcTension: postSuppressionPrimaryArc?.tensionScore ?? 0,
  });

  if (!validation.ok) {
    console.error(`[wire/generator] validation failed: ${validation.error}`);
    return { skipped: "validation-failed", error: validation.error };
  }

  const validated = validation.data;

  // ── Map slugs → IDs ───────────────────────────────────────────────────────────
  const arcSlugToId = new Map(arcs.map((a) => [a.slug, a._id]));

  const arcRefSlugs = new Set<string>();
  for (const d of validated.dispatches) {
    if (d.arcSlug) arcRefSlugs.add(d.arcSlug);
  }
  const arcRefs = [...arcRefSlugs]
    .map((slug) => arcSlugToId.get(slug))
    .filter((id): id is Id<"narrativeArcs"> => id !== undefined);

  const arcUpdatesMapped: {
    arcId: Id<"narrativeArcs">;
    tensionDelta: number;
    phase?: Phase;
  }[] = [];
  for (const { arcSlug, tensionDelta, phase } of validated.arcUpdates ?? []) {
    const arcId = arcSlugToId.get(arcSlug);
    if (!arcId) continue;
    arcUpdatesMapped.push(
      phase ? { arcId, tensionDelta, phase } : { arcId, tensionDelta }
    );
  }

  let topArcTitle = "Unknown";
  let topArcTension = 0;
  if (postSuppressionPrimaryArc) {
    const primaryDelta =
      validated.arcUpdates?.find(
        (update) => update.arcSlug === postSuppressionPrimaryArc.slug
      )?.tensionDelta ?? 0;
    topArcTitle = postSuppressionPrimaryArc.title;
    topArcTension = Math.min(
      10,
      Math.max(0, postSuppressionPrimaryArc.tensionScore + primaryDelta)
    );
  }

  const rawNarrative = validated.dispatches.map((d) => d.headline).join(" | ");

  const result = await ctx.runMutation(
    internal.wire.persist.persistGeneratedEpoch,
    {
      seasonId: season._id,
      epochSlot: slot,
      dropTitle: validated.dropTitle,
      topArcTitle,
      topArcTension,
      dispatches: validated.dispatches,
      worldState: validated.worldState,
      confirmedFacts: validated.confirmedFacts,
      openQuestions: validated.openQuestions,
      arcRefs,
      arcUpdates: arcUpdatesMapped,
      eventsIngested:
        recentGameEvents.length > 0 ? recentGameEvents : undefined,
      rawNarrative,
    }
  );

  return {
    inserted: result.inserted,
    dropId: result.dropId as string,
    epoch: "epoch" in result ? result.epoch : undefined,
  };
}

/** Hourly cron action — bails outside Mon–Fri 09:30–16:00 ET. */
export const generateNextEpoch = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    if (!isMarketOpen(now)) {
      console.log("[wire/generator] outside market hours — skipping");
      return { skipped: "outside-market-hours" as const };
    }

    const slot = currentEpochSlot(now);
    // Events since the start of the previous epoch slot (avoids re-ingesting
    // events already included in the last drop)
    const sinceMs = (slot - 1) * 3_600_000;

    // Fast pre-check to avoid paying LLM cost on known duplicates
    const existing = await ctx.runQuery(internal.wire.internal.findBySlot, {
      epochSlot: slot,
    });
    if (existing) {
      console.log(`[wire/generator] slot ${slot} already written — skipping`);
      return { skipped: "duplicate-slot" as const };
    }

    return runGenerator(ctx, { slot, sinceMs });
  },
});

/**
 * Dev helper: force-generate regardless of market hours.
 * With ignoreSlot: true, uses Date.now() + monotonic counter so back-to-back
 * dev runs within the same millisecond still produce distinct slots.
 * Triggered via: npx convex run wire/generator:devForceEpoch '{}'
 */
let devForceSlotCounter = 0;
export const devForceEpoch = internalAction({
  args: {
    ignoreSlot: v.optional(v.boolean()),
    _testLlmStub: v.optional(v.any()),
  },
  handler: async (ctx, { ignoreSlot = false, _testLlmStub }) => {
    const now = Date.now();
    const slot = ignoreSlot
      ? now + devForceSlotCounter++
      : currentEpochSlot(now);
    // When ignoreSlot=true, slot is ~Date.now() (ms). (slot-1)*3_600_000 overflows.
    const sinceMs = ignoreSlot ? now - 3_600_000 : (slot - 1) * 3_600_000;

    if (!ignoreSlot) {
      const existing = await ctx.runQuery(internal.wire.internal.findBySlot, {
        epochSlot: slot,
      });
      if (existing) {
        console.log(
          `[wire/generator] devForceEpoch: slot ${slot} already written`
        );
        return { skipped: "duplicate-slot" as const };
      }
    }

    return runGenerator(ctx, {
      slot,
      sinceMs,
      testLlmStub: _testLlmStub as GeneratedNarrativeEpoch | undefined,
    });
  },
});
