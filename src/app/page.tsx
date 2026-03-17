"use client";

import { useState } from "react";
import Link from "next/link";

import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useDeskManager } from "@/hooks/use-desk";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useTraders } from "@/hooks/use-traders";

import { usePendingApprovals, useApproveReject } from "@/hooks/use-approvals";
import { useMyDeals } from "@/hooks/use-deals";
import type { Deal } from "@/hooks/use-deals";
import { useDashboardRealtime } from "@/hooks/use-realtime";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { authFetch } from "@/lib/api";
import { Nav } from "@/components/nav";
import { FeedLine } from "@/components/feed-line";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { data: deskManager, isLoading: deskLoading } = useDeskManager();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] font-mono">
        <p className="text-[var(--t-muted)]">
          INITIALIZING...<span className="cursor-blink">█</span>
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="crt-scanlines flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--t-bg)] font-mono">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--t-text)] tracking-tight font-[family-name:var(--font-plex-sans)]">
            MARGIN CALL
          </h1>
          <p className="mt-2 text-sm text-[var(--t-muted)]">
            Wall Street Agent Trading Game
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 text-xs text-[var(--t-muted)]">
          <p>DESK_OS v2.1</p>
          <p>LOADING TRADE ENGINE...</p>
        </div>
        <button
          onClick={login}
          className="border border-[var(--t-border)] bg-[var(--t-surface)] px-8 py-3 font-mono text-sm text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
        >
          {">"} CONNECT_WALLET<span className="cursor-blink">█</span>
        </button>
        <p className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
          SECURE LINK VIA PRIVY // BASE NETWORK
        </p>
      </div>
    );
  }

  if (deskLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] font-mono">
        <p className="text-[var(--t-muted)]">
          REGISTERING DESK MANAGER...<span className="cursor-blink">█</span>
        </p>
      </div>
    );
  }

  if (!deskManager) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--t-bg)] font-mono">
        <p className="text-[var(--t-red)]">ERR: NO WALLET DETECTED</p>
        <button
          onClick={logout}
          className="text-sm text-[var(--t-muted)] transition-colors hover:text-[var(--t-red)]"
        >
          [DISCONNECT]
        </button>
      </div>
    );
  }

  return <Dashboard displayName={deskManager.display_name} />;
}

/* ── Dashboard ── */

function Dashboard({ displayName }: { displayName: string }) {
  useDashboardRealtime();

  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: traders } = useTraders();
  const { data: approvals } = usePendingApprovals();
  const { data: deals } = useMyDeals();
  const { data: feedData, isLoading: feedLoading } = useActivityFeed();
  const { balance: usdcBalance } = useUsdcBalance();

  const [traderFilter, setTraderFilter] = useState<string | null>(null);

  const activity = feedData?.activity ?? [];
  const traderNames = feedData?.traderNames ?? {};

  const filteredActivity = traderFilter
    ? activity.filter((a) => a.trader_id === traderFilter)
    : activity;

  const pnl = portfolio?.stats.total_pnl ?? 0;
  const pendingCount = approvals?.length ?? 0;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      {/* Ticker Strip */}
      <div className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-1.5 text-sm">
          <div className="flex items-center gap-4">
            <span className="text-[var(--t-text)]">
              <span className="text-[var(--t-muted)]">PORT </span>
              {portfolioLoading
                ? "..."
                : `$${(portfolio?.total_value_usdc ?? 0).toFixed(2)}`}
            </span>
            <span
              className={
                pnl >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]"
              }
            >
              <span className="text-[var(--t-muted)]">P&L </span>
              {portfolioLoading
                ? "..."
                : `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[var(--t-text)]">
              <span className="text-[var(--t-muted)]">USDC </span>
              {usdcBalance !== undefined ? `$${usdcBalance.toFixed(2)}` : "..."}
            </span>
            <span className="text-[var(--t-muted)]">{displayName}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-4">
        {/* Trader Roster */}
        <TraderRoster
          portfolio={portfolio}
          portfolioLoading={portfolioLoading}
        />

        {/* My Deals */}
        <MyDeals deals={deals ?? []} />

        {/* Trader Filter Chips */}
        {traders && traders.length > 0 && (
          <div className="mb-4 flex items-center gap-2 overflow-x-auto text-xs">
            <button
              onClick={() => setTraderFilter(null)}
              className={`shrink-0 border px-2.5 py-1 transition-colors ${
                traderFilter === null
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)]"
              }`}
            >
              ALL
            </button>
            {traders.map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  setTraderFilter(traderFilter === t.id ? null : t.id)
                }
                className={`flex shrink-0 items-center gap-1.5 border px-2.5 py-1 transition-colors ${
                  traderFilter === t.id
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)]"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    t.status === "active"
                      ? "bg-[var(--t-green)]"
                      : t.status === "paused"
                        ? "bg-[var(--t-amber)]"
                        : "bg-[var(--t-red)]"
                  }`}
                />
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Activity Feed */}
        <div className="mb-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-[var(--t-muted)]">
            LIVE FEED
            {traderFilter && traderNames[traderFilter]
              ? ` — ${traderNames[traderFilter]}`
              : ""}
          </div>
          <div className="border border-[var(--t-border)] bg-[var(--t-bg)]">
            <div className="flex items-center gap-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--t-muted)]">
              <span className="shrink-0">Time</span>
              <span className="w-12 shrink-0 text-right">Type</span>
              {traderFilter === null && (
                <span className="w-16 shrink-0">Trader</span>
              )}
              <span className="flex-1">Message</span>
            </div>
            {feedLoading ? (
              <div className="p-6 text-center text-sm text-[var(--t-muted)]">
                LOADING FEED...<span className="cursor-blink">█</span>
              </div>
            ) : filteredActivity.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-[var(--t-muted)]">NO ACTIVITY YET</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredActivity.map((entry) => (
                  <FeedLine
                    key={entry.id}
                    entry={entry}
                    traderName={traderNames[entry.trader_id] ?? "???"}
                    showTrader={traderFilter === null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inline Pending Approvals */}
        {approvals && approvals.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-xs uppercase tracking-wider text-[var(--t-muted)]">
              PENDING APPROVALS ({approvals.length})
            </div>
            <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
              {approvals.map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Trader Roster ── */

function TraderRoster({
  portfolio,
  portfolioLoading,
}: {
  portfolio: ReturnType<typeof usePortfolio>["data"];
  portfolioLoading: boolean;
}) {
  const traders = portfolio?.traders ?? [];

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
          TRADERS ({traders.length})
        </span>
        <Link
          href="/traders/new"
          className="text-xs border border-[var(--t-border)] px-2 py-0.5 text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
        >
          [+ HIRE TRADER]
        </Link>
      </div>

      <div className="border border-[var(--t-border)]">
        {/* Table Header */}
        <div className="flex items-center justify-between border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--t-muted)]">
          <span>Name</span>
          <div className="flex items-center gap-4">
            <span className="w-20 text-right">Escrow</span>
            <span className="w-20 text-right">Total</span>
          </div>
        </div>

        {/* Trader Rows */}
        {portfolioLoading ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--t-muted)]">
            LOADING...<span className="cursor-blink">█</span>
          </div>
        ) : traders.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-[var(--t-muted)]">
              NO TRADERS ON YOUR DESK
            </p>
            <Link
              href="/traders/new"
              className="mt-4 inline-block border border-[var(--t-border)] bg-[var(--t-surface)] px-6 py-2.5 text-sm text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
            >
              {">"} HIRE YOUR FIRST TRADER
              <span className="cursor-blink">█</span>
            </Link>
          </div>
        ) : (
          traders.map((t) => (
            <Link
              key={t.id}
              href={`/traders/${t.id}`}
              className="flex items-center justify-between border-b border-[var(--t-border)] last:border-b-0 bg-[var(--t-bg)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--t-surface)]"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    t.status === "active"
                      ? "bg-[var(--t-green)]"
                      : t.status === "paused"
                        ? "bg-[var(--t-amber)]"
                        : "bg-[var(--t-red)]"
                  }`}
                />
                <span className="text-[var(--t-text)]">{t.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-20 text-right text-[var(--t-muted)]">
                  ${t.escrow_usdc.toFixed(2)}
                </span>
                <span className="w-20 text-right text-[var(--t-text)]">
                  ${t.total_value_usdc.toFixed(2)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Approval Card ── */

function ApprovalCard({
  approval,
}: {
  approval: {
    id: string;
    trader_name: string;
    deal_prompt: string;
    entry_cost_usdc: number;
    deal_pot_usdc: number;
    expires_at: string;
  };
}) {
  const { mutate, isPending } = useApproveReject();
  const expiresAt = new Date(approval.expires_at);
  const now = new Date();
  const minutesLeft = Math.max(
    0,
    Math.round((expiresAt.getTime() - now.getTime()) / 60000)
  );
  const isExpired = minutesLeft <= 0;

  return (
    <div className="bg-[var(--t-bg)] px-3 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--t-accent)]">
              {approval.trader_name}
            </span>
            <span className="text-[var(--t-muted)]">
              ${approval.entry_cost_usdc.toFixed(2)} into $
              {approval.deal_pot_usdc.toFixed(2)} pot
            </span>
            <span
              className={`text-[10px] ${
                isExpired
                  ? "text-[var(--t-red)]"
                  : minutesLeft < 5
                    ? "text-[var(--t-red)]"
                    : "text-[var(--t-amber)]"
              }`}
            >
              {isExpired ? "EXPIRED" : `${minutesLeft}m`}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--t-muted)]">
            {approval.deal_prompt}
          </p>
        </div>
        {!isExpired && (
          <div className="flex shrink-0 items-center gap-2 text-[10px]">
            <button
              onClick={() =>
                mutate({ approvalId: approval.id, action: "approve" })
              }
              disabled={isPending}
              className="border border-[var(--t-border)] px-2 py-1 text-[var(--t-green)] transition-colors hover:border-[var(--t-green)] disabled:opacity-50"
            >
              APPROVE
            </button>
            <button
              onClick={() =>
                mutate({ approvalId: approval.id, action: "reject" })
              }
              disabled={isPending}
              className="border border-[var(--t-border)] px-2 py-1 text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] disabled:opacity-50"
            >
              DENY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── My Deals ── */

function MyDeals({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--t-muted)]">
        MY DEALS ({deals.length})
      </div>

      <div className="border border-[var(--t-border)]">
        {/* Table Header */}
        <div className="flex items-center justify-between border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--t-muted)]">
          <span>Scenario</span>
          <div className="flex items-center gap-4">
            <span className="w-14 text-right">Pot</span>
            <span className="w-14 text-right">Entry</span>
            <span className="w-10 text-right">Qty</span>
            <span className="w-12 text-right">Status</span>
          </div>
        </div>

        {deals.map((deal) => {
          return (
            <div
              key={deal.id}
              className="flex items-center justify-between gap-2 border-b border-[var(--t-border)] last:border-b-0 bg-[var(--t-bg)] px-3 py-2.5 text-sm"
            >
              <Link
                href={`/deals/${deal.id}`}
                className="min-w-0 flex-1 truncate text-[var(--t-text)] transition-colors hover:text-[var(--t-accent)]"
              >
                {deal.prompt.length > 60
                  ? deal.prompt.slice(0, 60) + "..."
                  : deal.prompt}
              </Link>
              <div className="flex shrink-0 items-center gap-4">
                <span className="w-14 text-right text-[var(--t-green)]">
                  ${deal.pot_usdc.toFixed(2)}
                </span>
                <span className="w-14 text-right text-[var(--t-accent)]">
                  ${deal.entry_cost_usdc.toFixed(2)}
                </span>
                <span className="w-10 text-right text-[var(--t-muted)]">
                  {deal.entry_count}
                </span>
                <span
                  className={`w-12 text-right text-[10px] font-bold ${
                    deal.status === "open"
                      ? "text-[var(--t-green)]"
                      : "text-[var(--t-muted)]"
                  }`}
                >
                  [{deal.status.toUpperCase()}]
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
