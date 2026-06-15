import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { fmtUsd, type GameEventCtx } from "./epochAssembler";

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

/** Truncate a wallet address for public display, e.g. "0x4f2…a9". */
function truncAddr(addr: string | undefined): string | undefined {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-2)}`;
}

/**
 * Recent game events since a given timestamp.
 * Returns dramatic events (wipeouts, trap resolutions, big wins/losses, large
 * entries, crowded trades, high-pot deals) enriched with magnitudes, deal
 * prompts, trader names and truncated addresses, plus routine events in
 * aggregate. The drama ranker (dramaRanker.ts) decides what leads.
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

    // Batch-fetch the deals + traders referenced by outcomes (for prompt text,
    // creator-desk comparison, and address enrichment).
    const outcomeDealIds = [
      ...new Set(outcomes.map((o) => o.dealId as string)),
    ];
    const outcomeTraderIds = [
      ...new Set(outcomes.map((o) => o.traderId as string)),
    ];
    const [outcomeDealsRes, outcomeTradersRes] = await Promise.all([
      Promise.allSettled(
        outcomeDealIds.map((id) => ctx.db.get(id as Id<"deals">))
      ),
      Promise.allSettled(
        outcomeTraderIds.map((id) => ctx.db.get(id as Id<"traders">))
      ),
    ]);
    const dealById = new Map<string, Doc<"deals">>();
    outcomeDealsRes.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value)
        dealById.set(outcomeDealIds[i], r.value);
    });
    const traderById = new Map<string, Doc<"traders">>();
    outcomeTradersRes.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value)
        traderById.set(outcomeTraderIds[i], r.value);
    });

    const dramatic: GameEventCtx[] = [];
    const routine: GameEventCtx[] = [];
    const dramaticTraderIds = new Set<Id<"traders">>();

    for (const o of outcomes) {
      const pnl = o.traderPnlUsdc ?? 0;
      const deal = dealById.get(o.dealId as string);
      const trader = traderById.get(o.traderId as string);
      const dealPrompt = deal?.prompt;
      // A loss on another desk's deal is the PvP trap landing.
      const crossDesk =
        deal && trader && deal.creatorDeskManagerId !== trader.deskManagerId;
      const enrich = {
        traderName: o.traderId as string,
        dealPrompt,
        traderId: o.traderId as string,
        dealId: o.dealId as string,
        magnitudeUsdc: pnl,
      };

      if (o.traderWipedOut) {
        dramatic.push({
          type: "wipeout",
          dramatic: true,
          summary: `Trader wiped out${o.wipeoutReason ? ` — ${o.wipeoutReason}` : ""}`,
          ...enrich,
        });
        dramaticTraderIds.add(o.traderId);
      } else if (pnl >= DRAMATIC_WIN_LOSS_THRESHOLD) {
        dramatic.push({
          type: "big_win",
          dramatic: true,
          summary: `Trader won ${fmtUsd(pnl)} on a deal`,
          ...enrich,
        });
        dramaticTraderIds.add(o.traderId);
      } else if (pnl < 0) {
        const isDramatic = pnl <= -DRAMATIC_WIN_LOSS_THRESHOLD;
        const event: GameEventCtx = {
          type: crossDesk ? "trap_resolved" : "big_loss",
          dramatic: isDramatic,
          summary: crossDesk
            ? `Trader lost ${fmtUsd(Math.abs(pnl))} on someone else's deal`
            : `Trader lost ${fmtUsd(Math.abs(pnl))} on a deal`,
          ...enrich,
        };
        (isDramatic ? dramatic : routine).push(event);
        if (isDramatic) dramaticTraderIds.add(o.traderId);
      } else if (pnl !== 0) {
        routine.push({
          type: "deal_entry",
          dramatic: false,
          summary: `Deal resolved: +${fmtUsd(pnl)} PnL`,
          ...enrich,
        });
      }
    }

    for (const d of deals) {
      if (d.potUsdc >= DRAMATIC_POT_THRESHOLD) {
        dramatic.push({
          type: "high_pot_deal",
          dramatic: true,
          summary: `High-stakes deal opened: "${d.prompt.slice(0, 60)}" (${fmtUsd(d.potUsdc)} pot)`,
          dealId: d._id as string,
          dealPrompt: d.prompt,
          magnitudeUsdc: d.potUsdc,
        });
      } else {
        routine.push({
          type: "deal_created",
          dramatic: false,
          summary: `Deal opened: "${d.prompt.slice(0, 50)}" (${fmtUsd(d.potUsdc)} pot)`,
          dealId: d._id as string,
          dealPrompt: d.prompt,
          magnitudeUsdc: d.potUsdc,
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
        summary: `Trader entered a deal for ${fmtUsd(e.entryCostUsdc)}`,
        traderName: e.traderId as string,
        traderId: e.traderId as string,
        dealId: e.dealId as string,
        magnitudeUsdc: e.entryCostUsdc,
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
        ? Promise.allSettled([...dramaticTraderIds].map((id) => ctx.db.get(id)))
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

    // Merge trader docs from the outcomes batch with the dramatic-entry batch.
    const traderInfo = new Map<
      string,
      { traderName: string; deskManagerId?: Id<"deskManagers"> }
    >();
    for (const [id, t] of traderById) {
      traderInfo.set(id, {
        traderName: t.name,
        deskManagerId: t.deskManagerId,
      });
    }
    const dramaticTraderIdList = [...dramaticTraderIds];
    for (const [i, result] of traderResults.entries()) {
      if (result.status === "fulfilled" && result.value) {
        traderInfo.set(dramaticTraderIdList[i] as string, {
          traderName: result.value.name,
          deskManagerId: result.value.deskManagerId,
        });
      }
    }

    const deskManagerIds = [
      ...new Set(
        [...traderInfo.values()]
          .map((t) => t.deskManagerId)
          .filter((id): id is Id<"deskManagers"> => id !== undefined)
          .map((id) => id as string)
      ),
    ];
    const deskResults = await Promise.allSettled(
      deskManagerIds.map((id) => ctx.db.get(id as Id<"deskManagers">))
    );
    const deskInfo = new Map<
      string,
      { displayName?: string; walletAddress?: string }
    >();
    for (const [i, result] of deskResults.entries()) {
      if (result.status === "fulfilled" && result.value) {
        deskInfo.set(deskManagerIds[i], {
          displayName: result.value.displayName,
          walletAddress: result.value.walletAddress,
        });
      }
    }

    // Resolve trader ids → names + desk display + truncated address across all
    // events (dramatic and routine) so the pattern detector and prompt see
    // real identities.
    for (const event of [...dramatic, ...routine]) {
      if (event.traderName && traderInfo.has(event.traderName)) {
        const resolved = traderInfo.get(event.traderName)!;
        event.traderName = resolved.traderName;
        if (resolved.deskManagerId) {
          const desk = deskInfo.get(resolved.deskManagerId as string);
          if (desk?.displayName) event.deskName = desk.displayName;
          const trunc = truncAddr(desk?.walletAddress);
          if (trunc) event.traderAddressTrunc = trunc;
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
