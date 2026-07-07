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
  type CompanyTapeCtx,
  type GameEventCtx,
  type LeadCtx,
} from "./epochAssembler";
import { normalizeGeneratedEpoch } from "./epochNormalizer";
import { validateEpoch, type ValidatedEpoch } from "./epochValidator";
import {
  computeWorldStateAdvance,
  type ArcInput,
  type CompanyCtx,
} from "./worldState";
import type { ArcStage } from "./stages";
import { headlineMovePct } from "./arcTemplates";
import type { TokenSignal } from "./tokenSignals";
import { houseToken } from "./tokenRegistry";
import { sanitizeTweet } from "./tweetVariant";
import { getTweetPoster } from "./tweetPoster";
import type { GeneratedNarrativeEpoch } from "./_schemas";
import {
  isNearDuplicateHeadline,
  pickQuietAngle,
  recentHeadlinesFromDrops,
  type DropAngle,
} from "./dropAngles";
import type { Doc } from "../_generated/dataModel";

const FALLBACK_NARRATIVE_GENERATION_SYSTEM = `You are the anonymous columnist for a 1980s stock-wire gossip service. Jaded, gossipy, darkly funny. You cover a handful of listed companies as if it were 1985 — the floor, the tape, the bell, block trades, analysts, "could not be reached for comment."

RULES (non-negotiable):
1. NO crypto / finance-tech vocabulary (token, coin, wallet, market cap, onchain, pump, etc.). These are COMPANIES; holdings are shares / common stock.
2. NO named fictional humans. The only invented voice is the collective desk (the floor, the interns, sources).
3. Every company story cites a REAL number handed to you. The move is real; your explanation is invented and absurd.
4. Reactive only: explain moves that already happened; never imply something is about to happen; never attach a story to a company with no real move.
5. Absurd, not plausible: color lives in the wire's silly world (the interns, the payphone). NEVER invent a realistic company/finance event (deals, launches, listings, investigations, selling), even as a joke.
6. Real accounts/people: only actual provided statements; never invent quotes, actions, or intentions.
7. The house company gets harder, self-deprecating, never-promotional coverage.

Also produce tweetVariant: one tweet ≤270 chars, same voice, real move (SYMBOL +/-N%) + @-mention the company when it's the subject, cashtags ok, NO URLs.

OUTPUT: strict JSON matching the schema. Headline ≤ 12 words. Body 2–3 complete sentences (each ending in . ! or ?). No prose outside the JSON object.`;

type StoredArc = Doc<"narrativeArcs">;

function arcStageOf(arc: StoredArc): ArcStage {
  return (arc.arcStage as ArcStage | undefined) ?? "noticed";
}

function tokenVolumeNote(signal: TokenSignal): string | null {
  if (!signal.volumeAnomaly || signal.volumeVsTrailing == null) return null;
  return `Volume ran heavy — roughly ${Math.round(signal.volumeVsTrailing)}× its usual.`;
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

  const [seasonData, recentDrops, recentGameEvents, leaderboard, signals] =
    (await Promise.all([
      ctx.runQuery(internal.wire.internal.loadActiveSeason, {}),
      ctx.runQuery(internal.wire.internal.listRecentDrops, { limit: 10 }),
      ctx.runQuery(internal.wire.internal.listRecentGameEvents, {
        since: sinceMs,
      }),
      ctx.runQuery(api.leaderboard.listTraderStats, { limit: 1 }),
      ctx.runQuery(internal.wire.tokenSignals.loadTokenSignals, {}),
    ])) as [
      {
        season: Doc<"narrativeSeasons">;
        entities: Doc<"narrativeEntities">[];
        arcs: Doc<"narrativeArcs">[];
      } | null,
      Doc<"marketNarratives">[],
      GameEventCtx[],
      Array<{ id: string; name: string }>,
      TokenSignal[],
    ];

  if (!seasonData) {
    console.warn("[wire/generator] no active season found — skipping");
    return { skipped: "outside-market-hours" };
  }

  const { season, entities, arcs } = seasonData;
  const lastDrop = recentDrops[0];
  const lastWorld = (lastDrop?.worldState ?? {}) as {
    topTraderId?: string;
    quietAngleKey?: string | null;
  };
  const prevQuietAngleKey = lastWorld.quietAngleKey ?? null;

  // Leaderboard #1 change → synthetic game event.
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

  // Company roster + lookups.
  const companyEntities = entities.filter((e) => e.kind === "company");
  const companies: CompanyCtx[] = companyEntities.map((e) => ({
    slug: e.slug,
    displayName: e.displayName,
    symbol: e.symbol ?? e.slug.toUpperCase(),
    isHouseToken: e.isHouseToken ?? false,
  }));
  const companyBySlug = new Map(companies.map((c) => [c.slug, c]));
  const signalBySlug = new Map(signals.map((s) => [s.slug, s]));

  // ── Code computes the world-state advance ──
  const arcsInput: ArcInput[] = arcs.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    tensionScore: a.tensionScore,
    arcStage: arcStageOf(a),
    peakFired: a.climaxFired ?? false,
    lastBeatDayKey: a.lastBeatDayKey ?? null,
    subjectSlug: a.primaryFirmSlug ?? null,
    subjectType: a.primaryFirmSlug
      ? companyBySlug.has(a.primaryFirmSlug)
        ? ("company" as const)
        : ("desk" as const)
      : null,
  }));

  const advance = computeWorldStateAdvance({
    arcs: arcsInput,
    companies,
    signals,
    events,
    dayKey,
    dayPosture: posture,
    slot,
    prevQuietAngleKey,
  });

  const arcBySlug = new Map(arcs.map((a) => [a.slug, a]));

  // ── Assembler ARC STATE: live arcs after advance + spawns ──
  const liveArcs: AssemblerArcCtx[] = [];
  for (const adv of advance.arcAdvances) {
    if (adv.toStage === "retired") continue;
    const arc = arcBySlug.get(adv.slug);
    if (!arc) continue;
    const subjectSlug = arc.primaryFirmSlug ?? null;
    const company = subjectSlug ? companyBySlug.get(subjectSlug) : undefined;
    const signal = subjectSlug ? signalBySlug.get(subjectSlug) : undefined;
    liveArcs.push({
      slug: adv.slug,
      title: arc.title,
      summary: arc.summary,
      tensionScore: adv.newTensionScore,
      arcStage: adv.toStage,
      isPrimary: adv.slug === advance.primaryArcSlug,
      subjectType: company ? "company" : subjectSlug ? "desk" : null,
      subjectSymbol: company?.symbol ?? null,
      subjectCompanyName: company?.displayName ?? null,
      movePct: signal ? headlineMovePct(signal) : null,
      streakDays: signal?.streakDays ?? null,
      isHouseToken: company?.isHouseToken ?? false,
    });
  }
  for (const spec of advance.spawnRequests) {
    const company = companyBySlug.get(spec.subjectSlug);
    const signal = signalBySlug.get(spec.subjectSlug);
    liveArcs.push({
      slug: spec.slug,
      title: spec.title,
      summary: spec.summary,
      tensionScore: spec.tensionScore,
      arcStage: spec.arcStage,
      isPrimary: spec.slug === advance.primaryArcSlug,
      subjectType: spec.subjectType,
      subjectSymbol: company?.symbol ?? null,
      subjectCompanyName: company?.displayName ?? null,
      movePct: signal ? headlineMovePct(signal) : null,
      streakDays: signal?.streakDays ?? null,
      isHouseToken: company?.isHouseToken ?? false,
    });
  }
  liveArcs.sort((a, b) => b.tensionScore - a.tensionScore);

  // ── Company tape ──
  const companyTape: CompanyTapeCtx[] = signals.map((s) => ({
    symbol: s.symbol,
    companyName: s.companyName,
    xHandle: s.xHandle,
    isHouseToken: s.isHouseToken,
    priceUsd: s.priceUsd,
    move24hPct: s.move24hPct,
    moveSinceLastPct: s.moveSinceLastPct,
    streakDays: s.streakDays,
    volumeVsTrailing: s.volumeVsTrailing,
    volumeAnomaly: s.volumeAnomaly,
    classification: s.classification,
  }));

  // ── Lead context ──
  const lead = advance.lead;
  const leadCtx: LeadCtx = {
    leadKind: lead.leadKind,
    isFlash: lead.isFlash,
    patterns: lead.patterns,
  };
  let tweetSubjectHandle: string | null = null;
  let subjectIsHouse = false;
  if (lead.leadKind === "token" && lead.tokenLead) {
    const s = lead.tokenLead;
    leadCtx.tokenSymbol = s.symbol;
    leadCtx.tokenCompanyName = s.companyName;
    leadCtx.tokenXHandle = s.xHandle;
    leadCtx.tokenMovePct = headlineMovePct(s);
    leadCtx.tokenStreakDays = s.streakDays;
    leadCtx.tokenIsHouse = s.isHouseToken;
    leadCtx.tokenVolumeNote = tokenVolumeNote(s);
    tweetSubjectHandle = s.xHandle;
    subjectIsHouse = s.isHouseToken;
  } else if (lead.leadKind === "game_event" && lead.gameLead) {
    const e = lead.gameLead;
    const label = e.traderName ?? e.traderAddressTrunc ?? null;
    leadCtx.gameLine = label ? `${label}: ${e.summary}` : e.summary;
    leadCtx.gameFigureUsdc =
      e.magnitudeUsdc != null ? Math.abs(e.magnitudeUsdc) : null;
  } else {
    leadCtx.realStatOneLiner = lead.realStatOneLiner ?? null;
    // A quiet drop whose primary arc is the house company still gets scrutiny.
    const primaryArc = liveArcs.find((a) => a.isPrimary);
    if (primaryArc?.subjectType === "company") {
      tweetSubjectHandle =
        companyEntities.find((e) => e.symbol === primaryArc.subjectSymbol)
          ?.xHandle ?? null;
      subjectIsHouse = primaryArc.isHouseToken ?? false;
    }
  }

  const house = houseToken();

  const buildUserMessage = (quietSlotAngle: DropAngle | null) =>
    assembleUserMessage({
      season: {
        title: season.title,
        tone: season.tone,
        weeklyShape: season.weeklyShape as Record<string, string>,
        styleRules: season.styleRules,
        forbiddenLanguage: season.forbiddenLanguage,
      },
      dayPosture: posture,
      mood: advance.mood,
      lead: leadCtx,
      companyTape,
      arcs: liveArcs,
      entities: companyEntities.map((e) => ({
        slug: e.slug,
        displayName: e.displayName,
        traits: e.traits,
      })),
      houseTokenName: house?.companyName ?? null,
      floorTalkClaims: advance.floorTalkClaims,
      // v1: no automated ingestion; only manually-supplied sourced statements
      // would appear here (rule 6). Empty until material is provided.
      sourcedStatements: [],
      recentDrops: recentDrops.map((d) => ({
        epochSlot: d.epochSlot,
        dropTitle: d.dropTitle,
        worldState: d.worldState as { mood?: string } | null,
        headlines: d.headlines as Array<{
          headline?: string;
          role?: string;
        }> | null,
        confirmedFacts: d.confirmedFacts ?? null,
        openQuestions: d.openQuestions ?? null,
      })),
      isOpeningBell: openingBell,
      isClosingBell: closingBell,
      quietSlotAngle,
    });

  // Allowed percentages for traceability = every real move in the tape.
  const allowedPercents: number[] = [];
  for (const s of signals) {
    for (const p of [s.move24hPct, s.moveSinceLastPct, headlineMovePct(s)]) {
      if (p != null) allowedPercents.push(Math.abs(Math.round(p)));
    }
  }

  const arcSlugs = new Set(liveArcs.map((a) => a.slug));
  const entitySlugs = new Set(companyEntities.map((e) => e.slug));

  const recentHeadlines = recentHeadlinesFromDrops(recentDrops);
  let quietSlotAngle = advance.quietAngle;
  let userMessage = buildUserMessage(quietSlotAngle);

  // ── LLM call (prose only) or test stub ──
  let validated: ValidatedEpoch;
  const validateWarningsRef: { warnings: string[] } = { warnings: [] };

  if (opts.testLlmStub) {
    const normalized = normalizeGeneratedEpoch(opts.testLlmStub);
    const validation = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage: season.forbiddenLanguage,
      allowedPercents,
      subjectIsHouse,
    });
    if (!validation.ok || !validation.data) {
      return {
        skipped: "validation-failed",
        error: validation.error ?? "unknown",
      };
    }
    validated = validation.data;
    validateWarningsRef.warnings = validation.warnings;
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

    let validationError: string | null = null;
    const llmResult = await (async (): Promise<ValidatedEpoch | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const completion = await client.chat.completions.parse(
          {
            model: "gpt-5-mini",
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

        const parsed = msg.parsed as GeneratedNarrativeEpoch;
        const normalized = normalizeGeneratedEpoch(parsed);
        const validation = validateEpoch(normalized.epoch, {
          arcSlugs,
          entitySlugs,
          forbiddenLanguage: season.forbiddenLanguage,
          allowedPercents,
          subjectIsHouse,
        });
        if (!validation.ok || !validation.data) {
          console.error(
            `[wire/generator] validation failed: ${validation.error}`
          );
          validationError = validation.error ?? "unknown";
          return null;
        }

        const headline = validation.data.dispatches[0]?.headline ?? "";
        const isDup = isNearDuplicateHeadline(headline, recentHeadlines);
        if (!isDup || attempt === 1) {
          validateWarningsRef.warnings = validation.warnings;
          return validation.data;
        }

        // Near-duplicate of a recent drop — retry with a fresh angle. For quiet
        // slots rotate the coded angle too; for a persistent mover just demand a
        // new voice on the same real facts.
        if (quietSlotAngle) {
          quietSlotAngle = pickQuietAngle(
            `${slot}:${dayKey}:retry`,
            quietSlotAngle.key
          );
        }
        userMessage =
          buildUserMessage(quietSlotAngle) +
          `\n\nRETRY: Your headline "${headline}" is too similar to a recent post. Same real facts and figures, completely different angle and wording — do not repeat the prior headline's structure.`;
        console.warn(
          `[wire/generator] near-duplicate headline, retrying (slot ${slot})`
        );
      }
      throw new Error("[wire/generator] exhausted LLM retry attempts");
    })();
    if (!llmResult) {
      return {
        skipped: "validation-failed",
        error: validationError ?? "unknown",
      };
    }
    validated = llmResult;
  }

  if (validateWarningsRef.warnings.length > 0) {
    console.warn(
      `[wire/generator] soft warnings (slot ${slot}): ${validateWarningsRef.warnings.join(", ")}`
    );
  }

  // ── Tweet: sanitize (strip/reject URLs, ≤280, ensure @handle), then post ──
  const sanitized = sanitizeTweet(validated.tweetVariant, {
    subjectHandle: tweetSubjectHandle,
  });
  let tweetStatus: string;
  if (!sanitized.ok) {
    tweetStatus = "skipped";
    console.warn(
      `[wire/generator] tweet skipped (slot ${slot}): ${sanitized.issues.join(", ")}`
    );
  } else {
    const poster = getTweetPoster();
    const result = await poster.post({
      text: sanitized.text,
      epoch: slot,
      subjectHandle: tweetSubjectHandle,
    });
    tweetStatus = result.status;
  }

  // ── Stored dispatch + code-owned fields ──
  const storedDispatches = validated.dispatches.map((d) => ({
    ...d,
    materialChange: null,
  }));

  const displayArc = liveArcs[0] ?? null;
  const topArcTitle = displayArc?.title ?? "Quiet tape";
  const topArcTension = displayArc?.tensionScore ?? 0;
  const topArcStage = displayArc?.arcStage;

  const signal =
    lead.patterns.length > 0
      ? `trap-pattern:${lead.patterns[0].phrase}`
      : lead.leadKind === "token" && lead.isFlash
        ? "flash-move"
        : lead.gameLead?.type === "wipeout"
          ? "wipeout-flash"
          : null;

  const worldState = {
    mood: advance.mood,
    primaryArcSlug: advance.primaryArcSlug,
    topTraderId: currentTop?.id ?? lastWorld.topTraderId ?? null,
    quietAngleKey: quietSlotAngle?.key ?? advance.quietAngle?.key ?? null,
    floorTalkTruth: advance.floorTalkClaims.map((c) => ({
      text: c.text,
      isTrue: c.isTrue,
    })),
  };

  // ── Source trace: every number/event maps to a stored datum ──
  const tracedSignals = signals
    .filter((s) => s.classification !== "none")
    .map((s) => ({
      symbol: s.symbol,
      slug: s.slug,
      move24hPct: s.move24hPct,
      moveSinceLastPct: s.moveSinceLastPct,
      streakDays: s.streakDays,
      volumeVsTrailing: s.volumeVsTrailing,
      classification: s.classification,
      refSnapshotIds: s.refSnapshotIds,
    }));
  const sourceTrace = {
    leadKind: lead.leadKind,
    isFlash: lead.isFlash,
    primaryArcSlug: advance.primaryArcSlug,
    mood: advance.mood,
    thresholds: {
      routinePct: allowedPercents.length,
    },
    tokenSignals: tracedSignals,
    gameEventIds: events
      .map((e) => ({ type: e.type, traderId: e.traderId, dealId: e.dealId }))
      .filter((e) => e.traderId || e.dealId),
    tweetSubjectHandle,
    tweetSanitizeIssues: sanitized.issues,
    validatorWarnings: validateWarningsRef.warnings,
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
      isFlash: lead.isFlash,
      signal,
      tweetVariant: sanitized.text,
      tweetStatus,
      tweetSubjectHandle,
      sourceTrace,
      arcRefs,
      arcAdvances: advance.arcAdvances.map((a) => ({
        arcSlug: a.slug,
        toStage: a.toStage,
        newTensionScore: a.newTensionScore,
        peakFiringNow: a.peakFiringNow,
        retiring: a.retiring,
        newLastBeatDayKey: a.newLastBeatDayKey,
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
