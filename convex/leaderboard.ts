/**
 * Leaderboard queries — computed on read from authoritative deal/trader/outcome state.
 *
 * Aggregation strategy: ON-READ computation.
 *
 * Rationale:
 *   - Naturally idempotent — replaying outcomes or retrying cycle actions does NOT
 *     double-count because we scan the deduplicated dealOutcomes table (which is
 *     already CAS-guarded on (traderId, dealId)) and compute aggregates on the fly.
 *   - No secondary aggregate table to maintain or keep consistent.
 *   - Convex query budget is ample for the current trader/outcome volumes.
 *   - If query latency becomes a bottleneck at scale, the aggregate-on-write path
 *     should key on dealOutcome._id (already stable and unique) so retries are no-ops.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";

/** Public type returned by leaderboard queries. */
export interface LeaderboardEntry {
  traderId: string;
  traderName: string;
  status: "active" | "paused" | "wiped_out";
  ownerSubject: string;
  totalPnlUsdc: number;
  wins: number;
  losses: number;
  wipeouts: number;
  dealCount: number;
  winRate: number;
  totalValueUsdc: number;
}

/**
 * Public: top traders by PnL.
 * Auth-checked (any authenticated user may view the leaderboard).
 */
export const topByPnl = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Load all traders
    const traders = await ctx.db.query("traders").collect();
    if (traders.length === 0) return [];

    // Load all outcomes — the CAS guard on (traderId, dealId) ensures no duplicates
    const outcomes = await ctx.db.query("dealOutcomes").collect();

    // Load all assets for total-value calculation
    const assets = await ctx.db.query("assets").collect();

    // Aggregate outcomes by traderId
    const statsMap = new Map<
      string,
      {
        pnl: number;
        wins: number;
        losses: number;
        wipeouts: number;
        deals: number;
      }
    >();

    for (const o of outcomes) {
      const s = statsMap.get(o.traderId) ?? {
        pnl: 0,
        wins: 0,
        losses: 0,
        wipeouts: 0,
        deals: 0,
      };
      s.deals += 1;
      const pnl = o.traderPnlUsdc ?? 0;
      s.pnl += pnl;
      if (o.traderWipedOut) {
        s.wipeouts += 1;
      } else if (pnl > 0) {
        s.wins += 1;
      } else {
        s.losses += 1;
      }
      statsMap.set(o.traderId, s);
    }

    // Aggregate asset values by traderId
    const assetMap = new Map<string, number>();
    for (const a of assets) {
      assetMap.set(
        a.traderId,
        (assetMap.get(a.traderId) ?? 0) + (a.valueUsdc ?? 0)
      );
    }

    // Build leaderboard rows
    const rows: LeaderboardEntry[] = traders.map((t) => {
      const s = statsMap.get(t._id) ?? {
        pnl: 0,
        wins: 0,
        losses: 0,
        wipeouts: 0,
        deals: 0,
      };
      const assetValue = assetMap.get(t._id) ?? 0;
      const totalDeals = s.wins + s.losses + s.wipeouts;
      return {
        traderId: t._id,
        traderName: t.name,
        status: t.status,
        ownerSubject: t.ownerSubject,
        totalPnlUsdc: s.pnl,
        wins: s.wins,
        losses: s.losses,
        wipeouts: s.wipeouts,
        dealCount: s.deals,
        winRate: totalDeals > 0 ? (s.wins / totalDeals) * 100 : 0,
        totalValueUsdc: (t.escrowBalanceUsdc ?? 0) + assetValue,
      };
    });

    rows.sort((a, b) => b.totalPnlUsdc - a.totalPnlUsdc);
    return rows.slice(0, limit);
  },
});

/**
 * Public: traders owned by the authenticated desk manager, sorted by PnL.
 * Useful for "my desk" leaderboard view.
 */
export const byDesk = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const traders = await ctx.db
      .query("traders")
      .withIndex("byOwner", (q) => q.eq("ownerSubject", identity.subject))
      .collect();

    if (traders.length === 0) return [];

    const traderIds = new Set(traders.map((t) => t._id));

    // Collect outcomes only for this desk's traders
    const outcomes = (
      await Promise.all(
        traders.map((t) =>
          ctx.db
            .query("dealOutcomes")
            .withIndex("byTrader", (q) => q.eq("traderId", t._id))
            .collect()
        )
      )
    ).flat();

    const assets = (
      await Promise.all(
        traders.map((t) =>
          ctx.db
            .query("assets")
            .withIndex("byTrader", (q) => q.eq("traderId", t._id))
            .collect()
        )
      )
    ).flat();

    // Aggregate (same logic as topByPnl — idempotent because CAS guard in dealOutcomes)
    const statsMap = new Map<
      string,
      {
        pnl: number;
        wins: number;
        losses: number;
        wipeouts: number;
        deals: number;
      }
    >();

    for (const o of outcomes) {
      const s = statsMap.get(o.traderId) ?? {
        pnl: 0,
        wins: 0,
        losses: 0,
        wipeouts: 0,
        deals: 0,
      };
      s.deals += 1;
      const pnl = o.traderPnlUsdc ?? 0;
      s.pnl += pnl;
      if (o.traderWipedOut) {
        s.wipeouts += 1;
      } else if (pnl > 0) {
        s.wins += 1;
      } else {
        s.losses += 1;
      }
      statsMap.set(o.traderId, s);
    }

    const assetMap = new Map<string, number>();
    for (const a of assets) {
      assetMap.set(
        a.traderId,
        (assetMap.get(a.traderId) ?? 0) + (a.valueUsdc ?? 0)
      );
    }

    const rows: LeaderboardEntry[] = traders
      .filter((t) => traderIds.has(t._id))
      .map((t) => {
        const s = statsMap.get(t._id) ?? {
          pnl: 0,
          wins: 0,
          losses: 0,
          wipeouts: 0,
          deals: 0,
        };
        const assetValue = assetMap.get(t._id) ?? 0;
        const totalDeals = s.wins + s.losses + s.wipeouts;
        return {
          traderId: t._id,
          traderName: t.name,
          status: t.status,
          ownerSubject: t.ownerSubject,
          totalPnlUsdc: s.pnl,
          wins: s.wins,
          losses: s.losses,
          wipeouts: s.wipeouts,
          dealCount: s.deals,
          winRate: totalDeals > 0 ? (s.wins / totalDeals) * 100 : 0,
          totalValueUsdc: (t.escrowBalanceUsdc ?? 0) + assetValue,
        };
      });

    rows.sort((a, b) => b.totalPnlUsdc - a.totalPnlUsdc);
    return rows;
  },
});
