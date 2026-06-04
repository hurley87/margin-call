import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * One-off diagnostic: dump everything we need to understand why a deal is
 * stuck with on-chain pendingEntries > 0.
 *
 * Run:
 *   npx convex run debug:inspectDealByOnChainId '{"onChainDealId": 21}'
 */
export const inspectDealByOnChainId = internalQuery({
  args: { onChainDealId: v.number() },
  handler: async (ctx, { onChainDealId }) => {
    const deal = await ctx.db
      .query("deals")
      .withIndex("byOnChainDealId", (q) => q.eq("onChainDealId", onChainDealId))
      .unique();

    if (!deal) {
      return {
        error: `No Convex deal row with onChainDealId=${onChainDealId}`,
      };
    }

    const entries = await ctx.db
      .query("dealEntries")
      .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
      .collect();

    const outcomes = await ctx.db
      .query("dealOutcomes")
      .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
      .collect();

    const now = Date.now();
    const since24h = now - 24 * 60 * 60_000;

    const perTrader = await Promise.all(
      entries.map(async (entry) => {
        const outcome = outcomes.find((o) => o.traderId === entry.traderId);

        let traderRow: {
          _id: string;
          name: string;
          status: string;
          walletStatus: string;
          tokenId?: number;
          lastCycleAt?: number;
          cycleLeaseUntil?: number;
          escrowBalanceUsdc?: number;
        } | null = null;
        try {
          const t = await ctx.db.get(entry.traderId);
          if (t && "name" in (t as Record<string, unknown>)) {
            const tt = t as unknown as {
              _id: string;
              name: string;
              status: string;
              walletStatus: string;
              tokenId?: number;
              lastCycleAt?: number;
              cycleLeaseUntil?: number;
              escrowBalanceUsdc?: number;
            };
            traderRow = {
              _id: tt._id,
              name: tt.name,
              status: tt.status,
              walletStatus: tt.walletStatus,
              tokenId: tt.tokenId,
              lastCycleAt: tt.lastCycleAt,
              cycleLeaseUntil: tt.cycleLeaseUntil,
              escrowBalanceUsdc: tt.escrowBalanceUsdc,
            };
          }
        } catch {
          /* non-traders.* id (e.g. desk manager) — leave null */
        }

        const ageMs = outcome ? now - outcome.createdAt : null;
        const retryEligible = outcome
          ? !outcome.onChainTxHash &&
            outcome.createdAt >= since24h &&
            deal.onChainDealId !== undefined &&
            deal.onChainDealId !== null
          : false;

        return {
          traderId: entry.traderId,
          tokenId: traderRow?.tokenId,
          traderName: traderRow?.name,
          traderStatus: traderRow?.status,
          walletStatus: traderRow?.walletStatus,
          lastCycleAt: traderRow?.lastCycleAt,
          cycleLeaseUntil: traderRow?.cycleLeaseUntil,
          cycleLeaseActive:
            (traderRow?.cycleLeaseUntil ?? 0) > now ? true : false,
          entry: {
            paymentId: entry.paymentId,
            entryCostUsdc: entry.entryCostUsdc,
            enterTxHash: entry.enterTxHash ?? null,
            resolveTxHash: entry.resolveTxHash ?? null,
            createdAt: entry.createdAt,
          },
          outcome: outcome
            ? {
                _id: outcome._id,
                traderPnlUsdc: outcome.traderPnlUsdc,
                rakeUsdc: outcome.rakeUsdc,
                traderWipedOut: outcome.traderWipedOut,
                onChainTxHash: outcome.onChainTxHash ?? null,
                balanceAppliedAt: outcome.balanceAppliedAt ?? null,
                createdAt: outcome.createdAt,
                ageHours: ageMs
                  ? Math.round((ageMs / 3_600_000) * 10) / 10
                  : null,
              }
            : null,
          bucket: !outcome
            ? "no_outcome_yet"
            : outcome.onChainTxHash
              ? "fully_resolved"
              : retryEligible
                ? "retry_eligible"
                : "orphaned_outside_retry_window",
        };
      })
    );

    return {
      now,
      since24h,
      deal: {
        _id: deal._id,
        onChainDealId: deal.onChainDealId,
        status: deal.status,
        entryCount: deal.entryCount,
        wipeoutCount: deal.wipeoutCount,
        potUsdc: deal.potUsdc,
        entryCostUsdc: deal.entryCostUsdc,
        createdAt: deal.createdAt,
      },
      counts: {
        entries: entries.length,
        outcomes: outcomes.length,
        outcomesResolvedOnChain: outcomes.filter((o) => o.onChainTxHash).length,
        outcomesUnresolvedOnChain: outcomes.filter((o) => !o.onChainTxHash)
          .length,
      },
      perTrader,
    };
  },
});

/**
 * One-off: mark an orphaned `dealOutcomes` row as fully settled WITHOUT
 * applying its PnL to the trader balance.
 *
 * Use case: the on-chain `enterDeal` never landed for this trader (so the
 * loss was never debited on-chain), but a Convex `dealOutcomes` row exists.
 * If left alone, the cycle's retry paths (`findUnresolvedOnChain`,
 * `findUnappliedBalanceOutcome`) would loop forever and/or wrongly deduct
 * the PnL from the Convex escrow balance.
 *
 * Run:
 *   npx convex run debug:forceSettleOutcome \
 *     '{"outcomeId":"jh7f3thjpncrxxy69sxynvg91h87xk40","marker":"manual:operator-unblock-deal-21"}'
 */
export const forceSettleOutcome = internalMutation({
  args: {
    outcomeId: v.id("dealOutcomes"),
    marker: v.string(),
  },
  handler: async (ctx, { outcomeId, marker }) => {
    const outcome = await ctx.db.get(outcomeId);
    if (!outcome) return { ok: false, error: "outcome_not_found" };
    await ctx.db.patch(outcomeId, {
      onChainTxHash: outcome.onChainTxHash ?? marker,
      balanceAppliedAt: outcome.balanceAppliedAt ?? Date.now(),
    });
    return {
      ok: true,
      outcomeId,
      onChainTxHash: outcome.onChainTxHash ?? marker,
      balanceAppliedAt: outcome.balanceAppliedAt ?? Date.now(),
      pnlNotApplied: outcome.traderPnlUsdc,
    };
  },
});
