/**
 * Operational reset to run after any MarginCallEscrow / SeatVault redeploy
 * (first used for the #211 Gate 2 hardening; reusable for the prod cutover).
 *
 * A freshly deployed escrow and SeatVault start empty on-chain, so all Convex
 * state that mirrors the OLD contracts (deal registry, escrow balances, seat
 * stakes, sync cursors) is stale and must be cleared before replay against the
 * new addresses. Trader IDENTITIES are preserved: the ERC-8004 NFTs live on the
 * IdentityRegistry, which does not change on a redeploy, so `tokenId`/wallet
 * fields stay put — only each trader's financial/outcome ledger is zeroed.
 *
 * Run dry first to see counts, then commit (re-run until `done: true` — deletes
 * are batched to stay under Convex's per-transaction write limit):
 *   npx convex run admin/resetEscrowState:resetEscrowState '{"dryRun": true}'
 *   npx convex run admin/resetEscrowState:resetEscrowState '{"dryRun": false}'
 *
 * Idempotent and safe to re-run (a later commit finds nothing left to clear).
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc, TableNames } from "../_generated/dataModel";

/** Tables whose every row references the old escrow/SeatVault and is discarded. */
const TABLES_TO_CLEAR: TableNames[] = [
  // Deal registry + settlement records (carry onChainDealId / tx hashes)
  "deals",
  "dealEntries",
  "dealOutcomes",
  "dealApprovals",
  // Money movement + activity history against the old escrow
  "traderTransactions",
  "agentActivityLog",
  // SeatVault read model + ingestion (address changed → all stale)
  "traderSeatState",
  "seatVaultEvents",
  "seatVaultSyncCursors",
  // Non-custodial treasury prepare/confirm intents (calldata targets old escrow)
  "mcpIntents",
  "mcpRequests",
  // Join table linking wire seeds → deals (dealId FKs now dangling)
  "wireDealSeedLinks",
];

export const resetEscrowState = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    /** Max rows to delete per invocation (batched to stay under Convex limits). */
    maxDeletes: v.optional(v.number()),
  },
  handler: async (ctx, { dryRun = true, maxDeletes = 4000 }) => {
    // Dry run: report full counts without touching anything.
    if (dryRun) {
      const cleared: Record<string, number> = {};
      for (const table of TABLES_TO_CLEAR) {
        cleared[table] = (await ctx.db.query(table).collect()).length;
      }
      const traders = await ctx.db.query("traders").collect();
      const tradersZeroed = traders.filter(
        (t) =>
          (t.escrowBalanceUsdc ?? 0) !== 0 ||
          t.lastOutcomeId !== undefined ||
          t.status === "wiped_out"
      ).length;
      return { dryRun, cleared, tradersZeroed, tradersTotal: traders.length };
    }

    // Commit: delete up to `maxDeletes` rows total this run, then stop.
    let budget = maxDeletes;
    const deletedThisRun: Record<string, number> = {};
    for (const table of TABLES_TO_CLEAR) {
      if (budget <= 0) break;
      const batch = await ctx.db.query(table).take(budget);
      for (const row of batch) await ctx.db.delete(row._id);
      if (batch.length > 0) deletedThisRun[table] = batch.length;
      budget -= batch.length;
    }

    // All clear-tables drained iff we never exhausted the budget.
    const done = budget > 0;

    // Zero the trader ledger only once clearing is complete (cheap, idempotent).
    let tradersZeroed = 0;
    if (done) {
      const traders = await ctx.db.query("traders").collect();
      for (const t of traders) {
        const patch: Partial<Doc<"traders">> = {};
        if ((t.escrowBalanceUsdc ?? 0) !== 0) patch.escrowBalanceUsdc = 0;
        if (t.lastOutcomeId !== undefined) patch.lastOutcomeId = undefined;
        if (t.status === "wiped_out") patch.status = "active";
        if (Object.keys(patch).length === 0) continue;
        tradersZeroed++;
        await ctx.db.patch(t._id, { ...patch, updatedAt: Date.now() });
      }
    }

    return { dryRun, done, deletedThisRun, tradersZeroed };
  },
});
