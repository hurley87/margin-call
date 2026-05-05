import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type DeskPortfolio = {
  totalValueUsdc: number;
  traders: {
    id: Id<"traders">;
    name: string;
    status: Doc<"traders">["status"];
    escrowUsdc: number;
    assetValueUsdc: number;
    totalValueUsdc: number;
  }[];
  pnlHistory: { createdAt: number; cumulativePnl: number }[];
  stats: {
    totalWins: number;
    totalLosses: number;
    totalWipeouts: number;
    totalPnl: number;
  };
};

function emptyDeskPortfolio(): DeskPortfolio {
  return {
    totalValueUsdc: 0,
    traders: [],
    pnlHistory: [],
    stats: {
      totalWins: 0,
      totalLosses: 0,
      totalWipeouts: 0,
      totalPnl: 0,
    },
  };
}

/**
 * Portfolio aggregation for dashboard: traders, asset values, cumulative PnL over time, stats.
 * Scoped to traders owned by the authenticated subject (`traders.byOwner`).
 */
export const forDesk = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return emptyDeskPortfolio();

    const traders = await ctx.db
      .query("traders")
      .withIndex("byOwner", (q) => q.eq("ownerSubject", identity.subject))
      .collect();

    if (traders.length === 0) return emptyDeskPortfolio();

    traders.sort((a, b) => a.name.localeCompare(b.name));

    const perTrader = await Promise.all(
      traders.map(async (tr) => {
        const [assets, outs] = await Promise.all([
          ctx.db
            .query("assets")
            .withIndex("byTrader", (q) => q.eq("traderId", tr._id))
            .collect(),
          ctx.db
            .query("dealOutcomes")
            .withIndex("byTrader", (q) => q.eq("traderId", tr._id))
            .collect(),
        ]);
        const assetSum = assets.reduce((s, a) => s + (a.valueUsdc ?? 0), 0);
        return { tr, assetSum, outs };
      })
    );

    const allOutcomes: {
      traderPnlUsdc: number;
      traderWipedOut: boolean;
      createdAt: number;
    }[] = [];

    for (const row of perTrader) {
      for (const o of row.outs) {
        allOutcomes.push({
          traderPnlUsdc: o.traderPnlUsdc ?? 0,
          traderWipedOut: o.traderWipedOut ?? false,
          createdAt: o.createdAt,
        });
      }
    }

    allOutcomes.sort((a, b) => a.createdAt - b.createdAt);

    let cumPnl = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalWipeouts = 0;
    const pnlHistory: { createdAt: number; cumulativePnl: number }[] = [];

    for (const o of allOutcomes) {
      const pnl = o.traderPnlUsdc;
      cumPnl += pnl;
      if (pnl > 0) totalWins++;
      else if (pnl < 0) totalLosses++;
      if (o.traderWipedOut) totalWipeouts++;
      pnlHistory.push({ createdAt: o.createdAt, cumulativePnl: cumPnl });
    }

    let totalValueUsdc = 0;
    const traderSummaries: DeskPortfolio["traders"] = perTrader.map(
      ({ tr, assetSum }) => {
        const escrow = tr.escrowBalanceUsdc ?? 0;
        const total = escrow + assetSum;
        totalValueUsdc += total;
        return {
          id: tr._id,
          name: tr.name,
          status: tr.status,
          escrowUsdc: escrow,
          assetValueUsdc: assetSum,
          totalValueUsdc: total,
        };
      }
    );

    return {
      totalValueUsdc,
      traders: traderSummaries,
      pnlHistory,
      stats: {
        totalWins,
        totalLosses,
        totalWipeouts,
        totalPnl: cumPnl,
      },
    };
  },
});
