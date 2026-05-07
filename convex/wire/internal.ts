import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { GameEventCtx } from "./epochAssembler";

const DRAMATIC_WIN_LOSS_THRESHOLD = 500;
const DRAMATIC_ENTRY_THRESHOLD = 250;
const DRAMATIC_POT_THRESHOLD = 5000;
const CROWDED_TRADE_COUNT = 3;
const MAX_DRAMATIC = 5;
const MAX_ROUTINE = 10;

/** Load the active season with its entities and active arcs in one pass. */
export const loadActiveSeason = internalQuery({
  args: {},
  handler: async (ctx) => {
    const season = await ctx.db
      .query("narrativeSeasons")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .first();
    if (!season) return null;

    const [entities, arcs] = await Promise.all([
      ctx.db
        .query("narrativeEntities")
        .withIndex("bySeason", (q) => q.eq("seasonId", season._id))
        .collect(),
      ctx.db
        .query("narrativeArcs")
        .withIndex("bySeasonAndStatus", (q) =>
          q.eq("seasonId", season._id).eq("status", "active")
        )
        .collect(),
    ]);

    return { season, entities, arcs };
  },
});

/** Newest-first Wire Drops with the fields the assembler needs. */
export const listRecentDrops = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const cap = Math.min(Math.max(limit, 1), 20);
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(cap);
  },
});

/**
 * Recent game events since a given timestamp.
 * Returns dramatic events (wipeouts, big wins/losses, large entries, crowded
 * trades, high-pot deals) with optional trader/desk name enrichment, plus
 * routine events (normal deal creations and entries) in aggregate.
 */
export const listRecentGameEvents = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }): Promise<GameEventCtx[]> => {
    const [outcomes, deals, entries] = await Promise.all([
      ctx.db
        .query("dealOutcomes")
        .withIndex("byCreatedAt", (q) => q.gte("createdAt", since))
        .order("desc")
        .take(20),
      ctx.db
        .query("deals")
        .withIndex("byCreatedAt", (q) => q.gte("createdAt", since))
        .order("desc")
        .take(10),
      ctx.db
        .query("dealEntries")
        .withIndex("byCreatedAt", (q) => q.gte("createdAt", since))
        .order("desc")
        .take(30),
    ]);

    const dramatic: GameEventCtx[] = [];
    const routine: GameEventCtx[] = [];
    const dramaticTraderIds = new Set<string>();

    for (const o of outcomes) {
      const pnl = o.traderPnlUsdc ?? 0;
      if (o.traderWipedOut) {
        dramatic.push({
          type: "wipeout",
          dramatic: true,
          summary: `Trader wiped out${o.wipeoutReason ? ` — ${o.wipeoutReason}` : ""}`,
          traderName: o.traderId,
        });
        dramaticTraderIds.add(o.traderId);
      } else if (pnl >= DRAMATIC_WIN_LOSS_THRESHOLD) {
        dramatic.push({
          type: "big_win",
          dramatic: true,
          summary: `Trader won $${pnl.toFixed(0)} on a deal`,
          traderName: o.traderId,
        });
        dramaticTraderIds.add(o.traderId);
      } else if (pnl <= -DRAMATIC_WIN_LOSS_THRESHOLD) {
        dramatic.push({
          type: "big_loss",
          dramatic: true,
          summary: `Trader lost $${Math.abs(pnl).toFixed(0)} on a deal`,
          traderName: o.traderId,
        });
        dramaticTraderIds.add(o.traderId);
      } else if (pnl !== 0) {
        routine.push({
          type: "deal_entry",
          dramatic: false,
          summary: `Deal resolved: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)} PnL`,
        });
      }
    }

    for (const d of deals) {
      if (d.potUsdc >= DRAMATIC_POT_THRESHOLD) {
        dramatic.push({
          type: "high_pot_deal",
          dramatic: true,
          summary: `High-stakes deal opened: "${d.prompt.slice(0, 60)}" ($${d.potUsdc} pot)`,
        });
      } else {
        routine.push({
          type: "deal_created",
          dramatic: false,
          summary: `Deal opened: "${d.prompt.slice(0, 50)}" ($${d.potUsdc} pot)`,
        });
      }
    }

    const entryCountByDeal = new Map<string, number>();
    const largeEntries: typeof entries = [];
    let normalEntryCount = 0;

    for (const e of entries) {
      if (e.entryCostUsdc >= DRAMATIC_ENTRY_THRESHOLD) {
        largeEntries.push(e);
        dramaticTraderIds.add(e.traderId);
      } else {
        normalEntryCount++;
        entryCountByDeal.set(
          e.dealId as string,
          (entryCountByDeal.get(e.dealId as string) ?? 0) + 1
        );
      }
    }

    for (const e of largeEntries) {
      dramatic.push({
        type: "large_entry",
        dramatic: true,
        summary: `Trader entered a deal for $${e.entryCostUsdc.toFixed(0)}`,
        traderName: e.traderId,
      });
    }

    const crowdedDealIds = [...entryCountByDeal.entries()]
      .filter(([, count]) => count >= CROWDED_TRADE_COUNT)
      .map(([dealId]) => dealId);

    // Fetch crowded deal prompts and trader info in parallel — both are known
    // after classification and neither depends on the other.
    const [crowdedDeals, traderResults] = await Promise.all([
      crowdedDealIds.length > 0
        ? Promise.allSettled(
            crowdedDealIds.map((id) => ctx.db.get(id as Id<"deals">))
          )
        : Promise.resolve([] as PromiseSettledResult<null>[]),
      dramaticTraderIds.size > 0
        ? Promise.allSettled(
            [...dramaticTraderIds].map((id) => ctx.db.get(id as Id<"traders">))
          )
        : Promise.resolve([] as PromiseSettledResult<null>[]),
    ]);

    for (const [i, result] of crowdedDeals.entries()) {
      const deal = result.status === "fulfilled" ? result.value : null;
      const count = entryCountByDeal.get(crowdedDealIds[i]) ?? 0;
      const label = deal ? `"${deal.prompt.slice(0, 40)}"` : "a deal";
      dramatic.push({
        type: "crowded_trade",
        dramatic: true,
        summary: `Crowded trade: ${count} entries on ${label} this epoch`,
      });
    }

    if (normalEntryCount > 0) {
      routine.push({
        type: "deal_entry",
        dramatic: false,
        summary: `${normalEntryCount} deal ${normalEntryCount === 1 ? "entry" : "entries"} across ${entryCountByDeal.size} ${entryCountByDeal.size === 1 ? "deal" : "deals"}`,
      });
    }

    const traderIds = [...dramaticTraderIds];
    const traderNameMap = new Map<
      string,
      { traderName: string; deskManagerId?: Id<"deskManagers"> }
    >();
    for (const [i, result] of traderResults.entries()) {
      if (result.status === "fulfilled" && result.value) {
        traderNameMap.set(traderIds[i], {
          traderName: result.value.name,
          deskManagerId: result.value.deskManagerId,
        });
      }
    }

    const deskManagerIds = [...traderNameMap.values()]
      .map((t) => t.deskManagerId)
      .filter((id): id is Id<"deskManagers"> => id !== undefined);

    const deskResults = await Promise.allSettled(
      deskManagerIds.map((id) => ctx.db.get(id))
    );
    const deskNameMap = new Map<string, string>();
    for (const [i, result] of deskResults.entries()) {
      if (result.status === "fulfilled" && result.value?.displayName) {
        deskNameMap.set(deskManagerIds[i] as string, result.value.displayName);
      }
    }

    for (const event of dramatic) {
      if (event.traderName && traderNameMap.has(event.traderName)) {
        const resolved = traderNameMap.get(event.traderName)!;
        event.traderName = resolved.traderName;
        if (resolved.deskManagerId) {
          const deskName = deskNameMap.get(resolved.deskManagerId as string);
          if (deskName) event.deskName = deskName;
        }
      }
    }

    return [
      ...dramatic.slice(0, MAX_DRAMATIC),
      ...routine.slice(0, MAX_ROUTINE),
    ];
  },
});

/** Fast pre-check: does a drop with this epochSlot already exist? */
export const findBySlot = internalQuery({
  args: { epochSlot: v.number() },
  handler: async (ctx, { epochSlot }) => {
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpochSlot", (q) => q.eq("epochSlot", epochSlot))
      .first();
  },
});
