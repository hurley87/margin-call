"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { Github, HelpCircle, LogOut, Twitter } from "lucide-react";
import { useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../../convex/_generated/api";
import { DealApprovalDialog } from "@/components/deal-approval-dialog";
import {
  FeedLine,
  buildApprovalIdByEntryId,
  buildReviewCtaEntryIds,
  getFeedGridClass,
} from "@/components/feed-line";
import { PendingApprovalCard } from "@/components/pending-approval-card";
import { ConvexIdentityDebug } from "@/components/convex-identity-debug";
import { TraderCreationDialog } from "@/components/trader-creation-flow";
import { CreateDealDialog } from "@/components/wire/create-deal-dialog";
import type { AgentActivity } from "@/hooks/use-agent";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import {
  usePendingApprovals,
  type PendingApproval,
} from "@/hooks/use-approvals";
import { useDeskManager } from "@/hooks/use-desk";
import {
  useLeaderboard,
  type LeaderboardTrader,
} from "@/hooks/use-leaderboard";
import {
  usePortfolio,
  type Portfolio,
  type TraderSummary,
} from "@/hooks/use-portfolio";
import { useSecondTick } from "@/hooks/use-second-tick";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import {
  getTraderCycleUi,
  traderCycleDocFromDeskSummary,
} from "@/lib/trader-cycle";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

const NY_TIME: Intl.DateTimeFormatOptions = {
  timeZone: "America/New_York",
};

const TONE_CLASS = {
  text: "text-[var(--t-text)]",
  green: "text-[var(--t-green)]",
  amber: "text-[var(--t-amber)]",
  red: "text-[var(--t-red)]",
} as const;

const EMPTY_PENDING: PendingApproval[] = [];

const DESK_ROLES = [
  { role: "Block Desk", focus: "Industrials" },
  { role: "Risk Manager", focus: "Margin" },
  { role: "Equity Analyst", focus: "Earnings" },
  { role: "Macro Strategist", focus: "Rates" },
  { role: "Arbitrage Lead", focus: "Takeovers" },
] as const;

const WALL_STREET_FIRMS = [
  "Goldman Sachs Trading",
  "Salomon Brothers",
  "Morgan Stanley Desk",
  "Drexel Burnham Lambert",
  "Merrill Lynch Capital",
  "First Boston",
  "Bear Stearns",
  "Kidder Peabody",
  "Paine Webber Desk",
  "Shearson Lehman",
] as const;

// Fallback copy only appears when Convex has no generated wire epochs yet.
const FALLBACK_WIRE_ITEMS = [
  {
    time: "09:42",
    headline: "Treasury yields slip as desk managers watch Fed chatter",
    impact: "+2% bond desks / margin pressure easing",
  },
  {
    time: "09:36",
    headline: "Takeover rumors circle a battered industrial conglomerate",
    impact: "+3% special situations / SEC heat rising",
  },
  {
    time: "09:28",
    headline: "Junk bond syndicate tests appetite after rough open",
    impact: "risk bid firm / cautious credit desks",
  },
  {
    time: "09:17",
    headline: "Oil patch sells off on OPEC output concern",
    impact: "-2% energy names / macro desks alert",
  },
] as const;

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
          <h1 className="font-[family-name:var(--font-plex-sans)] text-3xl font-black tracking-wide text-[var(--t-accent)]">
            MARGIN CALL
          </h1>
          <p className="mt-2 text-sm uppercase tracking-[0.25em] text-[var(--t-muted)]">
            The 1980s Wall Street Trading Game
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 text-xs text-[var(--t-muted)]">
          <p>DESK_OS 1987</p>
          <p>OPENING PRIVATE WIRE...</p>
        </div>
        <button
          onClick={login}
          className="border border-[var(--t-border)] bg-[var(--t-panel-strong)] px-8 py-3 font-mono text-sm uppercase tracking-wider text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
        >
          {">"} CONNECT DESK<span className="cursor-blink">█</span>
        </button>
        <p className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
          Private settlement rail armed // trading floor access required
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
        <p className="text-[var(--t-red)]">ERR: NO DESK CREDENTIALS DETECTED</p>
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

function Dashboard({ displayName }: { displayName: string }) {
  const { logout, user } = usePrivy();
  const nowMs = useSecondTick();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: approvals } = usePendingApprovals();
  const { data: feedData, isLoading: feedLoading } = useActivityFeed();
  const { data: leaderboard, isLoading: leaderboardLoading } = useLeaderboard();
  const { balance: cashBalance } = useUsdcBalance();
  const drops = useQuery(api.marketNarratives.feedDrops, { limit: 12 });

  const [traderFilter, setTraderFilter] = useState<string | null>(null);
  const [approvalCtx, setApprovalCtx] = useState<{
    traderId: string;
    dealId: string | null;
  } | null>(null);
  const [hireDialogOpen, setHireDialogOpen] = useState(false);

  const activity = useMemo(() => feedData?.activity ?? [], [feedData]);
  const traderNames = feedData?.traderNames ?? {};

  const filteredActivity = useMemo(() => {
    if (!traderFilter) return activity;
    const tf = traderFilter.toLowerCase();
    return activity.filter((a) => a.trader_id.toLowerCase() === tf);
  }, [activity, traderFilter]);

  const pendingApprovals = approvals ?? EMPTY_PENDING;

  const approvalIdByEntryId = useMemo(
    () => buildApprovalIdByEntryId(filteredActivity, pendingApprovals),
    [pendingApprovals, filteredActivity]
  );

  const reviewCtaEntryIds = useMemo(
    () => buildReviewCtaEntryIds(filteredActivity),
    [filteredActivity]
  );

  const pnl = portfolio?.stats.total_pnl ?? 0;
  const equity = portfolio?.total_value_usdc ?? 0;
  const cash = cashBalance ?? 0;
  const deskMargin = Math.max(equity - cash, 0);
  const marginThreshold = Math.max(equity * 0.25, 250);
  const isMarginHot = equity > 0 && deskMargin >= marginThreshold;

  return (
    <div className="crt-scanlines flex h-svh flex-col overflow-hidden bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
      <TopStatusBar
        displayName={displayName}
        nowMs={nowMs}
        cash={cash}
        equity={equity}
        margin={deskMargin}
        threshold={marginThreshold}
        marginHot={isMarginHot}
        portfolioLoading={portfolioLoading}
        onLogout={logout}
      />

      <main className="mx-auto grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] gap-2 overflow-hidden px-2 py-2 xl:w-full xl:max-w-[112rem] xl:grid-cols-[22rem_minmax(36rem,1fr)_28rem] xl:grid-rows-1">
        <NewswirePanel drops={drops} />

        <section className="grid min-h-0 grid-rows-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 xl:grid-rows-[minmax(13rem,18rem)_minmax(0,1fr)]">
          <TradingDeskPanel
            nowMs={nowMs}
            portfolio={portfolio}
            portfolioLoading={portfolioLoading}
            traderFilter={traderFilter}
            onTraderFilter={setTraderFilter}
            onHireTrader={() => setHireDialogOpen(true)}
          />
          <TraderFeedPanel
            activity={filteredActivity}
            feedLoading={feedLoading}
            traderFilter={traderFilter}
            traderNames={traderNames}
            approvalsCount={pendingApprovals.length}
            approvals={pendingApprovals}
            reviewCtaEntryIds={reviewCtaEntryIds}
            approvalIdByEntryId={approvalIdByEntryId}
            onReviewApproval={setApprovalCtx}
          />
        </section>

        <MarketPlayersPanel
          leaderboard={leaderboard}
          isLoading={leaderboardLoading}
          currentWallet={user?.wallet?.address}
          displayName={displayName}
        />
      </main>

      <BottomTape pnl={pnl} approvalsCount={pendingApprovals.length} />

      <DealApprovalDialog
        open={approvalCtx !== null}
        onOpenChange={(open) => {
          if (!open) setApprovalCtx(null);
        }}
        traderId={approvalCtx?.traderId ?? null}
        dealId={approvalCtx?.dealId ?? null}
      />
      <TraderCreationDialog
        open={hireDialogOpen}
        onOpenChange={setHireDialogOpen}
      />
    </div>
  );
}

function TopStatusBar({
  displayName,
  nowMs,
  cash,
  equity,
  margin,
  threshold,
  marginHot,
  portfolioLoading,
  onLogout,
}: {
  displayName: string;
  nowMs: number;
  cash: number;
  equity: number;
  margin: number;
  threshold: number;
  marginHot: boolean;
  portfolioLoading: boolean;
  onLogout: () => void;
}) {
  const marketDate = new Date(nowMs);
  const day = marketDate.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    ...NY_TIME,
  });
  const date = marketDate.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...NY_TIME,
  });
  const time = marketDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...NY_TIME,
  });

  return (
    <header className="z-40 shrink-0 border-b border-[var(--t-bronze)] bg-[#050706]/95 px-2 py-2 backdrop-blur-sm">
      <div className="grid gap-2 xl:grid-cols-[18rem_14rem_minmax(28rem,1fr)_max-content]">
        <div className="terminal-panel px-3 py-2">
          <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black leading-none tracking-wide text-[var(--t-accent)]">
            MARGIN CALL
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
            The 1980s Wall Street Trading Game
          </p>
        </div>

        <div className="terminal-panel grid grid-cols-2 divide-x divide-[var(--t-divider)] px-3 py-2 text-xs uppercase">
          <div>
            <p className="text-[var(--t-green)]">{day}</p>
            <p className="mt-1 text-[var(--t-green)]">{date}</p>
          </div>
          <div className="pl-4 text-right">
            <p className="text-xl leading-none text-[var(--t-green)]">{time}</p>
            <p className="mt-1 text-[10px] text-[var(--t-accent)]">
              Market Open
            </p>
          </div>
        </div>

        <div className="terminal-panel grid grid-cols-2 divide-y divide-[var(--t-divider)] text-[11px] uppercase sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          <StatusCell label="Your Firm" value={displayName} />
          <StatusCell
            label="Cash"
            value={portfolioLoading ? "..." : formatMoney(cash)}
            tone="green"
          />
          <StatusCell
            label="Equity"
            value={portfolioLoading ? "..." : formatMoney(equity)}
            tone="green"
          />
          <StatusCell
            label="Margin"
            value={portfolioLoading ? "..." : formatMoney(margin)}
            tone="amber"
          />
          <StatusCell
            label="Margin Call"
            value={portfolioLoading ? "..." : formatMoney(threshold)}
            tone={marginHot ? "red" : "green"}
          />
        </div>

        <div className="terminal-panel flex items-center justify-end gap-2 px-3 py-2">
          <IconLink href="https://x.com/davidbhurley" label="X">
            <Twitter className="h-4 w-4" />
          </IconLink>
          <IconLink
            href="https://github.com/hurley87/margin-call"
            label="GitHub"
          >
            <Github className="h-4 w-4" />
          </IconLink>
          <IconLink
            href="https://margin-call.gitbook.io/product-docs"
            label="Docs"
          >
            <HelpCircle className="h-4 w-4" />
          </IconLink>
          <button
            type="button"
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="grid h-9 w-9 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-red)] hover:text-[var(--t-red)]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusCell({
  label,
  value,
  tone = "text",
}: {
  label: string;
  value: string;
  tone?: "text" | "green" | "amber" | "red";
}) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-[var(--t-muted)]">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${TONE_CLASS[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="grid h-9 w-9 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)]"
    >
      {children}
    </Link>
  );
}

function NewswirePanel({
  drops,
}: {
  drops:
    | Array<{
        createdAt: string;
        dispatches: Array<{
          headline: string;
          body: string;
          category: string;
          role?: string;
          dealSeed?: {
            seedId: Id<"wireDealSeeds">;
            prompt: string;
            suggestedPotUsdc: number;
            suggestedEntryCostUsdc: number;
            linkedDealCount: number;
            linkedPotTotalUsdc: number;
          };
        }>;
      }>
    | undefined;
}) {
  const [mode, setMode] = useState<"wire" | "deals">("wire");
  const [dealDialog, setDealDialog] = useState<NewswireCreateDialog | null>(
    null
  );

  const items = useMemo(() => {
    if (!drops) return undefined;
    return drops
      .flatMap((drop) => {
        const time = new Date(drop.createdAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          ...NY_TIME,
        });
        return drop.dispatches.map((dispatch) => ({
          time,
          headline: dispatch.headline,
          impact:
            dispatch.body.length > 112
              ? `${dispatch.body.slice(0, 112)}...`
              : dispatch.body,
          category: dispatch.category,
          body: dispatch.body,
          dealSeed: dispatch.dealSeed,
        }));
      })
      .slice(0, 28);
  }, [drops]);

  const dealItems = useMemo<NewswireDealItem[] | undefined>(() => {
    if (!items) return undefined;
    return items.flatMap((item) => {
      if (!item.dealSeed) return [];
      return [
        {
          time: item.time,
          headline: item.headline,
          body: item.body,
          category: item.category,
          dealSeed: item.dealSeed,
        },
      ];
    });
  }, [items]);

  const visibleCount = mode === "deals" ? dealItems?.length : items?.length;

  return (
    <aside className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Newswire"
        meta={visibleCount !== undefined ? `${visibleCount}` : "WAIT"}
        action={
          <div className="flex border border-[var(--t-divider)] text-[10px] uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setMode("wire")}
              className={cn(
                "px-2 py-1",
                mode === "wire"
                  ? "bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                  : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
              )}
            >
              Wire
            </button>
            <button
              type="button"
              onClick={() => setMode("deals")}
              className={cn(
                "border-l border-[var(--t-divider)] px-2 py-1",
                mode === "deals"
                  ? "bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                  : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
              )}
            >
              Deals
            </button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {mode === "deals" ? (
          <NewswireDealList items={dealItems} onCreate={setDealDialog} />
        ) : (
          <NewswireList items={items} onCreate={setDealDialog} />
        )}
      </div>

      {dealDialog && (
        <CreateDealDialog
          headline={{ headline: dealDialog.headline, body: dealDialog.body }}
          open
          onOpenChange={(open) => {
            if (!open) setDealDialog(null);
          }}
          dealSeed={
            dealDialog.dealSeed
              ? {
                  seedId: dealDialog.dealSeed.seedId,
                  prompt: dealDialog.dealSeed.prompt,
                  suggestedPotUsdc: dealDialog.dealSeed.suggestedPotUsdc,
                  suggestedEntryCostUsdc:
                    dealDialog.dealSeed.suggestedEntryCostUsdc,
                }
              : undefined
          }
          startWithSuggestions={dealDialog.startWithSuggestions}
        />
      )}
    </aside>
  );
}

type NewswireDealSeed = {
  seedId: Id<"wireDealSeeds">;
  prompt: string;
  suggestedPotUsdc: number;
  suggestedEntryCostUsdc: number;
  linkedDealCount: number;
  linkedPotTotalUsdc: number;
};

type NewswireCreateDialog = {
  headline: string;
  body: string;
  dealSeed?: NewswireDealSeed;
  startWithSuggestions?: boolean;
};

type NewswireDealItem = {
  time: string;
  headline: string;
  body: string;
  category: string;
  dealSeed: NewswireDealSeed;
};

type NewswirePostItem = {
  time: string;
  headline: string;
  body: string;
  impact: string;
  category?: string;
  dealSeed?: NewswireDealSeed;
};

function NewswireList({
  items,
  onCreate,
}: {
  items: NewswirePostItem[] | undefined;
  onCreate: (item: NewswireCreateDialog) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (items === undefined) {
    return <LoadingLine label="TUNING PRIVATE WIRE" />;
  }
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {FALLBACK_WIRE_ITEMS.map((item) => (
          <NewswireItem
            key={item.time + item.headline}
            time={item.time}
            headline={item.headline}
            body={item.impact}
            expanded={expanded[item.time + item.headline] ?? false}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [item.time + item.headline]:
                  !current[item.time + item.headline],
              }))
            }
            onCreate={() =>
              onCreate({
                headline: item.headline,
                body: item.impact,
                startWithSuggestions: true,
              })
            }
          />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <NewswireItem
          key={`${item.time}-${item.headline}`}
          time={item.time}
          headline={item.headline}
          body={item.body}
          category={item.category}
          expanded={expanded[`${item.time}-${item.headline}`] ?? false}
          onToggle={() =>
            setExpanded((current) => ({
              ...current,
              [`${item.time}-${item.headline}`]:
                !current[`${item.time}-${item.headline}`],
            }))
          }
          onCreate={() =>
            onCreate({
              headline: item.headline,
              body: item.body,
              dealSeed: item.dealSeed,
              startWithSuggestions: true,
            })
          }
        />
      ))}
    </div>
  );
}

function NewswireDealList({
  items,
  onCreate,
}: {
  items: NewswireDealItem[] | undefined;
  onCreate: (item: NewswireDealItem) => void;
}) {
  if (items === undefined) {
    return <LoadingLine label="SCANNING DEAL TAPE" />;
  }
  if (items.length === 0) {
    return (
      <div className="px-2 py-8 text-center text-xs uppercase tracking-wider text-[var(--t-muted)]">
        No deal seeds on the wire.
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <NewswireDealRow
          key={`${item.time}-${item.headline}`}
          item={item}
          onCreate={onCreate}
        />
      ))}
    </div>
  );
}

function NewswireItem({
  time,
  headline,
  body,
  category,
  expanded,
  onToggle,
  onCreate,
}: {
  time: string;
  headline: string;
  body: string;
  category?: string;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
}) {
  const canExpand = body.length > 112;
  const displayBody =
    !expanded && canExpand ? `${body.slice(0, 112)}...` : body;

  return (
    <article
      onClick={canExpand ? onToggle : undefined}
      className="cursor-pointer border-b border-[var(--t-divider)]/45 pb-3 text-xs leading-relaxed last:border-b-0 last:pb-0"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
        {category && <span>{category.replaceAll("_", " ")}</span>}
        {category && <span className="text-[var(--t-divider)]">/</span>}
        <time className="tabular-nums text-[var(--t-green)]/80">{time}</time>
      </div>
      <h3 className="text-[var(--t-amber)]">{headline}</h3>
      <p className="mt-1 text-[var(--t-green)]">{displayBody}</p>
      <div className="mt-2 flex items-center gap-3">
        {canExpand && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="text-[10px] uppercase tracking-wider text-[var(--t-muted)] hover:text-[var(--t-text)]"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        <button
          onClick={(event) => {
            event.stopPropagation();
            onCreate();
          }}
          className="text-[10px] uppercase tracking-wider text-[var(--t-accent)]/75 hover:text-[var(--t-accent)]"
        >
          Create Deal
        </button>
      </div>
    </article>
  );
}

function NewswireDealRow({
  item,
  onCreate,
}: {
  item: NewswireDealItem;
  onCreate: (item: NewswireDealItem) => void;
}) {
  return (
    <article className="border border-[var(--t-divider)]/70 bg-black/10 p-2.5 text-xs leading-relaxed">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
        <time className="tabular-nums text-[var(--t-green)]/80">
          {item.time}
        </time>
        <span className="text-[var(--t-divider)]">/</span>
        <span>{item.category.replaceAll("_", " ")}</span>
      </div>
      <h3 className="text-[var(--t-amber)]">{item.headline}</h3>
      <p className="mt-1 line-clamp-3 text-[var(--t-green)]">
        {item.dealSeed.prompt}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
          Pot{" "}
          <span className="text-[var(--t-text)]">
            ${item.dealSeed.suggestedPotUsdc.toFixed(2)}
          </span>{" "}
          / Entry{" "}
          <span className="text-[var(--t-text)]">
            ${item.dealSeed.suggestedEntryCostUsdc.toFixed(2)}
          </span>
          {item.dealSeed.linkedDealCount > 0 && (
            <>
              {" "}
              /{" "}
              <span className="text-[var(--t-accent)]">
                {item.dealSeed.linkedDealCount} live
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => onCreate(item)}
          className="border border-[var(--t-accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)]"
        >
          Create
        </button>
      </div>
    </article>
  );
}

function TradingDeskPanel({
  nowMs,
  portfolio,
  portfolioLoading,
  traderFilter,
  onTraderFilter,
  onHireTrader,
}: {
  nowMs: number;
  portfolio: Portfolio | undefined;
  portfolioLoading: boolean;
  traderFilter: string | null;
  onTraderFilter: (id: string | null) => void;
  onHireTrader: () => void;
}) {
  const traders = portfolio?.traders ?? [];

  return (
    <section className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Your Trading Desk"
        meta={`${traders.length} TRADER${traders.length === 1 ? "" : "S"}`}
        action={
          <button
            type="button"
            onClick={onHireTrader}
            className="border border-[var(--t-divider)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--t-accent)] hover:border-[var(--t-accent)]"
          >
            Hire Trader
          </button>
        }
      />

      {portfolioLoading && (
        <div className="px-4 py-8">
          <LoadingLine label="LOADING DESK ROSTER" />
        </div>
      )}
      {!portfolioLoading && traders.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm uppercase tracking-wider text-[var(--t-muted)]">
            No traders on your desk
          </p>
          <button
            type="button"
            onClick={onHireTrader}
            className="mt-4 inline-block border border-[var(--t-accent)] px-5 py-2 text-xs uppercase tracking-wider text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]"
          >
            Hire Trader
          </button>
        </div>
      )}
      {!portfolioLoading && traders.length > 0 && (
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(10rem,12rem))] content-start justify-start gap-2 overflow-y-auto p-3">
          {traders.map((trader, index) => {
            const cycleUi = getTraderCycleUi(
              traderCycleDocFromDeskSummary(trader),
              nowMs
            );
            const selected = traderFilter === trader.id;
            const role = DESK_ROLES[index % DESK_ROLES.length];

            return (
              <button
                key={trader.id}
                type="button"
                onClick={() => onTraderFilter(selected ? null : trader.id)}
                className={`group min-w-0 border bg-[#070b09] text-left transition-colors hover:border-[var(--t-accent)] ${
                  selected
                    ? "border-[var(--t-accent)] shadow-[0_0_18px_rgba(218,173,94,0.16)]"
                    : "border-[var(--t-divider)]"
                }`}
              >
                <div className="relative aspect-[5/4] overflow-hidden border-b border-[var(--t-divider)] bg-[linear-gradient(135deg,rgba(104,166,82,0.16),rgba(218,173,94,0.08)_45%,rgba(0,0,0,0.42))]">
                  <div className="absolute inset-0 crt-line-grid opacity-45" />
                  <div className="absolute right-2 top-2 h-2 w-2 bg-[var(--t-green)] shadow-[0_0_10px_var(--t-green)]" />
                  <div className="absolute inset-x-0 bottom-4 text-center font-[family-name:var(--font-plex-sans)] text-4xl font-black text-[var(--t-accent)]/80">
                    {initials(trader.name)}
                  </div>
                </div>
                <div className="space-y-2 px-3 py-3">
                  <div>
                    <p className="truncate text-sm font-bold uppercase tracking-wider text-[var(--t-amber)]">
                      {trader.name}
                    </p>
                    <p className="truncate text-[11px] uppercase text-[var(--t-muted)]">
                      {role.role}
                    </p>
                  </div>
                  <TraderDatum label="Focus" value={role.focus} tone="green" />
                  <TraderDatum
                    label="Mood"
                    value={cycleUi.text}
                    className={cycleUi.className}
                  />
                  <TraderDatum
                    label="Risk"
                    value={riskLabel(trader)}
                    tone={trader.total_value_usdc > 0 ? "amber" : "red"}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TraderDatum({
  label,
  value,
  tone = "text",
  className,
}: {
  label: string;
  value: string;
  tone?: "text" | "green" | "amber" | "red";
  className?: string;
}) {
  const toneClass = className ?? TONE_CLASS[tone];

  return (
    <p className="flex min-w-0 items-center gap-1 text-[11px] uppercase">
      <span className="text-[var(--t-muted)]">• {label}:</span>
      <span className={`min-w-0 truncate font-bold ${toneClass}`}>{value}</span>
    </p>
  );
}

function TraderFeedPanel({
  activity,
  feedLoading,
  traderFilter,
  traderNames,
  approvalsCount,
  approvals,
  reviewCtaEntryIds,
  approvalIdByEntryId,
  onReviewApproval,
}: {
  activity: AgentActivity[];
  feedLoading: boolean;
  traderFilter: string | null;
  traderNames: Record<string, string>;
  approvalsCount: number;
  approvals: PendingApproval[];
  reviewCtaEntryIds: ReadonlySet<string>;
  approvalIdByEntryId: ReadonlyMap<string, string>;
  onReviewApproval: (ctx: { traderId: string; dealId: string | null }) => void;
}) {
  const feedMeta =
    traderFilter && traderNames[traderFilter]
      ? traderNames[traderFilter]
      : "ALL DESKS";

  return (
    <section className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Trader Feed"
        meta={feedMeta}
        action={
          approvalsCount > 0 ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--t-amber)]">
              {approvalsCount} approval{approvalsCount === 1 ? "" : "s"}
            </span>
          ) : null
        }
      />

      {approvals.length > 0 && (
        <div className="border-b border-[var(--t-divider)] bg-[var(--t-amber)]/5">
          {approvals.slice(0, 2).map((approval) => (
            <PendingApprovalCard key={approval.id} approval={approval} />
          ))}
        </div>
      )}

      <div
        className={`${getFeedGridClass(traderFilter === null)} border-b border-[var(--t-divider)] bg-[#0b100d] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]`}
      >
        <span>Time</span>
        <span>Type</span>
        {traderFilter === null && <span>Trader</span>}
        <span className="min-w-0">Message</span>
        <span aria-hidden />
      </div>

      {feedLoading ? (
        <div className="px-4 py-8">
          <LoadingLine label="READING TRADER TAPE" />
        </div>
      ) : activity.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm uppercase tracking-wider text-[var(--t-muted)]">
          No trader activity yet
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activity.map((entry) => (
            <FeedLine
              key={entry.id}
              entry={entry}
              traderName={traderNames[entry.trader_id] ?? "???"}
              showTrader={traderFilter === null}
              onReviewApproval={onReviewApproval}
              reviewCtaEntryIds={reviewCtaEntryIds}
              approvalIdByEntryId={approvalIdByEntryId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type FirmStanding = {
  key: string;
  name: string;
  equity: number;
  pnl: number;
  traders: number;
  current: boolean;
};

function MarketPlayersPanel({
  leaderboard,
  isLoading,
  currentWallet,
  displayName,
}: {
  leaderboard: LeaderboardTrader[] | undefined;
  isLoading: boolean;
  currentWallet: string | undefined;
  displayName: string;
}) {
  const firms = useMemo(() => {
    if (!leaderboard) return undefined;
    return groupLeaderboardByFirm(leaderboard, currentWallet, displayName);
  }, [leaderboard, currentWallet, displayName]);

  return (
    <aside className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Market Players"
        meta={firms ? `${firms.length}` : "WAIT"}
      />

      <div className="grid grid-cols-[2rem_minmax(0,1fr)_5.75rem_5rem] border-b border-[var(--t-divider)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
        <span>#</span>
        <span>Player / Firm</span>
        <span className="text-right">Equity</span>
        <span className="text-right">P&L</span>
      </div>

      {isLoading || firms === undefined ? (
        <div className="px-4 py-8">
          <LoadingLine label="POLLING EXCHANGE FLOOR" />
        </div>
      ) : firms.length === 0 ? (
        <FallbackMarketPlayers />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {firms.map((firm, index) => (
            <div
              key={firm.key}
              className={`grid grid-cols-[2rem_minmax(0,1fr)_5.75rem_5rem] items-center border-b border-[var(--t-divider)] px-3 py-2 text-xs ${
                firm.current
                  ? "bg-[var(--t-green)]/10 text-[var(--t-green)]"
                  : "text-[var(--t-muted)]"
              }`}
            >
              <span className="tabular-nums">{index + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-[var(--t-text)]">
                  {firm.name}
                  {firm.current ? " (You)" : ""}
                </p>
                <p className="text-[10px] uppercase text-[var(--t-muted)]">
                  {firm.traders} trader{firm.traders === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-right tabular-nums">
                {formatCompactMoney(firm.equity)}
              </span>
              <span
                className={cn(
                  "text-right tabular-nums",
                  pnlSignClass(firm.pnl)
                )}
              >
                {firm.pnl >= 0 ? "+" : ""}
                {formatCompactMoney(firm.pnl)}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function FallbackMarketPlayers() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {WALL_STREET_FIRMS.slice(0, 8).map((name, index) => (
        <div
          key={name}
          className="grid grid-cols-[2rem_minmax(0,1fr)_5.75rem_5rem] border-b border-[var(--t-divider)] px-3 py-2 text-xs text-[var(--t-muted)]"
        >
          <span>{index + 1}</span>
          <span className="truncate">{name}</span>
          <span className="text-right">
            {formatCompactMoney(2500000 - index * 190000)}
          </span>
          <span
            className={
              index < 3
                ? "text-right text-[var(--t-green)]"
                : "text-right text-[var(--t-red)]"
            }
          >
            {index < 3 ? "+" : "-"}
            {(12.8 - index * 1.7).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function BottomTape({
  pnl,
  approvalsCount,
}: {
  pnl: number;
  approvalsCount: number;
}) {
  return (
    <footer className="z-30 shrink-0 border-t border-[var(--t-bronze)] bg-[#050706]/95 px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--t-muted)]">
      <div className="mx-auto flex max-w-[112rem] items-center gap-6 overflow-x-auto whitespace-nowrap">
        <span>
          System Status:{" "}
          <span className="text-[var(--t-green)]">All systems go</span>
        </span>
        <span>
          Desk P&L:{" "}
          <span className={pnlSignClass(pnl)}>
            {pnl >= 0 ? "+" : ""}
            {formatMoney(pnl)}
          </span>
        </span>
        <span>
          Approvals:{" "}
          <span
            className={
              approvalsCount > 0
                ? "text-[var(--t-amber)]"
                : "text-[var(--t-green)]"
            }
          >
            {approvalsCount}
          </span>
        </span>
        <span>Dow 2,503.45 +1.28%</span>
        <span>S&P 500 336.21 +1.14%</span>
        <span>10Y Yield 8.42%</span>
        <span>Oil (WTI) $18.74 -1.24</span>
        <span>SEC Heat Moderate</span>
      </div>
    </footer>
  );
}

function PanelHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[#0b100d] px-3 py-2">
      <h2 className="truncate font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
        {title}
      </h2>
      <div className="flex shrink-0 items-center gap-2">
        {meta && (
          <span className="border border-[var(--t-divider)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            {meta}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

function LoadingLine({ label }: { label: string }) {
  return (
    <p className="text-center text-xs uppercase tracking-wider text-[var(--t-muted)]">
      {label}...<span className="cursor-blink">█</span>
    </p>
  );
}

function stableFirmRoll(key: string, modulus: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % modulus;
}

function groupLeaderboardByFirm(
  traders: LeaderboardTrader[],
  currentWallet: string | undefined,
  displayName: string
): FirmStanding[] {
  const current = currentWallet?.toLowerCase();
  const map = new Map<string, FirmStanding>();

  traders.forEach((trader) => {
    const key = trader.owner_address || trader.id;
    const normalizedKey = key.toLowerCase();
    const existing = map.get(normalizedKey);
    const isCurrent = current ? normalizedKey === current : false;
    const name = isCurrent
      ? displayName
      : WALL_STREET_FIRMS[
          stableFirmRoll(normalizedKey, WALL_STREET_FIRMS.length)
        ];

    if (!existing) {
      map.set(normalizedKey, {
        key: normalizedKey,
        name,
        equity: trader.total_value,
        pnl: trader.total_pnl,
        traders: 1,
        current: isCurrent,
      });
      return;
    }

    existing.equity += trader.total_value;
    existing.pnl += trader.total_pnl;
    existing.traders += 1;
    existing.current ||= isCurrent;
  });

  return [...map.values()].sort((a, b) => b.equity - a.equity);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function riskLabel(trader: TraderSummary) {
  if (trader.status !== "active") return trader.status.toUpperCase();
  if (trader.total_value_usdc <= 0) return "WIPEOUT";
  const assetRatio = trader.asset_value_usdc / trader.total_value_usdc;
  if (assetRatio > 0.66) return "AGGRESSIVE";
  if (assetRatio > 0.33) return "BALANCED";
  return "CAUTIOUS";
}

function pnlSignClass(value: number) {
  return value >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
