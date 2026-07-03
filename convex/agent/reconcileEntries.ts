"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { resolveOnChainEntry } from "./cycle";
import type { OrphanEntry } from "../deals";

type ReconcileSummary = {
  scanned: number;
  refunded: number;
  cleared: number;
  skipped: number;
};

/** Default: an entry reservation older than this that never became a verified
 * on-chain entry is considered orphaned. The normal enter→record flow completes
 * in seconds, so 10 min is far outside any in-flight window. Independent of the
 * cron cadence — this only needs to exceed the enter→record SLA. */
const DEFAULT_STALE_MINUTES = 10;

/**
 * Reconcile orphaned deal-entry reservations.
 *
 * An orphan is a `pending:<trader>:<deal>` row on a still-open deal that was
 * never upgraded to a verified entry (the process died between the on-chain
 * `enterDeal` and the Convex `recordVerifiedEntry`). We hand each candidate to
 * the shared `resolveOnChainEntry` settlement helper (break-even: the trader's
 * gross payout is exactly their entry cost, rake 0) and clear the stale row:
 *
 *  - `resolved` — the entry was still pending on-chain (stuck in the contract's
 *    `pendingEntries` count, blocking the creator from closing the deal); we
 *    refund-settled it and clear the row.
 *  - `already_resolved` — the entry never landed or was resolved elsewhere;
 *    nothing to settle, just clear the row.
 *  - `queue_not_head` — another trader is ahead in the contract's FIFO queue;
 *    leave the orphan for the next tick, which retries once the queue advances.
 *
 * Idempotent and safe to run on any cadence.
 */
export const reconcileOrphanEntries = internalAction({
  args: { staleMinutes: v.optional(v.number()) },
  handler: async (ctx, { staleMinutes }): Promise<ReconcileSummary> => {
    const cutoffMs =
      Date.now() - (staleMinutes ?? DEFAULT_STALE_MINUTES) * 60_000;

    const orphans: OrphanEntry[] = await ctx.runQuery(
      internal.deals.listStaleOrphanEntries,
      { cutoffMs }
    );

    let refunded = 0;
    let cleared = 0;
    let skipped = 0;

    const clear = async (
      orphan: OrphanEntry,
      note: string,
      resolveTxHash?: string
    ) => {
      const res = await ctx.runMutation(internal.deals.clearOrphanEntry, {
        entryId: orphan.entryId,
        note,
        resolveTxHash,
      });
      if (res.cleared) cleared++;
      return res.cleared;
    };

    for (const orphan of orphans) {
      // No on-chain footprint possible without a token id / deal id — the
      // reservation never reached the chain. Just clear it.
      if (orphan.tokenId === null || orphan.onChainDealId === null) {
        await clear(orphan, "no on-chain entry (missing token/deal id)");
        continue;
      }

      // Break-even refund: gross payout = entry cost, no pnl, no rake.
      const result = await resolveOnChainEntry({
        onChainDealId: orphan.onChainDealId,
        tokenId: orphan.tokenId,
        entryCostUsdc: orphan.entryCostUsdc,
        traderPnlUsdc: 0,
        rakeUsdc: 0,
      }).catch(() => null); // RPC/send/env error — leave for the next tick.

      if (result === null) {
        skipped++;
        continue;
      }

      if (result.status === "resolved") {
        const didClear = await clear(
          orphan,
          "refunded orphaned pending entry",
          result.txHash
        );
        if (didClear) refunded++;
      } else if (result.status === "already_resolved") {
        await clear(orphan, `no pending entry on-chain (${result.reason})`);
      } else {
        // queue_not_head — another trader ahead in FIFO; retry next tick.
        skipped++;
      }
    }

    return { scanned: orphans.length, refunded, cleared, skipped };
  },
});
