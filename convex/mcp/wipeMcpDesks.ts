import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * One-shot operator cleanup: delete every MCP desk (subject prefix
 * `mcp:cdp-wallet:`) and cascade through every table that references it.
 *
 * Intentionally does NOT touch on-chain state — USDC sitting at legacy EOA
 * addresses or in the escrow contract remains there. After this runs, the
 * operator re-issues fresh MCP keys via `POST /api/mcp/keys`; agents re-bind
 * Base Accounts via `set_desk_wallet`.
 *
 * Browser/Privy desks (`did:privy:...` subjects) are untouched.
 *
 * Run via:
 *   npx convex run mcp/wipeMcpDesks:wipeMcpDesks '{}'                 # dry-run
 *   npx convex run mcp/wipeMcpDesks:wipeMcpDesks '{"confirm":true}'   # execute
 */
export const wipeMcpDesks = internalMutation({
  args: { confirm: v.optional(v.boolean()) },
  handler: async (ctx, { confirm }) => {
    const desks = await ctx.db.query("deskManagers").collect();
    const mcpDesks = desks.filter((d) =>
      d.subject.startsWith("mcp:cdp-wallet:")
    );

    const counts = {
      deskManagers: 0,
      mcpApiKeys: 0,
      mcpRequests: 0,
      traders: 0,
      deals: 0,
      dealEntries: 0,
      dealOutcomes: 0,
      dealApprovals: 0,
      agentActivityLog: 0,
      traderTransactions: 0,
      assets: 0,
      emailNotifications: 0,
      wireDealSeedLinks: 0,
    };

    const previews: Array<{
      deskManagerId: Id<"deskManagers">;
      subject: string;
      walletAddress?: string;
    }> = [];

    for (const desk of mcpDesks) {
      previews.push({
        deskManagerId: desk._id,
        subject: desk.subject,
        walletAddress: desk.walletAddress,
      });

      if (confirm) {
        await cascadeDeleteDesk(ctx, desk, counts);
      }
    }

    return {
      dryRun: !confirm,
      desks: previews,
      counts: confirm ? counts : undefined,
    };
  },
});

type Counts = {
  deskManagers: number;
  mcpApiKeys: number;
  mcpRequests: number;
  traders: number;
  deals: number;
  dealEntries: number;
  dealOutcomes: number;
  dealApprovals: number;
  agentActivityLog: number;
  traderTransactions: number;
  assets: number;
  emailNotifications: number;
  wireDealSeedLinks: number;
};

async function cascadeDeleteDesk(
  ctx: MutationCtx,
  desk: Doc<"deskManagers">,
  counts: Counts
): Promise<void> {
  const traders = await ctx.db
    .query("traders")
    .withIndex("byDeskManager", (q) => q.eq("deskManagerId", desk._id))
    .collect();

  for (const trader of traders) {
    const tIdStr = String(trader._id);

    const entries = await ctx.db
      .query("dealEntries")
      .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", tIdStr))
      .collect();
    for (const e of entries) {
      await ctx.db.delete(e._id);
      counts.dealEntries++;
    }

    const outcomes = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", tIdStr))
      .collect();
    for (const o of outcomes) {
      await ctx.db.delete(o._id);
      counts.dealOutcomes++;
    }

    const activity = await ctx.db
      .query("agentActivityLog")
      .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
      .collect();
    for (const a of activity) {
      await ctx.db.delete(a._id);
      counts.agentActivityLog++;
    }

    const txs = await ctx.db
      .query("traderTransactions")
      .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
      .collect();
    for (const t of txs) {
      await ctx.db.delete(t._id);
      counts.traderTransactions++;
    }

    const assets = await ctx.db
      .query("assets")
      .withIndex("byTrader", (q) => q.eq("traderId", trader._id))
      .collect();
    for (const a of assets) {
      await ctx.db.delete(a._id);
      counts.assets++;
    }

    const notifs = await ctx.db
      .query("emailNotifications")
      .withIndex("byTraderAndType", (q) => q.eq("traderId", trader._id))
      .collect();
    for (const n of notifs) {
      await ctx.db.delete(n._id);
      counts.emailNotifications++;
    }

    await ctx.db.delete(trader._id);
    counts.traders++;
  }

  const deals = await ctx.db
    .query("deals")
    .withIndex("byCreator", (q) => q.eq("creatorDeskManagerId", desk._id))
    .collect();
  for (const deal of deals) {
    const entries = await ctx.db
      .query("dealEntries")
      .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
      .collect();
    for (const e of entries) {
      await ctx.db.delete(e._id);
      counts.dealEntries++;
    }

    const outcomes = await ctx.db
      .query("dealOutcomes")
      .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
      .collect();
    for (const o of outcomes) {
      await ctx.db.delete(o._id);
      counts.dealOutcomes++;
    }

    const approvals = await ctx.db
      .query("dealApprovals")
      .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
      .collect();
    for (const a of approvals) {
      await ctx.db.delete(a._id);
      counts.dealApprovals++;
    }

    const seedLinks = await ctx.db
      .query("wireDealSeedLinks")
      .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
      .collect();
    for (const s of seedLinks) {
      await ctx.db.delete(s._id);
      counts.wireDealSeedLinks++;
    }

    await ctx.db.delete(deal._id);
    counts.deals++;
  }

  const remainingApprovals = await ctx.db
    .query("dealApprovals")
    .withIndex("byDeskManager", (q) => q.eq("deskManagerId", desk._id))
    .collect();
  for (const a of remainingApprovals) {
    await ctx.db.delete(a._id);
    counts.dealApprovals++;
  }

  const remainingSeedLinks = await ctx.db
    .query("wireDealSeedLinks")
    .withIndex("byDeskManager", (q) => q.eq("deskManagerId", desk._id))
    .collect();
  for (const s of remainingSeedLinks) {
    await ctx.db.delete(s._id);
    counts.wireDealSeedLinks++;
  }

  const apiKeys = await ctx.db
    .query("mcpApiKeys")
    .withIndex("byDeskManager", (q) => q.eq("deskManagerId", desk._id))
    .collect();
  for (const k of apiKeys) {
    await ctx.db.delete(k._id);
    counts.mcpApiKeys++;
  }

  const requests = await ctx.db
    .query("mcpRequests")
    .withIndex("byDeskManagerAndCreatedAt", (q) =>
      q.eq("deskManagerId", desk._id)
    )
    .collect();
  for (const r of requests) {
    await ctx.db.delete(r._id);
    counts.mcpRequests++;
  }

  await ctx.db.delete(desk._id);
  counts.deskManagers++;
}
