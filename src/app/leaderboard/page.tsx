"use client";

import { useState } from "react";
import Link from "next/link";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { useGlobalActivity } from "@/hooks/use-global-activity";
import { useLeaderboardRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";
import { FeedLine, getFeedGridClass } from "@/components/feed-line";
import type { LeaderboardTrader } from "@/hooks/use-leaderboard";

type SortKey = "pnl" | "win_rate" | "total_value";
type ActivityFilter = "ALL" | "WINS" | "LOSSES" | "WIPEOUTS" | "ENTRIES";

const ACTIVITY_FILTER_TYPES: Record<ActivityFilter, string[] | null> = {
  ALL: null,
  WINS: ["win"],
  LOSSES: ["loss"],
  WIPEOUTS: ["wipeout"],
  ENTRIES: ["enter"],
};

function sortTraders(
  traders: LeaderboardTrader[],
  key: SortKey
): LeaderboardTrader[] {
  return [...traders].sort((a, b) => {
    switch (key) {
      case "pnl":
        return b.total_pnl - a.total_pnl;
      case "win_rate":
        return b.win_rate - a.win_rate;
      case "total_value":
        return b.total_value - a.total_value;
    }
  });
}

export default function LeaderboardPage() {
  useLeaderboardRealtime();

  const { data: traders, isLoading: tradersLoading } = useLeaderboard();
  const { data: feedData, isLoading: feedLoading } = useGlobalActivity();

  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL");

  const sorted = traders ? sortTraders(traders, sortKey) : [];

  const activity = feedData?.activity ?? [];
  const traderNames = feedData?.traderNames ?? {};

  const filterTypes = ACTIVITY_FILTER_TYPES[activityFilter];
  const filteredActivity = filterTypes
    ? activity.filter((a) => filterTypes.includes(a.activity_type))
    : activity;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        {/* Leaderboard Table */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
              LEADERBOARD
            </span>
            <div className="flex items-center gap-2 text-xs">
              {(["pnl", "win_rate", "total_value"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`border px-2 py-0.5 transition-colors ${
                    sortKey === key
                      ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                      : "border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)]"
                  }`}
                >
                  {key === "pnl"
                    ? "P&L"
                    : key === "win_rate"
                      ? "WIN%"
                      : "VALUE"}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[var(--t-border)] bg-[var(--t-bg)]">
            <div className="flex items-center gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--t-muted)]">
              <span className="w-6 shrink-0 text-right">#</span>
              <span className="w-1.5 shrink-0" />
              <span className="min-w-0 flex-1">Trader</span>
              <span className="w-20 shrink-0 text-right">P&L</span>
              <span className="w-24 shrink-0 text-right">Record</span>
              <span className="w-10 shrink-0 text-right">Win%</span>
              <span className="w-16 shrink-0 text-right">Value</span>
            </div>
            {tradersLoading ? (
              <div className="p-6 text-center text-sm text-[var(--t-muted)]">
                LOADING LEADERBOARD...<span className="cursor-blink">█</span>
              </div>
            ) : sorted.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--t-muted)]">
                NO TRADERS YET
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto">
                {sorted.map((t, i) => (
                  <Link
                    key={t.id}
                    href={`/traders/${t.id}`}
                    className="flex items-center gap-3 border-b border-[var(--t-border)] last:border-b-0 bg-[var(--t-bg)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--t-surface)]"
                  >
                    <span className="w-6 shrink-0 text-right text-[var(--t-muted)]">
                      #{i + 1}
                    </span>
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        t.status === "active"
                          ? "bg-[var(--t-green)]"
                          : t.status === "paused"
                            ? "bg-[var(--t-amber)]"
                            : "bg-[var(--t-red)]"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[var(--t-text)]">
                      {t.name}
                    </span>
                    <span
                      className={`w-20 shrink-0 text-right font-bold ${
                        t.total_pnl >= 0
                          ? "text-[var(--t-green)]"
                          : "text-[var(--t-red)]"
                      }`}
                    >
                      {t.total_pnl >= 0 ? "+" : ""}${t.total_pnl.toFixed(2)}
                    </span>
                    <span className="w-24 shrink-0 text-right text-[var(--t-muted)]">
                      W{t.wins} L{t.losses} X{t.wipeouts}
                    </span>
                    <span className="w-10 shrink-0 text-right text-[var(--t-muted)]">
                      {t.win_rate.toFixed(0)}%
                    </span>
                    <span className="w-16 shrink-0 text-right text-[var(--t-text)]">
                      ${t.total_value.toFixed(2)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Global Activity Feed */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
              GLOBAL FEED
            </span>
            <div className="flex items-center gap-1.5 text-xs">
              {(Object.keys(ACTIVITY_FILTER_TYPES) as ActivityFilter[]).map(
                (filter) => (
                  <button
                    key={filter}
                    onClick={() => setActivityFilter(filter)}
                    className={`border px-2 py-0.5 transition-colors ${
                      activityFilter === filter
                        ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                        : "border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)]"
                    }`}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="border border-[var(--t-border)] bg-[var(--t-bg)]">
            <div
              className={`${getFeedGridClass(true)} border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--t-muted)]`}
            >
              <span>Time</span>
              <span>Type</span>
              <span>Trader</span>
              <span className="min-w-0">Message</span>
              <span aria-hidden />
            </div>
            {feedLoading ? (
              <div className="p-6 text-center text-sm text-[var(--t-muted)]">
                LOADING FEED...<span className="cursor-blink">█</span>
              </div>
            ) : filteredActivity.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--t-muted)]">
                NO ACTIVITY YET
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredActivity.map((entry) => (
                  <FeedLine
                    key={entry.id}
                    entry={entry}
                    traderName={traderNames[entry.trader_id] ?? "???"}
                    showTrader={true}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
