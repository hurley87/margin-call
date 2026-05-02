/**
 * Market narrative generation — Convex action + query.
 *
 * Flow:
 *   1. Convex cron (every 5 min) → generate()
 *   2. generate() loads previous narrative + recent game events via internal queries
 *   3. Calls OpenAI to produce a NarrativeEpoch (structured output)
 *   4. Writes to marketNarratives via internal mutation
 *
 * The generate() action is idempotent per epoch — it checks whether the next epoch
 * has already been written before inserting.
 *
 * The old REST route /api/narrative/generate has been removed because it was a
 * simple non-streaming Vercel Cron trigger. The cron is now handled by convex/crons.ts.
 */

import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

// ── Narrative Zod schema (mirrors src/lib/llm/schemas.ts — keep in sync) ──
// Defined locally because convex/ cannot resolve the @/ path alias.

const NarrativeCategoryEnum = z.enum([
  "rumor",
  "breaking",
  "investigation",
  "market_move",
  "corporate_drama",
  "politics",
]);

const NarrativeEpochSchema = z.object({
  world_state: z.object({
    mood: z.string(),
    sec_heat: z.number().min(0).max(10),
    sectors: z.record(z.string(), z.string()),
    active_storylines: z.array(z.string()),
    notable_traders: z.array(z.string()),
  }),
  headlines: z
    .array(
      z.object({
        headline: z.string(),
        body: z.string(),
        category: NarrativeCategoryEnum,
      })
    )
    .min(3)
    .max(5),
  raw_narrative: z.string(),
});

// ── Internal helpers ───────────────────────────────────────────────────────

/** Internal: load the latest narrative epoch. */
export const latestInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .first();
  },
});

/** Internal: check if an epoch already exists (idempotency guard). */
export const findByEpoch = internalQuery({
  args: { epoch: v.number() },
  handler: async (ctx, { epoch }) => {
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch", (q) => q.eq("epoch", epoch))
      .unique();
  },
});

/** Internal: collect notable game events since a given timestamp. */
export const recentGameEvents = internalQuery({
  args: { sinceMs: v.number() },
  handler: async (ctx, { sinceMs }) => {
    // Load outcomes since timestamp, filtering for notable events
    const outcomes = await ctx.db
      .query("dealOutcomes")
      .withIndex("byCreatedAt", (q) => q.gt("createdAt", sinceMs))
      .order("desc")
      .take(20);

    // Only keep events with absolute PnL > 10 USDC or wipeouts
    const notable = outcomes.filter(
      (o) => o.traderWipedOut === true || Math.abs(o.traderPnlUsdc ?? 0) > 10
    );

    if (notable.length === 0) return [];

    // Resolve trader names and deal prompts
    const dealIds = [...new Set(notable.map((o) => o.dealId))];

    // traderId is stored as string (not typed Id) in dealOutcomes
    const traderIdStrings = [...new Set(notable.map((o) => o.traderId))];
    const allTraders = await ctx.db.query("traders").collect();
    const traderMap = new Map(
      allTraders
        .filter((t) => traderIdStrings.includes(t._id))
        .map((t) => [t._id as string, t.name])
    );

    const deals = await Promise.all(dealIds.map((id) => ctx.db.get(id)));
    const dealMap = new Map(
      deals.filter(Boolean).map((d) => [d!._id as string, d!.prompt])
    );

    return notable.map((o) => ({
      trader_name: traderMap.get(o.traderId) ?? "Unknown Trader",
      deal_prompt: dealMap.get(o.dealId) ?? "Unknown Deal",
      trader_pnl_usdc: o.traderPnlUsdc ?? 0,
      trader_wiped_out: o.traderWipedOut ?? false,
    }));
  },
});

/** Internal: insert a new narrative epoch. */
export const insert = internalMutation({
  args: {
    epoch: v.number(),
    headlines: v.any(),
    worldState: v.any(),
    rawNarrative: v.string(),
    eventsIngested: v.any(),
  },
  handler: async (ctx, args) => {
    // Idempotency: check if this epoch was already written
    const existing = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch", (q) => q.eq("epoch", args.epoch))
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert("marketNarratives", {
      epoch: args.epoch,
      headlines: args.headlines,
      worldState: args.worldState,
      rawNarrative: args.rawNarrative,
      eventsIngested: args.eventsIngested,
      createdAt: Date.now(),
    });
  },
});

// ── Public queries ─────────────────────────────────────────────────────────

/**
 * Public: latest market narrative epoch.
 * No auth required — narratives are public world-building content.
 */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .first();
  },
});

/**
 * Public: recent narrative epochs, newest-first.
 */
export const history = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const rows = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(Math.min(limit, 50));
    return rows;
  },
});

/**
 * Public: flattened feed of headlines from recent epochs, newest-first.
 * Each entry includes epoch-level world state for mood/SEC heat display.
 */
export const feed = query({
  args: { epochs: v.optional(v.number()) },
  handler: async (ctx, { epochs = 20 }) => {
    const narratives = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(Math.min(epochs, 50));

    const flatFeed: {
      headline: string;
      body: string;
      category: string;
      epoch: number;
      createdAt: number;
      mood: string;
      secHeat: number;
    }[] = [];

    for (const n of narratives) {
      const headlines = (n.headlines ?? []) as {
        headline: string;
        body: string;
        category: string;
      }[];
      const ws = (n.worldState ?? {}) as {
        mood?: string;
        sec_heat?: number;
      };
      for (const h of headlines) {
        flatFeed.push({
          headline: h.headline,
          body: h.body,
          category: h.category,
          epoch: n.epoch,
          createdAt: n.createdAt,
          mood: ws.mood ?? "unknown",
          secHeat: ws.sec_heat ?? 0,
        });
      }
    }

    return flatFeed;
  },
});

// ── Generate action ────────────────────────────────────────────────────────

/**
 * Internal action: generate the next narrative epoch.
 *
 * Called by the Convex cron every 5 minutes (see convex/crons.ts).
 *
 * Idempotent: if the next epoch already exists (e.g. from a concurrent run),
 * the insert mutation is a no-op and the action returns early.
 */
export const generate = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Load previous narrative
    const previous = await ctx.runQuery(internal.narrative.latestInternal, {});
    const previousEpoch = previous?.epoch ?? 0;
    const nextEpoch = previousEpoch + 1;

    // Idempotency guard: skip if already generated
    const alreadyExists = await ctx.runQuery(internal.narrative.findByEpoch, {
      epoch: nextEpoch,
    });
    if (alreadyExists) return;

    // 2. Collect notable game events since last epoch
    const sinceMs = previous ? previous.createdAt : Date.now() - 5 * 60 * 1000;
    const gameEvents = await ctx.runQuery(internal.narrative.recentGameEvents, {
      sinceMs,
    });

    // 3. Load system prompt (falls back to a built-in default if DB row is absent)
    const systemPromptContent = await ctx.runQuery(
      internal.systemPrompts.getActive,
      { name: "narrative_generation" }
    );
    const systemPrompt =
      systemPromptContent ??
      "You are the Market Wire narrator for a 1980s Wall Street trading game. Generate vivid, period-accurate financial news.";

    // 4. Build LLM messages (pure, no DB calls)
    const previousWorldState =
      (previous?.worldState as Record<string, unknown>) ?? null;
    const previousHeadlines =
      (previous?.headlines as {
        headline: string;
        body: string;
        category: string;
      }[]) ?? [];

    const previousContext = previousWorldState
      ? `PREVIOUS WORLD STATE:\n${JSON.stringify(previousWorldState)}\n\nPREVIOUS HEADLINES:\n${previousHeadlines.map((h) => `- [${h.category.toUpperCase()}] ${h.headline}: ${h.body}`).join("\n")}`
      : "This is the FIRST epoch. Establish the initial state of the Street. Set the stage.";

    const eventsSection =
      gameEvents.length > 0
        ? `RECENT GAME EVENTS (weave these into the narrative naturally):\n${gameEvents
            .map((e) => {
              if (e.trader_wiped_out) {
                return `- WIPEOUT: ${e.trader_name} was destroyed in "${e.deal_prompt}" (lost everything)`;
              }
              const direction = e.trader_pnl_usdc >= 0 ? "won" : "lost";
              return `- ${e.trader_name} ${direction} $${Math.abs(e.trader_pnl_usdc).toFixed(2)} in "${e.deal_prompt}"`;
            })
            .join("\n")}`
        : "No notable game events since last epoch.";

    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: `Generate MARKET WIRE epoch #${nextEpoch}.\n\n${previousContext}\n\n${eventsSection}\n\nGenerate the next epoch with:\n1. Updated world_state (evolve mood, SEC heat, sectors, storylines based on what's happening)\n2. 3-5 headlines with bodies and categories\n3. A raw_narrative prose section (2-4 paragraphs) summarizing the state of the Street\n\nRemember: advance storylines, introduce new threads, and make the world feel alive. If game events are provided, they should appear naturally in the news.`,
      },
    ];

    // 5. Call OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.parse(
      {
        model: "gpt-4o-mini",
        messages,
        response_format: zodResponseFormat(
          NarrativeEpochSchema,
          "narrative_epoch"
        ),
      },
      { timeout: 30_000 }
    );

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new Error("No parsed response from OpenAI");

    // 6. Persist (idempotent mutation keyed on epoch)
    await ctx.runMutation(internal.narrative.insert, {
      epoch: nextEpoch,
      headlines: parsed.headlines,
      worldState: parsed.world_state,
      rawNarrative: parsed.raw_narrative,
      eventsIngested: gameEvents,
    });
  },
});
