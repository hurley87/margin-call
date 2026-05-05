import { query } from "./_generated/server";
import { v } from "convex/values";

type Stats = {
  pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  deals: number;
};

/** Public leaderboard: all traders, sorted by cumulative P&amp;L. No auth. */
export const listTraderStats = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const traders = await ctx.db.query("traders").collect();
    if (traders.length === 0) return [];

    const [outcomes, assets] = await Promise.all([
      ctx.db.query("dealOutcomes").collect(),
      ctx.db.query("assets").collect(),
    ]);

    const statsMap = new Map<string, Stats>();
    for (const o of outcomes) {
      const key = String(o.traderId);
      const prev = statsMap.get(key) ?? {
        pnl: 0,
        wins: 0,
        losses: 0,
        wipeouts: 0,
        deals: 0,
      };
      prev.pnl += o.traderPnlUsdc ?? 0;
      prev.deals += 1;
      if (o.traderWipedOut) prev.wipeouts += 1;
      else if ((o.traderPnlUsdc ?? 0) > 0) prev.wins += 1;
      else prev.losses += 1;
      statsMap.set(key, prev);
    }

    const assetMap = new Map<string, number>();
    for (const a of assets) {
      const tid = String(a.traderId);
      assetMap.set(tid, (assetMap.get(tid) ?? 0) + (a.valueUsdc ?? 0));
    }

    const deskIds = [...new Set(traders.map((t) => t.deskManagerId))];
    const deskWalletById = new Map<string, string | undefined>();
    for (const deskId of deskIds) {
      const dm = await ctx.db.get(deskId);
      deskWalletById.set(String(deskId), dm?.walletAddress);
    }

    const leaderboard = traders.map((t) => {
      const tid = String(t._id);
      const s = statsMap.get(tid) ?? {
        pnl: 0,
        wins: 0,
        losses: 0,
        wipeouts: 0,
        deals: 0,
      };
      const assetValue = assetMap.get(tid) ?? 0;
      const escrow = t.escrowBalanceUsdc ?? 0;
      const totalDealsLogged = s.wins + s.losses + s.wipeouts;
      const ownerWallet = deskWalletById.get(String(t.deskManagerId)) ?? "";

      return {
        id: tid,
        name: t.name,
        status: t.status as string,
        owner_address: ownerWallet,
        total_pnl: s.pnl,
        wins: s.wins,
        losses: s.losses,
        wipeouts: s.wipeouts,
        deal_count: s.deals,
        win_rate: totalDealsLogged > 0 ? (s.wins / totalDealsLogged) * 100 : 0,
        total_value: escrow + assetValue,
      };
    });

    leaderboard.sort((a, b) => b.total_pnl - a.total_pnl);
    return leaderboard.slice(0, limit);
  },
});
