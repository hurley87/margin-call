/**
 * Snapshot writer for the price poller. Lives in its own (non-Node) module
 * because `pricePoll.ts` is a `"use node"` action file, and Convex only allows
 * actions in Node files — mutations must be defined elsewhere.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

interface ParsedSnapshot {
  address: string;
  symbol: string;
  priceUsd?: number;
  volume24hUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  priceChange24hPct?: number;
  source: string;
  ok: boolean;
  error?: string;
  dayKey: string;
}

export const insertSnapshots = internalMutation({
  args: { snapshots: v.array(v.any()) },
  handler: async (ctx, { snapshots }) => {
    const now = Date.now();
    for (const s of snapshots as ParsedSnapshot[]) {
      await ctx.db.insert("tokenSnapshots", {
        address: s.address,
        symbol: s.symbol,
        priceUsd: s.priceUsd,
        volume24hUsd: s.volume24hUsd,
        marketCapUsd: s.marketCapUsd,
        fdvUsd: s.fdvUsd,
        priceChange24hPct: s.priceChange24hPct,
        source: s.source,
        ok: s.ok,
        error: s.error,
        dayKey: s.dayKey,
        createdAt: now,
      });
    }
    return { inserted: snapshots.length };
  },
});
