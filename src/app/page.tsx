"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { usePrivy } from "@privy-io/react-auth";
import { useDeskManager } from "@/hooks/use-desk";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useTraders } from "@/hooks/use-traders";

import { usePendingApprovals } from "@/hooks/use-approvals";
import { useMyDeals } from "@/hooks/use-deals";
import type { Deal } from "@/hooks/use-deals";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { Nav } from "@/components/nav";
import {
  FeedLine,
  buildApprovalIdByEntryId,
  buildReviewCtaEntryIds,
  getFeedGridClass,
} from "@/components/feed-line";
import { PendingApprovalCard } from "@/components/pending-approval-card";
import { DealApprovalDialog } from "@/components/deal-approval-dialog";
import { ConvexIdentityDebug } from "@/components/convex-identity-debug";

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

  return (
    <>
      <Dashboard displayName={deskManager.display_name} />
      {process.env.NODE_ENV === "development" && <ConvexIdentityDebug />}
    </>
  );
}

/* ── Dashboard ── */

function Dashboard({ displayName }: { displayName: string }) {

  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: traders } = useTraders();
  const { data: approvals } = usePendingApprovals();
  const { data: deals } = useMyDeals();
  const { data: feedData, isLoading: feedLoading } = useActivityFeed();
  const { balance: usdcBalance } = useUsdcBalance();

  const [traderFilter, setTraderFilter] = useState<string | null>(null);
  const [approvalCtx, setApprovalCtx] = useState<{
    traderId: string;
    dealId: string | null;
  } | null>(null);

  const activity = useMemo(() => feedData?.activity ?? [], [feedData]);
  const traderNames = feedData?.traderNames ?? {};

  const filteredActivity = useMemo(() => {
    if (!traderFilter) return activity;
    const tf = traderFilter.toLowerCase();
    return activity.filter((a) => a.trader_id.toLowerCase() === tf);
  }, [activity, traderFilter]);

  const approvalIdByEntryId = useMemo(() => {
    return buildApprovalIdByEntryId(filteredActivity, approvals ?? []);
  }, [approvals, filteredActivity]);

  const reviewCtaEntryIds = useMemo(
    () => buildReviewCtaEntryIds(filteredActivity),
    [filteredActivity]
  );

  const pnl = portfolio?.stats.total_pnl ?? 0;
  const totalAssetValueUsdc =
    portfolio?.traders.reduce((sum, t) => sum + t.asset_value_usdc, 0) ?? 0;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      {/* Ticker Strip */}
      <div className="sticky top-[37px] z-20 border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-1.5 text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
            <span className="shrink-0 text-[var(--t-text)]">
              <span className="text-[var(--t-muted)]">PORT </span>
              {portfolioLoading
                ? "..."
                : `$${(portfolio?.total_value_usdc ?? 0).toFixed(2)}`}
            </span>
            <span className="shrink-0 text-[var(--t-text)]">
              <span className="text-[var(--t-muted)]">ASSETS </span>
              {portfolioLoading ? "..." : `$${totalAssetValueUsdc.toFixed(2)}`}
            </span>
            <span
              className={`shrink-0 ${
                pnl >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]"
              }`}
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

      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        {/* Trader Roster */}
        <TraderRoster
          portfolio={portfolio}
          portfolioLoading={portfolioLoading}
        />

        {/* My Deals */}
        <MyDeals deals={deals ?? []} />

        {/* Pending approvals: above feed so desk managers see action items first */}
        {approvals && approvals.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-xs uppercase tracking-wider text-[var(--t-amber)]">
              PENDING APPROVALS ({approvals.length})
            </div>
            <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
              {approvals.map((a) => (
                <PendingApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          </div>
        )}

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
            <div
              className={`${getFeedGridClass(traderFilter === null)} border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--t-muted)]`}
            >
              <span>Time</span>
              <span>Type</span>
              {traderFilter === null && <span>Trader</span>}
              <span className="min-w-0">Message</span>
              <span aria-hidden />
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
                    onReviewApproval={(ctx) => setApprovalCtx(ctx)}
                    reviewCtaEntryIds={reviewCtaEntryIds}
                    approvalIdByEntryId={approvalIdByEntryId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DealApprovalDialog
        open={approvalCtx !== null}
        onOpenChange={(open) => {
          if (!open) setApprovalCtx(null);
        }}
        traderId={approvalCtx?.traderId ?? null}
        dealId={approvalCtx?.dealId ?? null}
      />
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
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="w-[4.5rem] shrink-0 text-right sm:w-20">
              Escrow
            </span>
            <span className="w-[4.5rem] shrink-0 text-right sm:w-20">
              Assets
            </span>
            <span className="w-[4.5rem] shrink-0 text-right sm:w-20">
              Total
            </span>
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
              <div className="flex items-center gap-3 sm:gap-4">
                <span className="w-[4.5rem] shrink-0 text-right text-[var(--t-muted)] sm:w-20">
                  ${t.escrow_usdc.toFixed(2)}
                </span>
                <span className="w-[4.5rem] shrink-0 text-right text-[var(--t-muted)] sm:w-20">
                  ${t.asset_value_usdc.toFixed(2)}
                </span>
                <span className="w-[4.5rem] shrink-0 text-right text-[var(--t-text)] sm:w-20">
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
