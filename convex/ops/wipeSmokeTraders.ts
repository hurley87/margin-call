import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/**
 * One-shot operator cleanup: delete every trader whose name starts with a
 * given prefix (default "Smoke", used by e2e/smoke-test fixtures) and cascade
 * through every table that references the trader.
 *
 * Desks and deals are left intact — only the trader rows and their dependent
 * records (entries, outcomes, activity, transactions, assets, approvals,
 * wipeout email notifications) are removed. On-chain state is untouched.
 *
 * Run via:
 *   npx convex run ops/wipeSmokeTraders:wipeSmokeTraders '{}'
 *   npx convex run ops/wipeSmokeTraders:wipeSmokeTraders '{"confirm":true,"secret":"<GAME_RESET_ADMIN_SECRET>"}'
 */
export const wipeSmokeTraders = internalMutation({
  args: {
    prefix: v.optional(v.string()),
    confirm: v.optional(v.boolean()),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, { prefix, confirm, secret }) => {
    const expected = process.env.GAME_RESET_ADMIN_SECRET;
    if (!expected) {
      throw new Error(
        "GAME_RESET_ADMIN_SECRET is not configured in Convex env"
      );
    }
    if (secret !== expected) {
      throw new Error("Invalid reset secret");
    }

    const namePrefix = prefix ?? "Smoke";
    const allTraders = await ctx.db.query("traders").collect();
    const matches = allTraders.filter((t) => t.name.startsWith(namePrefix));

    const counts = {
      traders: 0,
      dealEntries: 0,
      dealOutcomes: 0,
      dealApprovals: 0,
      agentActivityLog: 0,
      traderTransactions: 0,
      assets: 0,
      emailNotifications: 0,
    };

    const previews = matches.map((t) => ({
      traderId: t._id,
      name: t.name,
      ownerSubject: t.ownerSubject,
      status: t.status,
    }));

    if (confirm) {
      for (const trader of matches) {
        await cascadeDeleteTrader(ctx, trader, counts);
      }
    }

    return {
      dryRun: !confirm,
      prefix: namePrefix,
      matched: previews.length,
      traders: previews,
      counts: confirm ? counts : undefined,
    };
  },
});

type Counts = {
  traders: number;
  dealEntries: number;
  dealOutcomes: number;
  dealApprovals: number;
  agentActivityLog: number;
  traderTransactions: number;
  assets: number;
  emailNotifications: number;
};

async function cascadeDeleteTrader(
  ctx: MutationCtx,
  trader: Doc<"traders">,
  counts: Counts
): Promise<void> {
  const [entries, outcomes, approvals, activity, txs, assets, notifs] =
    await Promise.all([
      ctx.db
        .query("dealEntries")
        .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", trader._id))
        .collect(),
      ctx.db
        .query("dealOutcomes")
        .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
        .collect(),
      ctx.db
        .query("dealApprovals")
        .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
        .collect(),
      ctx.db
        .query("agentActivityLog")
        .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
        .collect(),
      ctx.db
        .query("traderTransactions")
        .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
        .collect(),
      ctx.db
        .query("assets")
        .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
        .collect(),
      ctx.db
        .query("emailNotifications")
        .withIndex("byTraderAndType", (q) => q.eq("traderId", trader._id))
        .collect(),
    ]);

  await Promise.all([
    ...entries.map((r) => ctx.db.delete(r._id)),
    ...outcomes.map((r) => ctx.db.delete(r._id)),
    ...approvals.map((r) => ctx.db.delete(r._id)),
    ...activity.map((r) => ctx.db.delete(r._id)),
    ...txs.map((r) => ctx.db.delete(r._id)),
    ...assets.map((r) => ctx.db.delete(r._id)),
    ...notifs.map((r) => ctx.db.delete(r._id)),
  ]);

  counts.dealEntries += entries.length;
  counts.dealOutcomes += outcomes.length;
  counts.dealApprovals += approvals.length;
  counts.agentActivityLog += activity.length;
  counts.traderTransactions += txs.length;
  counts.assets += assets.length;
  counts.emailNotifications += notifs.length;

  await ctx.db.delete(trader._id);
  counts.traders++;
}
