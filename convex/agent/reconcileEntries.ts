"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { resolveOnChainEntry } from "./cycle";
import { reconciledTxHash } from "./onChainSettlement";
import type { OrphanEntry, StuckEntry } from "../deals";

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
      }
    }

    return { scanned: orphans.length, refunded, cleared, skipped };
  },
});

type StuckSummary = {
  scanned: number;
  settled: number;
  confirmed: number;
  skipped: number;
};

/**
 * Reconcile stuck *verified* deal entries.
 *
 * A stuck entry is a fully-verified entry on a still-open deal whose outcome was
 * voided with a `reconciled:*` sentinel — `resolveOnChainEntry` read a stale
 * `pendingEntries === 0` and concluded the deal was settled, so it never called
 * `settleEntry` and the trader's entry is still pending on-chain (blocking the
 * creator from closing). This sweep re-checks the contract and, for any entry
 * that is genuinely still pending, settles it break-even (entry cost refunded,
 * no pnl/rake — matching the void's "don't trust the LLM PnL" decision) and
 * stamps the real resolve tx over the sentinel:
 *
 *  - `resolved` — was still pending on-chain; settled break-even and stamped.
 *  - `already_resolved` — the sentinel was correct (no pending entry on-chain);
 *    re-stamp the sentinel so the audit trail records the confirmation.
 *
 * Idempotent (once a real `0x…` tx is stamped the entry is no longer a
 * candidate) and safe to run on any cadence.
 */
export const reconcileStuckVerifiedEntries = internalAction({
  args: { staleMinutes: v.optional(v.number()) },
  handler: async (ctx, { staleMinutes }): Promise<StuckSummary> => {
    const cutoffMs =
      Date.now() - (staleMinutes ?? DEFAULT_STALE_MINUTES) * 60_000;

    const candidates: StuckEntry[] = await ctx.runQuery(
      internal.deals.listStuckVerifiedEntries,
      { cutoffMs }
    );

    let settled = 0;
    let confirmed = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const result = await resolveOnChainEntry({
        onChainDealId: candidate.onChainDealId,
        tokenId: candidate.tokenId,
        entryCostUsdc: candidate.entryCostUsdc,
        traderPnlUsdc: 0,
        rakeUsdc: 0,
      }).catch(() => null); // RPC/send/env error — leave for the next tick.

      if (result === null) {
        skipped++;
        continue;
      }

      if (result.status === "resolved") {
        await ctx.runMutation(internal.deals.settleStuckOnChainEntry, {
          entryId: candidate.entryId,
          outcomeId: candidate.outcomeId,
          resolveTxHash: result.txHash,
        });
        settled++;
      } else if (result.status === "already_resolved") {
        await ctx.runMutation(internal.deals.settleStuckOnChainEntry, {
          entryId: candidate.entryId,
          outcomeId: candidate.outcomeId,
          resolveTxHash: reconciledTxHash(result.reason),
        });
        confirmed++;
      }
    }

    return { scanned: candidates.length, settled, confirmed, skipped };
  },
});
