"use client";

import { useLeaderboard } from "@/hooks/use-leaderboard";
import type { LeaderboardTrader } from "@/lib/supabase/leaderboard";
import { fmtMoney, fmtPct } from "@/lib/format";

interface MarketPlayersPanelProps {
  ownerAddress?: string | null;
}

export function MarketPlayersPanel({ ownerAddress }: MarketPlayersPanelProps) {
  const { data: traders, isLoading } = useLeaderboard();

  const ownerLower = ownerAddress?.toLowerCase() ?? null;
  const rows = traders ?? [];

  return (
    <section aria-labelledby="players-heading" className="panel h-full">
      <div className="panel-header">
        <h2 id="players-heading" className="text-[var(--t-accent)]">
          MARKET PLAYERS
        </h2>
        <span className="text-[10px] tracking-wider text-[var(--t-muted)]">
          {rows.length}
        </span>
      </div>

      <div className="panel-body">
        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_3.75rem] items-center gap-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-2 py-1 text-[9px] tracking-wider text-[var(--t-muted)]">
          <span>#</span>
          <span>PLAYER · FIRM</span>
          <span className="text-right">EQUITY</span>
          <span className="text-right">P&amp;L</span>
        </div>
        {isLoading ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--t-muted)]">
            LOADING...<span className="cursor-blink">█</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-[var(--t-muted)]">
            NO PLAYERS YET
          </div>
        ) : (
          <ol>
            {rows.map((row, idx) => (
              <PlayerRow
                key={row.id}
                rank={idx + 1}
                row={row}
                isCurrentUser={
                  ownerLower !== null &&
                  row.owner_address.toLowerCase() === ownerLower
                }
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function PlayerRow({
  rank,
  row,
  isCurrentUser,
}: {
  rank: number;
  row: LeaderboardTrader;
  isCurrentUser: boolean;
}) {
  const pnlPct =
    row.total_value > 0
      ? (row.total_pnl / Math.max(row.total_value - row.total_pnl, 1)) * 100
      : 0;
  const pnlClass =
    row.total_pnl > 0
      ? "text-[var(--t-green)]"
      : row.total_pnl < 0
        ? "text-[var(--t-red)]"
        : "text-[var(--t-muted)]";

  return (
    <li
      className={`grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_3.75rem] items-center gap-1.5 border-b border-[var(--t-border)] px-2 py-1 text-[11px] last:border-b-0 ${
        isCurrentUser
          ? "bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
          : "text-[var(--t-text)]"
      }`}
    >
      <span className="tabular-nums text-[var(--t-muted)]">{rank}</span>
      <span className="truncate" title={row.name}>
        {row.name}
        {isCurrentUser && (
          <span className="ml-1 text-[9px] tracking-wider text-[var(--t-accent)]">
            (YOU)
          </span>
        )}
      </span>
      <span className="text-right tabular-nums">
        {fmtMoney(row.total_value)}
      </span>
      <span className={`text-right tabular-nums ${pnlClass}`}>
        {fmtPct(pnlPct)}
      </span>
    </li>
  );
}
