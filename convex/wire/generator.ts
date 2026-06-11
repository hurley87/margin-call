"use node";

import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  isMarketOpen,
  isClosingBell,
  currentEpochSlot,
  dayPosture,
  isOpeningBell,
} from "./tradingHours";
import { getTodayDateNY } from "../lib/tradingHours";
import {
  assembleUserMessage,
  type AssemblerArcCtx,
  type FirmStateCtx,
  type GameEventCtx,
} from "./epochAssembler";
import { normalizeGeneratedEpoch } from "./epochNormalizer";
import { validateEpoch } from "./epochValidator";
import { computeWorldStateAdvance } from "./worldState";
import type { ArcStage } from "./stages";
import type { GeneratedNarrativeEpoch } from "./_schemas";
import type { Doc } from "../_generated/dataModel";

const FALLBACK_NARRATIVE_GENERATION_SYSTEM = `You are the in-house columnist for a 1980s Wall Street wire service. You are jaded, gossipy, and darkly funny. You have seen every fraud twice and respect none of the participants.

YOUR JOB: write ONE short dispatch as prose. You do not decide outcomes, numbers, tension, or who wins — that is all handed to you. You make it funny and human.

VOICE RULES:
- Every post must contain a human detail or a joke. Never output only numbers and jargon.
- Explain stakes through consequence, not terminology. Not "margin calls intensify" — instead "lenders would like their money back, immediately, in cash."
- Punch at greed and incompetence. The reader should feel smarter than everyone in the story.
- Comprehensible and funny to someone with zero finance knowledge.
- All numbers come from the provided data. Do NOT invent figures, totals, dates, or events.

BANNED PHRASES (and anything like them): "watch for fallout", "market responds with heightened anxiety", "concerns mount", "pressure intensifies", and any sentence that could appear in a compliance memo.

CALIBRATION:
BAD: "Forced liquidations deepen as PanAtlantic reveals an additional $300M asset loss. Market responds with heightened anxiety."
GOOD: "PanAtlantic misplaced another $300M today, bringing the total to $1.4B, a figure its CFO described as 'temporary' from the back of a taxi. The firm's remaining assets now consist of office furniture and optimism."
GOOD (real game event): "Desk 0x4f2…a9 entered 'Guaranteed Distressed Debt Opportunity' yesterday. The debt was real. The opportunity was for the other guy. Balance: zero. Deals with 'guaranteed' in the title have a perfect record — for their creators."

OUTPUT: strict JSON matching the schema — dropTitle, exactly one dispatch (role "main", unique kebab-case dispatchKey, category from wire/floor_talk/sec_watch/boardroom/ticker/positioning), entityMentions, confirmedFacts, openQuestions. Headline ≤ 12 words. Body 2–4 sentences. No prose outside the JSON.`;

type StoredArc = Doc<"narrativeArcs">;

function arcStageOf(arc: StoredArc): ArcStage {
  return (arc.arcStage as ArcStage | undefined) ?? "rumor";
}

/** Is this real event dramatic enough to fire a flash bulletin? */
function leadIsFlash(
  leadKind: string,
  topType: string | undefined,
  topScore: number
): boolean {
  if (leadKind !== "real_event" || !topType) return false;
  // Per spec: flash only on a wipeout or a top-decile win/loss. A trap or a
  // leaderboard change leads the post but is not a flash bulletin.
  if (topType === "wipeout") return true;
  if ((topType === "big_win" || topType === "big_loss") && topScore >= 70) {
    return true;
  }
  return false;
}

async function runGenerator(
  ctx: ActionCtx,
  opts: {
    slot: number;
    sinceMs: number;
    nowMs: number;
    testLlmStub?: GeneratedNarrativeEpoch;
  }
): Promise<
  | { skipped: "outside-market-hours" | "duplicate-slot" }
  | { skipped: "validation-failed"; error: string }
  | { inserted: boolean; dropId: string; epoch?: number }
> {
  const now = opts.nowMs;
  const { slot, sinceMs } = opts;

  const [seasonData, recentDrops, recentGameEvents, leaderboard] =
    (await Promise.all([
      ctx.runQuery(internal.wire.internal.loadActiveSeason, {}),
      ctx.runQuery(internal.wire.internal.listRecentDrops, { limit: 10 }),
      ctx.runQuery(internal.wire.internal.listRecentGameEvents, {
        since: sinceMs,
      }),
      ctx.runQuery(api.leaderboard.listTraderStats, { limit: 1 }),
    ])) as [
      {
        season: Doc<"narrativeSeasons">;
        entities: Doc<"narrativeEntities">[];
        arcs: Doc<"narrativeArcs">[];
      } | null,
      Doc<"marketNarratives">[],
      GameEventCtx[],
      Array<{ id: string; name: string }>,
    ];

  if (!seasonData) {
    console.warn("[wire/generator] no active season found — skipping");
    return { skipped: "outside-market-hours" };
  }

  const { season, entities, arcs } = seasonData;
  const lastDrop = recentDrops[0];
  const lastWorld = (lastDrop?.worldState ?? {}) as {
    topTraderId?: string;
  };

  // Leaderboard #1 change → synthetic event (prior leader stashed on last drop).
  const events: GameEventCtx[] = [...recentGameEvents];
  const currentTop = leaderboard[0] ?? null;
  if (
    currentTop &&
    lastWorld.topTraderId &&
    currentTop.id !== lastWorld.topTraderId
  ) {
    events.push({
      type: "new_number_one",
      dramatic: true,
      summary: `${currentTop.name} is the new #1 desk on the leaderboard`,
      traderName: currentTop.name,
      traderId: currentTop.id,
    });
  }

  const dayKey = getTodayDateNY(now);
  const posture = dayPosture(now);
  const openingBell = isOpeningBell(slot, lastDrop?.epochSlot ?? null);
  const closingBell = isClosingBell(now);

  // ── Code computes the entire world-state advance ──────────────────────────
  const firmsInput = entities
    .filter((e) => e.kind === "firm")
    .map((e) => ({
      slug: e.slug,
      displayName: e.displayName,
      status: e.status,
      runningLossUsdc: e.runningLossUsdc ?? 0,
      notableFacts: e.notableFacts ?? [],
      oneOffEventsFired: e.oneOffEventsFired ?? [],
      lastLossDayKey: e.lastLossDayKey ?? null,
    }));

  const arcsInput = arcs.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    tensionScore: a.tensionScore,
    arcStage: arcStageOf(a),
    beatsPublishedByStage: a.beatsPublishedByStage ?? {},
    climaxFired: a.climaxFired ?? false,
    lastBeatDayKey: a.lastBeatDayKey ?? null,
    templateKey: a.templateKey ?? null,
    primaryFirmSlug: a.primaryFirmSlug ?? null,
  }));

  const advance = computeWorldStateAdvance({
    arcs: arcsInput,
    firms: firmsInput,
    events,
    dayKey,
    dayPosture: posture,
    slot,
  });

  const arcBySlug = new Map(arcs.map((a) => [a.slug, a]));
  const firmDeltaBySlug = new Map(advance.firmDeltas.map((d) => [d.slug, d]));
  const firmBySlug = new Map(firmsInput.map((f) => [f.slug, f]));

  // Assembler arc context (stage/tension are code-set).
  const assemblerArcs: AssemblerArcCtx[] = advance.arcAdvances
    .flatMap((adv): AssemblerArcCtx[] => {
      const arc = arcBySlug.get(adv.slug);
      if (!arc) return [];
      const firmSlug = arc.primaryFirmSlug ?? undefined;
      const delta = firmSlug ? firmDeltaBySlug.get(firmSlug) : undefined;
      const firm = firmSlug ? firmBySlug.get(firmSlug) : undefined;
      const firmLoss: number | null =
        delta?.newRunningLossUsdc ?? firm?.runningLossUsdc ?? null;
      return [
        {
          slug: adv.slug,
          title: arc.title,
          summary: arc.summary,
          tensionScore: adv.newTensionScore,
          arcStage: adv.toStage,
          isPrimary: adv.slug === advance.primaryArcSlug,
          beatThisRun: adv.beatPublishedThisRun,
          firmLossUsdc: firmLoss,
          firmDisplayName: firm?.displayName ?? null,
        },
      ];
    })
    .sort((a, b) => b.tensionScore - a.tensionScore);

  // Firm state context (running totals are code-set).
  const firmStates: FirmStateCtx[] = [];
  for (const arc of assemblerArcs) {
    const stored = arcBySlug.get(arc.slug);
    const firmSlug = stored?.primaryFirmSlug ?? undefined;
    if (!firmSlug) continue;
    const firm = firmBySlug.get(firmSlug);
    if (!firm) continue;
    const delta = firmDeltaBySlug.get(firmSlug);
    firmStates.push({
      displayName: firm.displayName,
      status: delta?.newStatus ?? firm.status ?? "healthy",
      runningLossUsdc: delta?.newRunningLossUsdc ?? firm.runningLossUsdc,
      newLossDeltaUsdc: delta?.lossDeltaUsdc ?? null,
      latestFact:
        delta?.appendNotableFacts[delta.appendNotableFacts.length - 1] ??
        firm.notableFacts[firm.notableFacts.length - 1] ??
        null,
    });
  }

  // Lead context for the prompt.
  const lead = advance.lead;
  const topRanked = lead.ranked[0] ?? null;
  const leadEvent = lead.leadEvent;
  const leadLine = leadEvent
    ? [leadEvent.traderName, leadEvent.traderAddressTrunc]
        .filter(Boolean)
        .join(" / ") +
      (leadEvent.traderName || leadEvent.traderAddressTrunc ? ": " : "") +
      leadEvent.summary
    : null;
  const leadFigureUsdc = leadEvent?.magnitudeUsdc
    ? Math.abs(leadEvent.magnitudeUsdc)
    : null;

  const primaryAssemblerArc = assemblerArcs.find((a) => a.isPrimary) ?? null;

  const userMessage = assembleUserMessage({
    season: {
      title: season.title,
      tone: season.tone,
      weeklyShape: season.weeklyShape as Record<string, string>,
      styleRules: season.styleRules,
      forbiddenLanguage: season.forbiddenLanguage,
    },
    dayPosture: posture,
    arcs: assemblerArcs,
    firmStates,
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
    recentGameEvents: events,
    lead: {
      leadKind: lead.leadKind,
      leadLine,
      leadFigureUsdc,
      realStatOneLiner: lead.realStatOneLiner,
      patterns: lead.patterns,
    },
    floorTalkClaims: advance.floorTalkClaims,
    mood: advance.mood,
    secHeat: advance.secHeat,
    isOpeningBell: openingBell,
    isClosingBell: closingBell,
  });

  // ── LLM call (prose only) or test stub ────────────────────────────────────
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
        model: "gpt-5-mini",
        // Reasoning models add latency; keep effort low for a terse one-shot
        // dispatch and give the request room beyond the old 30s ceiling.
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: zodResponseFormat(
          GeneratedNarrativeEpochSchema,
          "narrative_epoch"
        ),
      },
      { timeout: 90_000 }
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

  // ── Validate + normalize ──────────────────────────────────────────────────
  const arcSlugs = new Set(arcs.map((a) => a.slug));
  const entitySlugs = new Set(entities.map((e) => e.slug));
  const normalized = normalizeGeneratedEpoch(parsed);
  const validation = validateEpoch(normalized.epoch, {
    arcSlugs,
    entitySlugs,
    forbiddenLanguage: season.forbiddenLanguage,
  });
  if (!validation.ok) {
    console.error(`[wire/generator] validation failed: ${validation.error}`);
    return { skipped: "validation-failed", error: validation.error };
  }
  const validated = validation.data;

  // ── Attach code-owned structured fields to the stored dispatch ────────────
  const primaryFirmSlug = primaryAssemblerArc
    ? (arcBySlug.get(primaryAssemblerArc.slug)?.primaryFirmSlug ?? null)
    : null;
  const primaryFirmDelta = primaryFirmSlug
    ? firmDeltaBySlug.get(primaryFirmSlug)
    : undefined;

  const storedDispatches = validated.dispatches.map((d, i) => {
    if (
      i === 0 &&
      lead.leadKind === "fiction" &&
      primaryFirmSlug &&
      primaryFirmDelta &&
      primaryFirmDelta.newRunningLossUsdc > 0
    ) {
      return {
        ...d,
        materialChange: {
          kind: "asset_loss" as const,
          entitySlug: primaryFirmSlug,
          magnitude: { unitsUsdc: primaryFirmDelta.newRunningLossUsdc },
        },
      };
    }
    return { ...d, materialChange: null };
  });

  const isFlash = leadIsFlash(
    lead.leadKind,
    topRanked?.event.type,
    topRanked?.score ?? 0
  );

  const signal =
    lead.patterns.length > 0
      ? `trap-pattern:${lead.patterns[0].phrase}`
      : leadEvent?.type === "wipeout"
        ? "wipeout-flash"
        : null;

  // Display top-arc = highest-tension arc after advancing (assemblerArcs is
  // sorted desc), which naturally skips an arc that just retired to tension 0.
  const displayArc = assemblerArcs[0] ?? primaryAssemblerArc;
  const topArcTitle = displayArc?.title ?? "Unknown";
  const topArcTension = displayArc?.tensionScore ?? 0;
  const topArcStage = displayArc?.arcStage;

  const worldState = {
    mood: advance.mood,
    sec_heat: advance.secHeat,
    topTraderId: currentTop?.id ?? lastWorld.topTraderId ?? null,
    floorTalkTruth: advance.floorTalkClaims.map((c) => ({
      text: c.text,
      isTrue: c.isTrue,
    })),
  };

  const arcRefSlugs = new Set<string>();
  for (const d of validated.dispatches)
    if (d.arcSlug) arcRefSlugs.add(d.arcSlug);
  const arcRefs = [...arcRefSlugs]
    .map((slug) => arcBySlug.get(slug)?._id)
    .filter((id): id is Doc<"narrativeArcs">["_id"] => id !== undefined);

  const rawNarrative = validated.dispatches.map((d) => d.headline).join(" | ");

  const result = await ctx.runMutation(
    internal.wire.persist.persistGeneratedEpoch,
    {
      seasonId: season._id,
      epochSlot: slot,
      dropTitle: validated.dropTitle,
      topArcTitle,
      topArcTension,
      topArcStage,
      dispatches: storedDispatches,
      worldState,
      confirmedFacts: validated.confirmedFacts,
      openQuestions: validated.openQuestions,
      subjects: lead.subjects,
      isFlash,
      signal,
      arcRefs,
      arcAdvances: advance.arcAdvances.map((a) => ({
        arcSlug: a.slug,
        toStage: a.toStage,
        newTensionScore: a.newTensionScore,
        climaxFiringNow: a.climaxFiringNow,
        retiring: a.retiring,
        newBeatsPublishedByStage: a.newBeatsPublishedByStage,
        newLastBeatDayKey: a.newLastBeatDayKey,
      })),
      firmDeltas: advance.firmDeltas.map((d) => ({
        firmSlug: d.slug,
        newRunningLossUsdc: d.newRunningLossUsdc,
        newStatus: d.newStatus,
        appendNotableFacts: d.appendNotableFacts,
        lastLossDayKey: d.lastLossDayKey,
      })),
      spawnRequests: advance.spawnRequests,
      eventsIngested: events.length > 0 ? events : undefined,
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
    const sinceMs = (slot - 1) * 3_600_000;

    const existing = await ctx.runQuery(internal.wire.internal.findBySlot, {
      epochSlot: slot,
    });
    if (existing) {
      console.log(`[wire/generator] slot ${slot} already written — skipping`);
      return { skipped: "duplicate-slot" as const };
    }

    return runGenerator(ctx, { slot, sinceMs, nowMs: now });
  },
});

/**
 * Dev helper: force-generate regardless of market hours.
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
      nowMs: now,
      testLlmStub: _testLlmStub as GeneratedNarrativeEpoch | undefined,
    });
  },
});
