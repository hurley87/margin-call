import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

type DispatchItem = {
  headline: string;
  body: string;
  category?: string;
  role?: string;
  dispatchKey?: string;
};

/**
 * Read-only list of recent newswire dispatches for MCP `list_newswire`.
 *
 * A dispatch is a single wire headline+body the wire publishes (hourly). The
 * desk browses these, picks one, and creates a deal against it — mirroring the
 * web "Create deal" flow, which drafts deal text from a dispatch and records its
 * headline as the deal's `sourceHeadline`. Each item carries a `dispatchId`
 * (`"<epoch>:<dispatchKey>"`) to pass to `create_deal` as `dispatchId`.
 */
export const listDispatches = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 50);

    // Pull recent drops newest-first, then flatten their dispatches up to the
    // requested cap (a single drop can carry multiple dispatches).
    const drops = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(bounded);

    const items: Array<{
      dispatchId: string;
      headline: string;
      body: string;
      category: string;
      role: string;
      epoch: number;
      epochSlot: number | null;
      mood: string;
      arcStage: string | null;
      createdAt: number;
    }> = [];

    for (const drop of drops) {
      const ws = (drop.worldState ?? {}) as {
        mood?: string;
      };
      const dispatches = (drop.headlines ?? []) as DispatchItem[];
      for (const d of dispatches) {
        // Only dispatches with a stable key can be referenced by create_deal.
        if (!d.dispatchKey) continue;
        items.push({
          dispatchId: `${drop.epoch}:${d.dispatchKey}`,
          headline: d.headline,
          body: d.body,
          category: d.category ?? "wire",
          role: d.role ?? "supporting",
          epoch: drop.epoch,
          epochSlot: drop.epochSlot ?? null,
          mood: ws.mood ?? "unknown",
          arcStage: drop.arcStage ?? null,
          createdAt: drop.createdAt,
        });
        if (items.length >= bounded) break;
      }
      if (items.length >= bounded) break;
    }

    return { dispatches: items, count: items.length };
  },
});

/**
 * Resolve a single dispatch (by epoch + dispatchKey) for the MCP `create_deal`
 * prepare step. Returns the dispatch headline used as the deal's
 * `sourceHeadline`, verifying the chosen post actually exists.
 */
export const getDispatch = internalQuery({
  args: { epoch: v.number(), dispatchKey: v.string() },
  handler: async (ctx, { epoch, dispatchKey }) => {
    const drop = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch", (q) => q.eq("epoch", epoch))
      .first();
    if (!drop) {
      throw new Error(`Newswire epoch ${epoch} not found (stale dispatchId)`);
    }
    const dispatches = (drop.headlines ?? []) as DispatchItem[];
    const dispatch = dispatches.find((d) => d.dispatchKey === dispatchKey);
    if (!dispatch) {
      throw new Error(
        `Dispatch "${dispatchKey}" not found in epoch ${epoch} (stale dispatchId)`
      );
    }
    return { headline: dispatch.headline, body: dispatch.body };
  },
});
