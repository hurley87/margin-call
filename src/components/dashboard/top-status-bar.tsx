"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";

import { MusicPlayer } from "@/components/music-player";
import { useClock } from "@/hooks/use-clock";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { fmtMoney, fmtSignedMoney, fmtTime } from "@/lib/format";

interface TopStatusBarProps {
  displayName: string;
}

export function TopStatusBar({ displayName }: TopStatusBarProps) {
  const { logout } = usePrivy();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { balance: usdcBalance } = useUsdcBalance();
  const nowMs = useClock();

  const equity = portfolio?.total_value_usdc;
  const pnl = portfolio?.stats.total_pnl ?? 0;
  const pnlClass = pnl >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]";

  const now = nowMs === null ? null : new Date(nowMs);
  const dateLabel = now
    ? now.toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit",
      })
    : "--- --";
  const isoDate = now ? now.toISOString().slice(0, 10) : "----------";
  const timeLabel = nowMs === null ? "--:--" : fmtTime(nowMs);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--t-border)] bg-[var(--t-panel-strong)] backdrop-blur supports-[backdrop-filter]:bg-[var(--t-panel)]">
      <div className="flex items-stretch divide-x divide-[var(--t-border)]">
        {/* Wordmark */}
        <div className="flex min-w-[230px] flex-col justify-center px-4 py-2">
          <h1 className="font-[family-name:var(--font-plex-sans)] text-[22px] font-bold tracking-[0.18em] text-[var(--t-accent)] leading-none">
            MARGIN CALL
          </h1>
          <p className="mt-1 text-[9px] tracking-[0.22em] text-[var(--t-muted)]">
            THE 1980S WALL STREET TRADING GAME
          </p>
        </div>

        {/* Date / Clock */}
        <div className="hidden min-w-[150px] flex-col justify-center px-3 py-2 sm:flex">
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] tracking-[0.18em] text-[var(--t-muted)]">
              {dateLabel.toUpperCase()}
            </span>
            <span className="text-base font-bold tabular-nums text-[var(--t-text)]">
              {timeLabel}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-[var(--t-muted)]">
            <span className="tabular-nums">{isoDate}</span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--t-green)] live-pulse" />
            <span className="text-[var(--t-green)]">MARKET OPEN</span>
          </div>
        </div>

        {/* Firm */}
        <div className="hidden min-w-[180px] flex-col justify-center px-3 py-2 md:flex">
          <span className="text-[9px] tracking-[0.18em] text-[var(--t-muted)]">
            YOUR FIRM
          </span>
          <span className="truncate text-sm font-bold tracking-wider text-[var(--t-accent)]">
            {displayName.toUpperCase()}
          </span>
        </div>

        {/* Cash */}
        <Stat
          label="CASH"
          value={fmtMoney(usdcBalance)}
          tone="text"
          loading={usdcBalance === undefined}
        />

        {/* Equity */}
        <Stat
          label="EQUITY"
          value={fmtMoney(equity)}
          tone="green"
          loading={portfolioLoading}
        />

        {/* P&L */}
        <Stat
          label="P&L"
          value={portfolioLoading ? "..." : fmtSignedMoney(pnl)}
          tone={pnl >= 0 ? "green" : "red"}
          loading={portfolioLoading}
          className={pnlClass}
        />

        {/* Right cluster: nav links + utility */}
        <div className="ml-auto flex items-center gap-3 px-3">
          <Link
            href="/wire"
            className="text-[10px] tracking-[0.2em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)]"
          >
            NEWSWIRE
          </Link>
          <Link
            href="/leaderboard"
            className="text-[10px] tracking-[0.2em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)]"
          >
            LEADERS
          </Link>
          <a
            href="https://margin-call.gitbook.io/product-docs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Docs"
            className="border border-[var(--t-border)] px-2 py-1 text-[11px] tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            ?
          </a>
          <MusicPlayer />
          <button
            type="button"
            onClick={logout}
            aria-label="Logout"
            className="border border-[var(--t-border)] px-2 py-1 text-[11px] tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-red)] hover:text-[var(--t-red)]"
          >
            ≡
          </button>
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
  loading,
  className,
}: {
  label: string;
  value: string;
  tone: "text" | "green" | "red" | "amber";
  loading?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--t-green)]"
      : tone === "red"
        ? "text-[var(--t-red)]"
        : tone === "amber"
          ? "text-[var(--t-amber)]"
          : "text-[var(--t-text)]";
  return (
    <div className="hidden min-w-[110px] flex-col justify-center px-3 py-2 lg:flex">
      <span className="text-[9px] tracking-[0.18em] text-[var(--t-muted)]">
        {label}
      </span>
      <span
        className={`truncate text-sm font-bold tabular-nums ${className ?? toneClass}`}
      >
        {loading ? "..." : value}
      </span>
    </div>
  );
}
