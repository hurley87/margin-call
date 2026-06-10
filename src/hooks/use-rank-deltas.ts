"use client";

import { useEffect, useState } from "react";

type RankState = {
  signature: string | null;
  ranks: ReadonlyMap<string, number>;
  deltas: ReadonlyMap<string, number>;
  /** Increments per order change — keys badges so the fade-out replays. */
  bump: number;
};

/**
 * Tracks leaderboard rank movement between subscription results.
 * Returns positive deltas for climbs (`+2` = up two places), negative for
 * slides, only for ids present in both orders. First load reports nothing.
 */
export function useRankDeltas(orderedIds: readonly string[]): {
  deltas: ReadonlyMap<string, number>;
  bump: number;
} {
  const [state, setState] = useState<RankState>({
    signature: null,
    ranks: new Map(),
    deltas: new Map(),
    bump: 0,
  });

  const signature = orderedIds.join("\n");
  if (signature !== state.signature) {
    const ranks = new Map(orderedIds.map((id, index) => [id, index]));
    if (state.signature === null) {
      setState({ signature, ranks, deltas: new Map(), bump: 0 });
    } else {
      const deltas = new Map<string, number>();
      for (const [id, rank] of ranks) {
        const previous = state.ranks.get(id);
        if (previous !== undefined && previous !== rank) {
          deltas.set(id, previous - rank);
        }
      }
      setState({ signature, ranks, deltas, bump: state.bump + 1 });
    }
  }

  return { deltas: state.deltas, bump: state.bump };
}

// ── Session-scoped P&L streaks ─────────────────────────────────────────────
// The backend has no streak data; this is intentionally client-only flavor,
// persisted to sessionStorage so it survives remounts within a session.

const STREAK_STORAGE_KEY = "mc-lb-history";

type StreakHistory = Record<string, { lastPnl: number; streak: number }>;

function readStoredHistory(): StreakHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STREAK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StreakHistory) : {};
  } catch {
    return {};
  }
}

type StreakState = {
  signature: string | null;
  history: StreakHistory;
  streaks: ReadonlyMap<string, number>;
};

/**
 * Consecutive same-direction P&L moves per trader this session:
 * +3 = three gains in a row, -2 = two losses in a row.
 */
export function usePnlStreaks(
  rows: readonly { id: string; pnl: number }[] | undefined
): ReadonlyMap<string, number> {
  const [state, setState] = useState<StreakState>(() => ({
    signature: null,
    history: readStoredHistory(),
    streaks: new Map(),
  }));

  const signature =
    rows === undefined
      ? null
      : rows.map((row) => `${row.id}:${row.pnl.toFixed(2)}`).join("\n");

  if (rows !== undefined && signature !== state.signature) {
    const history: StreakHistory = { ...state.history };
    const streaks = new Map<string, number>();
    for (const row of rows) {
      const previous = history[row.id];
      let streak = previous?.streak ?? 0;
      if (previous === undefined) {
        history[row.id] = { lastPnl: row.pnl, streak: 0 };
      } else if (row.pnl !== previous.lastPnl) {
        const gained = row.pnl > previous.lastPnl;
        streak = gained ? Math.max(1, streak + 1) : Math.min(-1, streak - 1);
        history[row.id] = { lastPnl: row.pnl, streak };
      }
      streaks.set(row.id, streak);
    }
    setState({ signature, history, streaks });
  }

  useEffect(() => {
    if (state.signature === null) return;
    try {
      sessionStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(state.history));
    } catch {
      // Session storage full/unavailable — streaks degrade to in-memory only.
    }
  }, [state.signature, state.history]);

  return state.streaks;
}
