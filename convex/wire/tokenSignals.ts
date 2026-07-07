/**
 * Token price signals — turns stored snapshots into the movement facts the wire
 * narrates. The pure core (`computeTokenSignals`) is fully unit-testable; the
 * `loadTokenSignals` internalQuery wires it to the DB.
 *
 * Every number here traces to a stored snapshot (see `refSnapshotIds`). Nothing
 * is fabricated: a token with no usable snapshot yields `ok: false` and no
 * figures, so the wire degrades gracefully rather than inventing a price.
 */

import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { TOKEN_REGISTRY, type TokenEntry } from "./tokenRegistry";
import {
  MOVE_THRESHOLDS,
  STREAK_MIN_DAYS,
  TRAILING_VOLUME_DAYS,
  VOLUME_ANOMALY_MULTIPLE,
  SIGNAL_SNAPSHOT_LOOKBACK,
} from "./priceConfig";

/** Minimal snapshot shape the pure compute needs (newest-first per address). */
export interface SnapshotLite {
  id: string;
  createdAt: number;
  ok: boolean;
  priceUsd: number | null;
  volume24hUsd: number | null;
  dayKey: string | null;
  priceChange24hPct: number | null;
}

export type MoveClassification = "none" | "routine" | "story" | "flash";

export interface TokenSignal {
  slug: string;
  symbol: string;
  companyName: string;
  xHandle: string;
  isHouseToken: boolean;
  /** True when a usable latest price exists. */
  ok: boolean;
  priceUsd: number | null;
  /** % move vs the immediately preceding snapshot (any gap). */
  moveSinceLastPct: number | null;
  /** % move vs ~24h ago (from stored snapshots, else API fallback). */
  move24hPct: number | null;
  move24hSource: "computed" | "api" | null;
  volume24hUsd: number | null;
  /** Latest 24h volume as a multiple of the trailing daily average. */
  volumeVsTrailing: number | null;
  volumeAnomaly: boolean;
  /** Signed consecutive same-direction daily-close steps (+green / -red). */
  streakDays: number;
  classification: MoveClassification;
  latestSnapshotId: string | null;
  /** Snapshot ids the figures above derive from (source trace). */
  refSnapshotIds: string[];
}

const H24_MS = 24 * 60 * 60 * 1000;
const H24_MIN_MS = 20 * 60 * 60 * 1000;
const H24_MAX_MS = 30 * 60 * 60 * 1000;

function pctChange(from: number, to: number): number | null {
  if (from === 0 || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Last (latest) usable snapshot per NY calendar day, oldest day first. */
function dailyCloses(
  snapshots: SnapshotLite[]
): Array<{ dayKey: string; price: number; volume: number | null }> {
  // snapshots are newest-first; first seen per dayKey is that day's close.
  const seen = new Set<string>();
  const closes: Array<{
    dayKey: string;
    price: number;
    volume: number | null;
  }> = [];
  for (const s of snapshots) {
    if (!s.ok || s.priceUsd == null || !s.dayKey) continue;
    if (seen.has(s.dayKey)) continue;
    seen.add(s.dayKey);
    closes.push({
      dayKey: s.dayKey,
      price: s.priceUsd,
      volume: s.volume24hUsd,
    });
  }
  return closes.reverse(); // oldest first
}

/** Signed consecutive same-direction daily-close steps ending on the latest day. */
function computeStreak(closes: Array<{ price: number }>): number {
  if (closes.length < 2) return 0;
  const stepSign = (a: number, b: number) => Math.sign(b - a);
  const lastSign = stepSign(
    closes[closes.length - 2].price,
    closes[closes.length - 1].price
  );
  if (lastSign === 0) return 0;
  let count = 0;
  for (let i = closes.length - 1; i >= 1; i--) {
    if (stepSign(closes[i - 1].price, closes[i].price) === lastSign) count++;
    else break;
  }
  return lastSign * count;
}

function classify(
  maxAbsMovePct: number,
  streakDays: number
): MoveClassification {
  let cls: MoveClassification = "none";
  if (maxAbsMovePct >= MOVE_THRESHOLDS.routinePct) cls = "routine";
  if (maxAbsMovePct >= MOVE_THRESHOLDS.storyPct) cls = "story";
  if (maxAbsMovePct >= MOVE_THRESHOLDS.flashPct) cls = "flash";
  // A sustained streak is always at least a story, even on small daily moves.
  if (
    Math.abs(streakDays) >= STREAK_MIN_DAYS &&
    (cls === "none" || cls === "routine")
  ) {
    cls = "story";
  }
  return cls;
}

function signalFor(token: TokenEntry, snapshots: SnapshotLite[]): TokenSignal {
  const base: TokenSignal = {
    slug: token.slug,
    symbol: token.symbol,
    companyName: token.companyName,
    xHandle: token.xHandle,
    isHouseToken: token.isHouseToken ?? false,
    ok: false,
    priceUsd: null,
    moveSinceLastPct: null,
    move24hPct: null,
    move24hSource: null,
    volume24hUsd: null,
    volumeVsTrailing: null,
    volumeAnomaly: false,
    streakDays: 0,
    classification: "none",
    latestSnapshotId: null,
    refSnapshotIds: [],
  };

  const usable = snapshots.filter((s) => s.ok && s.priceUsd != null);
  const latest = usable[0];
  if (!latest || latest.priceUsd == null) return base;

  const refIds = new Set<string>([latest.id]);
  base.ok = true;
  base.priceUsd = latest.priceUsd;
  base.latestSnapshotId = latest.id;
  base.volume24hUsd = latest.volume24hUsd;

  // Move since the immediately preceding usable snapshot.
  const prev = usable[1];
  if (prev && prev.priceUsd != null) {
    base.moveSinceLastPct = pctChange(prev.priceUsd, latest.priceUsd);
    if (base.moveSinceLastPct != null) refIds.add(prev.id);
  }

  // 24h move: closest usable snapshot within a 20–30h window before latest.
  const target = latest.createdAt - H24_MS;
  let best: SnapshotLite | null = null;
  let bestDist = Infinity;
  for (const s of usable) {
    const age = latest.createdAt - s.createdAt;
    if (age < H24_MIN_MS || age > H24_MAX_MS) continue;
    const dist = Math.abs(s.createdAt - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  if (best && best.priceUsd != null) {
    base.move24hPct = pctChange(best.priceUsd, latest.priceUsd);
    base.move24hSource = "computed";
    if (base.move24hPct != null) refIds.add(best.id);
  } else if (latest.priceChange24hPct != null) {
    base.move24hPct = latest.priceChange24hPct;
    base.move24hSource = "api";
  }

  // Streak + trailing volume from daily closes.
  const closes = dailyCloses(usable);
  base.streakDays = computeStreak(closes);

  if (latest.volume24hUsd != null && closes.length >= 2) {
    // Trailing daily-close volumes, excluding today's close.
    const trailing = closes
      .slice(-1 - TRAILING_VOLUME_DAYS, -1)
      .map((c) => c.volume)
      .filter((v): v is number => v != null && v > 0);
    if (trailing.length > 0) {
      const avg = trailing.reduce((a, b) => a + b, 0) / trailing.length;
      if (avg > 0) {
        base.volumeVsTrailing = latest.volume24hUsd / avg;
        base.volumeAnomaly = base.volumeVsTrailing >= VOLUME_ANOMALY_MULTIPLE;
      }
    }
  }

  const maxAbsMove = Math.max(
    base.moveSinceLastPct != null ? Math.abs(base.moveSinceLastPct) : 0,
    base.move24hPct != null ? Math.abs(base.move24hPct) : 0
  );
  base.classification = classify(maxAbsMove, base.streakDays);
  base.refSnapshotIds = [...refIds];
  return base;
}

/** Pure: compute a signal per registry token from its snapshots (newest-first). */
export function computeTokenSignals(
  snapshotsByAddress: Map<string, SnapshotLite[]>
): TokenSignal[] {
  return TOKEN_REGISTRY.map((token) =>
    signalFor(token, snapshotsByAddress.get(token.addressLc) ?? [])
  );
}

/** Load recent snapshots for every registry token and compute signals. */
export const loadTokenSignals = internalQuery({
  args: {},
  handler: async (ctx): Promise<TokenSignal[]> => {
    const byAddress = new Map<string, SnapshotLite[]>();
    for (const token of TOKEN_REGISTRY) {
      const rows = await ctx.db
        .query("tokenSnapshots")
        .withIndex("byAddressAndCreatedAt", (q) =>
          q.eq("address", token.addressLc)
        )
        .order("desc")
        .take(SIGNAL_SNAPSHOT_LOOKBACK);
      byAddress.set(
        token.addressLc,
        rows.map((r) => ({
          id: r._id as Id<"tokenSnapshots"> as unknown as string,
          createdAt: r.createdAt,
          ok: r.ok,
          priceUsd: r.priceUsd ?? null,
          volume24hUsd: r.volume24hUsd ?? null,
          dayKey: r.dayKey ?? null,
          priceChange24hPct: r.priceChange24hPct ?? null,
        }))
      );
    }
    return computeTokenSignals(byAddress);
  },
});
