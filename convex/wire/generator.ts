"use node";

import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { isMarketOpen, currentEpochSlot, dayPosture } from "./tradingHours";
import { assembleUserMessage } from "./epochAssembler";
import { validateEpoch } from "./epochValidator";
import type { NarrativeEpoch } from "./_schemas";
import type { Id } from "../_generated/dataModel";

const FALLBACK_NARRATIVE_GENERATION_SYSTEM = `You are the Wire narrative engine for a 1980s Wall Street trading game.
You produce hourly Wire Drop dispatches that serialize an ongoing financial thriller.

OUTPUT FORMAT: Return valid JSON matching the narrative_epoch schema.
- dispatches: exactly 2-3 items; at least one must have role "main"
- dispatch headlines: max 100 characters; present tense; terse
- dispatch bodies: max 180 characters; 1-3 sentences
- arcUpdates: optional, max 3 arcs; tensionDelta between -3 and +3
- entityMentions: list all entity slugs you referenced in dispatches

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
  opts: { slot: number; sinceMs: number; testLlmStub?: NarrativeEpoch }
): Promise<
  | { skipped: "outside-market-hours" | "duplicate-slot" }
  | { skipped: "validation-failed"; error: string }
  | { inserted: boolean; dropId: string; epoch?: number }
> {
  const now = Date.now();
  const { slot, sinceMs } = opts;

  // Load all context in parallel
  const [seasonData, recentDrops, recentGameEvents] = await Promise.all([
    ctx.runQuery(internal.wire.internal.loadActiveSeason, {}),
    ctx.runQuery(internal.wire.internal.listRecentDrops, { limit: 10 }),
    ctx.runQuery(internal.wire.internal.listRecentGameEvents, {
      since: sinceMs,
    }),
  ]);

  if (!seasonData) {
    console.warn("[wire/generator] no active season found — skipping");
    return { skipped: "outside-market-hours" };
  }

  const { season, entities, arcs } = seasonData;

  // Sort arcs by tension desc for the assembler
  const sortedArcs = [...arcs].sort((a, b) => b.tensionScore - a.tensionScore);

  // Detect last-drop-was-deal-seed flag
  const lastDrop = recentDrops[0];
  const lastDropWasDealSeed =
    Array.isArray(lastDrop?.headlines) &&
    (lastDrop.headlines as Array<{ role?: string }>).some(
      (d) => d.role === "deal_seed"
    );

  // Current world state from latest drop
  const worldState = lastDrop?.worldState as
    | { mood?: string; sec_heat?: number }
    | null
    | undefined;

  const posture = dayPosture(now);

  const userMessage = assembleUserMessage({
    season: {
      title: season.title,
      tone: season.tone,
      weeklyShape: season.weeklyShape as Record<string, string>,
      styleRules: season.styleRules,
      forbiddenLanguage: season.forbiddenLanguage,
    },
    dayPosture: posture,
    arcs: sortedArcs.map((a) => ({
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      tensionScore: a.tensionScore,
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
    })),
    recentGameEvents,
    worldState: worldState ?? null,
    lastDropWasDealSeed,
  });

  // ── LLM call (or test stub) ──────────────────────────────────────────────────
  let parsed: NarrativeEpoch;

  if (opts.testLlmStub) {
    parsed = opts.testLlmStub;
  } else {
    const OpenAI = (await import("openai")).default;
    const { zodResponseFormat } = await import("openai/helpers/zod");
    const { NarrativeEpochSchema } = await import("./_schemas");

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
          NarrativeEpochSchema,
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
    parsed = msg.parsed as NarrativeEpoch;
  }

  // ── Validate ──────────────────────────────────────────────────────────────────
  const arcSlugs = new Set(arcs.map((a) => a.slug));
  const entitySlugs = new Set(entities.map((e) => e.slug));

  const validation = validateEpoch(parsed, {
    arcSlugs,
    entitySlugs,
    forbiddenLanguage: season.forbiddenLanguage,
  });

  if (!validation.ok) {
    console.error(`[wire/generator] validation failed: ${validation.error}`);
    return { skipped: "validation-failed", error: validation.error };
  }

  const validated = validation.data;

  // ── Map slugs → IDs ───────────────────────────────────────────────────────────
  const arcSlugToId = new Map(arcs.map((a) => [a.slug, a._id]));

  // Collect unique arc IDs referenced in dispatches
  const arcRefSlugs = new Set<string>();
  for (const d of validated.dispatches) {
    if (d.arcSlug) arcRefSlugs.add(d.arcSlug);
  }
  const arcRefs = [...arcRefSlugs]
    .map((slug) => arcSlugToId.get(slug))
    .filter((id): id is Id<"narrativeArcs"> => id !== undefined);

  // Map arcUpdates slugs → IDs
  const arcUpdatesMapped = (validated.arcUpdates ?? [])
    .map(({ arcSlug, tensionDelta }) => {
      const arcId = arcSlugToId.get(arcSlug);
      return arcId ? { arcId, tensionDelta } : null;
    })
    .filter(
      (u): u is { arcId: Id<"narrativeArcs">; tensionDelta: number } =>
        u !== null
    );

  // Compute topArc: apply deltas to current scores and find maximum
  const arcTensionAfter = new Map(
    arcs.map((a) => [a._id as string, a.tensionScore])
  );
  for (const { arcSlug, tensionDelta } of validated.arcUpdates ?? []) {
    const arcId = arcSlugToId.get(arcSlug);
    if (arcId) {
      const cur = arcTensionAfter.get(arcId as string) ?? 0;
      arcTensionAfter.set(
        arcId as string,
        Math.min(10, Math.max(0, cur + tensionDelta))
      );
    }
  }

  let topArcTitle = "Unknown";
  let topArcTension = 0;
  let topArcScore = -1;
  for (const arc of arcs) {
    const score = arcTensionAfter.get(arc._id as string) ?? arc.tensionScore;
    if (score > topArcScore) {
      topArcScore = score;
      topArcTitle = arc.title;
      topArcTension = score;
    }
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
 * With ignoreSlot: true, uses Date.now() as the slot so multiple dev runs
 * in the same clock hour each write a distinct row.
 * Triggered via: npx convex run wire/generator:devForceEpoch '{}'
 */
export const devForceEpoch = internalAction({
  args: {
    ignoreSlot: v.optional(v.boolean()),
    _testLlmStub: v.optional(v.any()),
  },
  handler: async (ctx, { ignoreSlot = false, _testLlmStub }) => {
    const now = Date.now();
    const slot = ignoreSlot ? now : currentEpochSlot(now);
    // When ignoreSlot=true, slot=Date.now() (ms). (slot-1)*3_600_000 overflows.
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
      testLlmStub: _testLlmStub as NarrativeEpoch | undefined,
    });
  },
});
