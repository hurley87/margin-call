import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveTraderProfileImageUrl } from "./lib/profileImage";

type DeskPortfolio = {
  totalValueUsdc: number;
  traders: {
    id: Id<"traders">;
    name: string;
    status: Doc<"traders">["status"];
    walletStatus: Doc<"traders">["walletStatus"];
    lastCycleAt?: number;
    cycleLeaseUntil?: number;
    walletError?: string;
    imageStatus?: Doc<"traders">["imageStatus"];
    profileImageUrl: string;
    escrowUsdc: number;
    assetValueUsdc: number;
    totalValueUsdc: number;
    totalPnl: number;
    wins: number;
    losses: number;
    wipeouts: number;
    dealCount: number;
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
        const profileImageUrl = await resolveTraderProfileImageUrl(ctx, tr);
        return { tr, assetSum, outs, profileImageUrl };
      })
    );

    const allOutcomes: {
      traderPnlUsdc: number;
      createdAt: number;
    }[] = [];

    type TraderStats = {
      totalPnl: number;
      wins: number;
      losses: number;
      wipeouts: number;
    };
    const traderStats = new Map<string, TraderStats>();
    let totalWins = 0;
    let totalLosses = 0;
    let totalWipeouts = 0;
    let totalPnl = 0;

    for (const row of perTrader) {
      const s: TraderStats = { totalPnl: 0, wins: 0, losses: 0, wipeouts: 0 };
      for (const o of row.outs) {
        const pnl = o.traderPnlUsdc ?? 0;
        const wiped = o.traderWipedOut ?? false;
        s.totalPnl += pnl;
        totalPnl += pnl;
        if (wiped) {
          s.wipeouts++;
          totalWipeouts++;
        } else if (pnl > 0) {
          s.wins++;
          totalWins++;
        } else if (pnl < 0) {
          s.losses++;
          totalLosses++;
        }
        allOutcomes.push({ traderPnlUsdc: pnl, createdAt: o.createdAt });
      }
      traderStats.set(String(row.tr._id), s);
    }

    allOutcomes.sort((a, b) => a.createdAt - b.createdAt);

    let cumPnl = 0;
    const pnlHistory: { createdAt: number; cumulativePnl: number }[] = [];
    for (const o of allOutcomes) {
      cumPnl += o.traderPnlUsdc;
      pnlHistory.push({ createdAt: o.createdAt, cumulativePnl: cumPnl });
    }

    let totalValueUsdc = 0;
    const traderSummaries: DeskPortfolio["traders"] = perTrader.map(
      ({ tr, assetSum, outs, profileImageUrl }) => {
        const escrow = tr.escrowBalanceUsdc ?? 0;
        const total = escrow + assetSum;
        totalValueUsdc += total;
        const s = traderStats.get(String(tr._id))!;
        return {
          id: tr._id,
          name: tr.name,
          status: tr.status,
          walletStatus: tr.walletStatus,
          lastCycleAt: tr.lastCycleAt,
          cycleLeaseUntil: tr.cycleLeaseUntil,
          walletError: tr.walletError,
          imageStatus: tr.imageStatus,
          profileImageUrl,
          escrowUsdc: escrow,
          assetValueUsdc: assetSum,
          totalValueUsdc: total,
          totalPnl: s.totalPnl,
          wins: s.wins,
          losses: s.losses,
          wipeouts: s.wipeouts,
          dealCount: outs.length,
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
        totalPnl,
      },
    };
  },
});
