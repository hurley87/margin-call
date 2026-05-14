"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Dialog } from "@base-ui/react/dialog";
import {
  Github,
  HelpCircle,
  LogOut,
  Twitter,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../../convex/_generated/api";
import { DealApprovalDialog } from "@/components/deal-approval-dialog";
import { DealDetailDialog } from "@/components/deal-detail";
import {
  FeedLine,
  buildApprovalIdByEntryId,
  buildReviewCtaEntryIds,
  getFeedGridClass,
} from "@/components/feed-line";
import { PendingApprovalCard } from "@/components/pending-approval-card";
import { TraderAvatar } from "@/components/trader-avatar";
import { ConvexIdentityDebug } from "@/components/convex-identity-debug";
import { LiveGameToasts } from "@/components/live-game-toasts";
import { PublicTraderDialog } from "@/components/public-trader-dialog";
import { TraderCreationDialog } from "@/components/trader-creation-flow";
import { TraderDetailDialog } from "@/components/trader-detail";
import { CreateDealDialog } from "@/components/wire/create-deal-dialog";
import type { AgentActivity } from "@/hooks/use-agent";
import { useActivityFeed, type TraderProfile } from "@/hooks/use-activity-feed";
import {
  usePendingApprovals,
  type PendingApproval,
} from "@/hooks/use-approvals";
import { useDeskManager } from "@/hooks/use-desk";
import { useMyDeals, type Deal } from "@/hooks/use-deals";
import {
  useLeaderboard,
  type LeaderboardTrader,
} from "@/hooks/use-leaderboard";
import { useSfx } from "@/hooks/use-sfx";
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
import { leaderboardFlavorTrait } from "@/lib/portrait-traits";
import { cn, formatShortAddress } from "@/lib/utils";
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

// Fallback copy only appears when Convex has no generated wire epochs yet.
const FALLBACK_WIRE_ITEMS = [
  {
    time: "09:42",
    headline: "Treasury yields slip as desk managers watch Fed chatter",
    impact: "+2% bond desks / margin pressure easing",
    category: "market_update",
  },
  {
    time: "09:36",
    headline: "Takeover rumors circle a battered industrial conglomerate",
    impact: "+3% special situations / SEC heat rising",
    category: "rumor",
  },
  {
    time: "09:28",
    headline: "Junk bond syndicate tests appetite after rough open",
    impact: "risk bid firm / cautious credit desks",
    category: "market",
  },
  {
    time: "09:17",
    headline: "Oil patch sells off on OPEC output concern",
    impact: "-2% energy names / macro desks alert",
    category: "breaking",
  },
] as const;

type WireCategory =
  | "deal_seed"
  | "breaking"
  | "market_update"
  | "market"
  | "rumor";

const CATEGORY_TONE: Record<WireCategory, { label: string; rail: string }> = {
  deal_seed: {
    label: "text-[var(--t-red)]",
    rail: "bg-[var(--t-red)]",
  },
  breaking: {
    label: "text-[var(--t-red)]",
    rail: "bg-[var(--t-red)]",
  },
  market_update: {
    label: "text-[var(--t-accent)]",
    rail: "bg-[var(--t-accent)]",
  },
  market: {
    label: "text-[var(--t-green)]",
    rail: "bg-[var(--t-green)]",
  },
  rumor: {
    label: "text-[var(--t-blue)]",
    rail: "bg-[var(--t-blue)]",
  },
};
const DEFAULT_CATEGORY_TONE = {
  label: "text-[var(--t-muted)]",
  rail: "bg-[var(--t-divider)]",
};

function DeskDeepLinkHydration({
  setSelectedDealId,
  onOpenTraderId,
}: {
  setSelectedDealId: Dispatch<SetStateAction<string | null>>;
  onOpenTraderId: (traderId: string) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const deal = searchParams.get("deal")?.trim();
    const trader = searchParams.get("trader")?.trim();
    if (!deal && !trader) return;

    if (deal) setSelectedDealId(deal);
    if (trader) onOpenTraderId(trader);
    router.replace("/", { scroll: false });
  }, [searchParams, router, setSelectedDealId, onOpenTraderId]);

  return null;
}

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
            Build your desk. Break theirs.
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
      <Dashboard
        displayName={deskManager.display_name}
        deskWalletAddress={deskManager.wallet_address}
      />
      {process.env.NODE_ENV === "development" && <ConvexIdentityDebug />}
    </>
  );
}

function Dashboard({
  displayName,
  deskWalletAddress,
}: {
  displayName: string;
  deskWalletAddress: string;
}) {
  const { logout, user } = usePrivy();
  const nowMs = useSecondTick();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: myDeals, isLoading: myDealsLoading } = useMyDeals();
  const { data: approvals } = usePendingApprovals();
  const { data: feedData, isLoading: feedLoading } = useActivityFeed();
  const { data: leaderboard, isLoading: leaderboardLoading } = useLeaderboard();
  const { balance: cashBalance } = useUsdcBalance();
  const drops = useQuery(api.marketNarratives.feedDrops, { limit: 6 });
  const sfx = useSfx();

  const [traderFilter, setTraderFilter] = useState<string | null>(null);
  const [approvalCtx, setApprovalCtx] = useState<{
    traderId: string;
    dealId: string | null;
  } | null>(null);
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  const [selectedPublicTraderId, setSelectedPublicTraderId] = useState<
    string | null
  >(null);

  const activity = useMemo(() => feedData?.activity ?? [], [feedData]);
  const traderNames = feedData?.traderNames ?? {};
  const traderProfiles = feedData?.traderProfiles ?? {};

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

  const ownedTraderIds = useMemo(
    () => new Set((portfolio?.traders ?? []).map((trader) => trader.id)),
    [portfolio?.traders]
  );

  const handleOpenTraderId = useCallback(
    (traderId: string) => {
      if (ownedTraderIds.has(traderId)) {
        setSelectedTraderId(traderId);
        return;
      }
      setSelectedPublicTraderId(traderId);
    },
    [ownedTraderIds]
  );

  const pnl = portfolio?.stats.total_pnl ?? 0;
  const equity = portfolio?.total_value_usdc ?? 0;
  const cash = cashBalance ?? 0;
  const currentWallet = deskWalletAddress || user?.wallet?.address;

  return (
    <div className="crt-scanlines flex h-svh flex-col overflow-hidden bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
      <Suspense fallback={null}>
        <DeskDeepLinkHydration
          setSelectedDealId={setSelectedDealId}
          onOpenTraderId={handleOpenTraderId}
        />
      </Suspense>
      <LiveGameToasts
        onDealSound={sfx.playDealToast}
        onWipeoutSound={sfx.playWipeoutToast}
      />
      <TopStatusBar
        displayName={displayName}
        nowMs={nowMs}
        cash={cash}
        equity={equity}
        portfolioLoading={portfolioLoading}
        sfxEnabled={sfx.enabled}
        onToggleSfx={sfx.toggleEnabled}
        onLogout={logout}
      />

      <main className="mx-auto grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] gap-2 overflow-hidden px-2 py-2 xl:w-full xl:max-w-[112rem] xl:grid-cols-[22rem_minmax(36rem,1fr)_28rem] xl:grid-rows-1">
        <NewswirePanel drops={drops} />

        <section className="grid min-h-0 grid-rows-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] gap-2 xl:grid-rows-[minmax(22rem,23rem)_minmax(0,1fr)]">
          <TradingDeskPanel
            nowMs={nowMs}
            portfolio={portfolio}
            portfolioLoading={portfolioLoading}
            onOpenTrader={setSelectedTraderId}
            onHireTrader={() => setHireDialogOpen(true)}
            deals={myDeals}
            dealsLoading={myDealsLoading}
            onOpenDeal={setSelectedDealId}
          />
          <TraderFeedPanel
            activity={filteredActivity}
            feedLoading={feedLoading}
            traderFilter={traderFilter}
            traderFilterOptions={portfolio?.traders ?? []}
            onTraderFilter={setTraderFilter}
            traderNames={traderNames}
            traderProfiles={traderProfiles}
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
          currentWallet={currentWallet}
          onOpenTrader={(traderId, isCurrent) => {
            if (isCurrent) {
              setSelectedTraderId(traderId);
              return;
            }
            setSelectedPublicTraderId(traderId);
          }}
        />
      </main>

      <BottomTape pnl={pnl} approvalsCount={pendingApprovals.length} />

      <DealApprovalDialog
        open={approvalCtx !== null}
        onOpenChange={(open) => !open && setApprovalCtx(null)}
        traderId={approvalCtx?.traderId ?? null}
        dealId={approvalCtx?.dealId ?? null}
      />
      <TraderCreationDialog
        open={hireDialogOpen}
        onOpenChange={setHireDialogOpen}
      />
      <DealDetailDialog
        dealId={selectedDealId}
        open={selectedDealId !== null}
        onOpenChange={(open) => !open && setSelectedDealId(null)}
      />
      <TraderDetailDialog
        traderId={selectedTraderId}
        open={selectedTraderId !== null}
        onOpenChange={(open) => !open && setSelectedTraderId(null)}
      />
      <PublicTraderDialog
        traderId={selectedPublicTraderId}
        open={selectedPublicTraderId !== null}
        onOpenChange={(open) => !open && setSelectedPublicTraderId(null)}
      />
    </div>
  );
}

const MARKET_OPEN_SEC = 9 * 3600 + 30 * 60;
const MARKET_CLOSE_SEC = 16 * 3600;
const SECONDS_PER_DAY = 24 * 3600;

const COUNTDOWN_FMT = new Intl.DateTimeFormat("en-US", {
  ...NY_TIME,
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
  hour12: false,
});

const DAYS_UNTIL_NEXT_OPEN: Record<string, number> = {
  Sun: 1,
  Mon: 1,
  Tue: 1,
  Wed: 1,
  Thu: 1,
  Fri: 3,
  Sat: 2,
};

function getMarketCountdown(nowMs: number): { isOpen: boolean; hms: string } {
  const parts = Object.fromEntries(
    COUNTDOWN_FMT.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value])
  );
  const secNow =
    Number(parts.hour) * 3600 +
    Number(parts.minute) * 60 +
    Number(parts.second);
  const weekday = parts.weekday;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const isOpen =
    !isWeekend && secNow >= MARKET_OPEN_SEC && secNow < MARKET_CLOSE_SEC;

  let remaining: number;
  if (isOpen) {
    remaining = MARKET_CLOSE_SEC - secNow;
  } else {
    const beforeOpenToday = !isWeekend && secNow < MARKET_OPEN_SEC;
    const daysToAdd = beforeOpenToday
      ? 0
      : (DAYS_UNTIL_NEXT_OPEN[weekday] ?? 1);
    remaining = daysToAdd * SECONDS_PER_DAY + (MARKET_OPEN_SEC - secNow);
  }

  const rh = Math.floor(remaining / 3600);
  const rm = Math.floor((remaining % 3600) / 60);
  const rs = remaining % 60;
  return {
    isOpen,
    hms: `${rh}:${String(rm).padStart(2, "0")}:${String(rs).padStart(2, "0")}`,
  };
}

function TopStatusBar({
  displayName,
  nowMs,
  cash,
  equity,
  portfolioLoading,
  sfxEnabled,
  onToggleSfx,
  onLogout,
}: {
  displayName: string;
  nowMs: number;
  cash: number;
  equity: number;
  portfolioLoading: boolean;
  sfxEnabled: boolean;
  onToggleSfx: () => void;
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
  const { isOpen, hms } = getMarketCountdown(nowMs);

  return (
    <header className="z-40 shrink-0 bg-[#050706]/95 px-2 pt-2 shadow-[0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
      <div className="grid gap-2 xl:grid-cols-[18rem_14rem_minmax(28rem,1fr)_max-content]">
        <div className="terminal-panel px-3 py-2">
          <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black leading-none tracking-wide text-[var(--t-accent)]">
            MARGIN CALL
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
            Build your desk. Break theirs.
          </p>
        </div>

        <div className="terminal-panel grid grid-cols-2 items-center divide-x divide-[var(--t-divider)] px-3 py-2 text-xs uppercase">
          <div>
            <p className="text-[var(--t-green)]">{day}</p>
            <p className="mt-1 text-[var(--t-green)]">{date}</p>
          </div>
          <div className="flex flex-col items-end justify-center pl-4">
            <p className="font-mono text-xl leading-none tabular-nums text-[var(--t-green)]">
              {hms}
            </p>
            <p className="mt-1 text-[10px] text-[var(--t-accent)]">
              {isOpen ? "CLOSES IN" : "OPENS IN"}
            </p>
          </div>
        </div>

        <div className="terminal-panel grid grid-cols-3 divide-x divide-[var(--t-divider)] text-[11px] uppercase">
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
        </div>

        <div className="terminal-panel flex items-center justify-end gap-2 px-3 py-2">
          <button
            type="button"
            onClick={onToggleSfx}
            title={sfxEnabled ? "Mute live alerts" : "Enable live alerts"}
            aria-label={sfxEnabled ? "Mute live alerts" : "Enable live alerts"}
            aria-pressed={sfxEnabled}
            className="grid h-9 w-9 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)]"
          >
            {sfxEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
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
  const [dealDialog, setDealDialog] = useState<NewswireCreateDialog | null>(
    null
  );
  const [helpOpen, setHelpOpen] = useState(false);

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
          impact: dispatch.body,
          category: dispatch.category,
          body: dispatch.body,
          dealSeed: dispatch.dealSeed,
        }));
      })
      .slice(0, 10);
  }, [drops]);

  return (
    <aside className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Newswire"
        meta={items === undefined ? "WAIT" : undefined}
        action={
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="How deals work"
            aria-label="How deals work"
            className="grid h-7 w-7 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <NewswireList items={items} onCreate={setDealDialog} />
      </div>

      {dealDialog && (
        <CreateDealDialog
          headline={{ headline: dealDialog.headline, body: dealDialog.body }}
          open
          onOpenChange={(open) => !open && setDealDialog(null)}
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

      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
            <Dialog.Title className="sr-only">How deals work</Dialog.Title>
            <div className="flex items-center justify-between border-b border-[var(--t-divider)] bg-[#0b100d] px-4 py-3">
              <h2 className="font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
                How Deals Work
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-red)] hover:text-[var(--t-red)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[var(--t-divider)] px-5 text-xs leading-relaxed text-[var(--t-text)]">
              <section className="space-y-2 py-5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
                  Creating a Deal
                </h3>
                <p className="text-[var(--t-green)]/90">
                  Every news item on the wire is a potential deal. Click{" "}
                  <span className="font-bold text-[var(--t-accent)]">
                    → Create deal
                  </span>{" "}
                  under any headline to open the deal creation dialog. Set a{" "}
                  <span className="font-bold text-[var(--t-amber)]">pot</span>{" "}
                  (the prize pool) and an{" "}
                  <span className="font-bold text-[var(--t-amber)]">
                    entry cost
                  </span>{" "}
                  — the fee other traders pay to send their agents in.
                </p>
                <p className="text-[var(--t-green)]/90">
                  Wire seeds marked{" "}
                  <span className="font-bold text-[var(--t-red)]">
                    → Take seed
                  </span>{" "}
                  come pre-loaded with suggested pot and entry-cost values — hit
                  the ground running or tune them to your liking.
                </p>
              </section>

              <section className="space-y-2 py-5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
                  How You Make Money
                </h3>
                <p className="text-[var(--t-green)]/90">
                  When a trader&apos;s agent enters your deal, they pay the{" "}
                  <span className="font-bold text-[var(--t-amber)]">
                    entry cost
                  </span>{" "}
                  in USDC. That fee goes directly into the pot — growing the
                  prize pool with every new entrant.
                </p>
                <p className="text-[var(--t-green)]/90">
                  GPT determines whether each agent&apos;s trade wins or loses.
                  Winners collect from the pot; losers&apos; entry fees stay in
                  it. As the deal creator you{" "}
                  <span className="font-bold text-[var(--t-amber)]">
                    keep a share of every entry fee
                  </span>{" "}
                  — the more agents that enter, the more you earn, win or lose.
                </p>
              </section>

              <section className="space-y-2 py-5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
                  Strategy
                </h3>
                <ul className="space-y-1.5 text-[var(--t-green)]/90">
                  <li>
                    <span className="text-[var(--t-amber)]">▸</span> High entry
                    cost + big pot attracts aggressive traders — more risk, more
                    reward.
                  </li>
                  <li>
                    <span className="text-[var(--t-amber)]">▸</span> Low entry
                    cost drives volume — more agents enter, more fees you
                    collect.
                  </li>
                  <li>
                    <span className="text-[var(--t-amber)]">▸</span> Your own
                    traders cannot enter deals you create — keep that in mind
                    when sizing.
                  </li>
                </ul>
              </section>
            </div>

            <div className="border-t border-[var(--t-divider)] px-5 py-3">
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="w-full border border-[var(--t-divider)] py-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                Got it — Back to the wire
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
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
  if (items === undefined) {
    return <LoadingLine label="TUNING PRIVATE WIRE" />;
  }
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {FALLBACK_WIRE_ITEMS.map((item, index) => (
          <NewswireItem
            key={item.time + item.headline}
            time={item.time}
            headline={item.headline}
            body={item.impact}
            category={item.category}
            isFirst={index === 0}
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
    <div className="space-y-3">
      {items.map((item, index) => (
        <NewswireItem
          key={`${item.time}-${item.headline}`}
          time={item.time}
          headline={item.headline}
          body={item.body}
          category={item.category}
          dealSeed={item.dealSeed}
          isFirst={index === 0}
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

function NewswireItem({
  time,
  headline,
  body,
  category,
  dealSeed,
  isFirst,
  onCreate,
}: {
  time: string;
  headline: string;
  body: string;
  category?: string;
  dealSeed?: NewswireDealSeed;
  isFirst?: boolean;
  onCreate: () => void;
}) {
  const tone =
    category && category in CATEGORY_TONE
      ? CATEGORY_TONE[category as WireCategory]
      : DEFAULT_CATEGORY_TONE;
  const isSeed = Boolean(dealSeed);
  const potLabel = dealSeed ? formatSeedPot(dealSeed.suggestedPotUsdc) : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onCreate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCreate();
        }
      }}
      className={cn(
        "group relative -mx-2 cursor-money border-b border-[var(--t-divider)]/45 pb-3 pl-3 pr-2 text-xs leading-relaxed transition-colors last:border-b-0 last:pb-0",
        "hover:bg-[var(--t-accent-soft)]/40 focus:bg-[var(--t-accent-soft)]/40 focus:outline-none"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full w-[2px]",
          tone.rail,
          isSeed ? "opacity-90" : "opacity-60"
        )}
      />
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
        {isFirst && (
          <span
            aria-label="latest"
            className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-[var(--t-green)]"
          />
        )}
        {category && (
          <span className={cn("font-semibold", tone.label)}>
            {category.replaceAll("_", " ")}
          </span>
        )}
        <time className="tabular-nums text-[var(--t-muted)]">{time}</time>
      </div>
      <h3 className="font-medium text-[var(--t-amber)]">{headline}</h3>
      <p className="mt-1 text-[var(--t-green)]/90">{body}</p>
      {isSeed && potLabel ? (
        <span className="wire-cta-bounce mt-2 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--t-red)]">
          <span>→ Take seed · {potLabel} pot</span>
          {dealSeed && dealSeed.linkedDealCount > 0 && (
            <span className="text-[var(--t-muted)]">
              ({dealSeed.linkedDealCount} taken)
            </span>
          )}
        </span>
      ) : (
        <span className="wire-cta-bounce mt-2 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--t-accent)]/70 transition-colors group-hover:text-[var(--t-accent)]">
          → Create deal
        </span>
      )}
    </article>
  );
}

function formatSeedPot(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return value >= 10 || Number.isInteger(value)
    ? `$${Math.round(value)}`
    : `$${value.toFixed(2)}`;
}

function tradingDeskPanelMeta(
  showingDeals: boolean,
  dealsLoading: boolean,
  dealCount: number,
  traderCount: number
): string {
  if (showingDeals) {
    return dealsLoading
      ? "WAIT"
      : `${dealCount} DEAL${dealCount === 1 ? "" : "S"}`;
  }
  return `${traderCount} TRADER${traderCount === 1 ? "" : "S"}`;
}

function TradingDeskPanel({
  nowMs,
  portfolio,
  portfolioLoading,
  onOpenTrader,
  onHireTrader,
  deals,
  dealsLoading,
  onOpenDeal,
}: {
  nowMs: number;
  portfolio: Portfolio | undefined;
  portfolioLoading: boolean;
  onOpenTrader: (id: string) => void;
  onHireTrader: () => void;
  deals: Deal[] | undefined;
  dealsLoading: boolean;
  onOpenDeal: (dealId: string) => void;
}) {
  const traders = portfolio?.traders ?? [];
  const deskDeals = deals ?? [];
  const [manualDeskView, setDeskView] = useState<"traders" | "deals" | null>(
    null
  );
  const deskView =
    manualDeskView ??
    (!dealsLoading && deskDeals.length > 0 ? "deals" : "traders");

  const showingDeals = deskView === "deals";

  const deskPanelMeta = tradingDeskPanelMeta(
    showingDeals,
    dealsLoading,
    deskDeals.length,
    traders.length
  );

  return (
    <section className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Your Trading Desk"
        meta={deskPanelMeta}
        action={
          <div className="flex items-center gap-2">
            <div className="flex border border-[var(--t-divider)] text-[10px] uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setDeskView("traders")}
                className={cn(
                  "px-2 py-1",
                  deskView === "traders"
                    ? "bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                    : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                )}
              >
                Traders
              </button>
              <button
                type="button"
                onClick={() => setDeskView("deals")}
                className={cn(
                  "border-l border-[var(--t-divider)] px-2 py-1",
                  deskView === "deals"
                    ? "bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                    : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                )}
              >
                Deals{deskDeals.length > 0 && ` (${deskDeals.length})`}
              </button>
            </div>
            <button
              type="button"
              onClick={onHireTrader}
              className="border border-[var(--t-divider)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            >
              Hire Trader
            </button>
          </div>
        }
      />

      <TradingDeskMain
        showingDeals={showingDeals}
        traders={traders}
        portfolioLoading={portfolioLoading}
        deskDeals={deskDeals}
        dealsLoading={dealsLoading}
        nowMs={nowMs}
        onOpenTrader={onOpenTrader}
        onOpenDeal={onOpenDeal}
        onHireTrader={onHireTrader}
      />
    </section>
  );
}

function TradingDeskMain({
  showingDeals,
  traders,
  portfolioLoading,
  deskDeals,
  dealsLoading,
  nowMs,
  onOpenTrader,
  onOpenDeal,
  onHireTrader,
}: {
  showingDeals: boolean;
  traders: TraderSummary[];
  portfolioLoading: boolean;
  deskDeals: Deal[];
  dealsLoading: boolean;
  nowMs: number;
  onOpenTrader: (id: string) => void;
  onOpenDeal: (dealId: string) => void;
  onHireTrader: () => void;
}) {
  if (showingDeals) {
    return (
      <DeskDealsView
        deals={deskDeals}
        isLoading={dealsLoading}
        onOpenDeal={onOpenDeal}
      />
    );
  }
  if (portfolioLoading) {
    return (
      <div className="px-4 py-8">
        <LoadingLine label="LOADING DESK ROSTER" />
      </div>
    );
  }
  if (traders.length === 0) {
    return (
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
    );
  }
  return (
    <DeskTradersView
      traders={traders}
      onOpenTrader={onOpenTrader}
      nowMs={nowMs}
    />
  );
}

function DeskTradersView({
  traders,
  onOpenTrader,
  nowMs,
}: {
  traders: TraderSummary[];
  onOpenTrader: (id: string) => void;
  nowMs: number;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(10rem,12rem))] content-center justify-start gap-2 overflow-y-auto p-3">
      {traders.map((trader, index) => {
        const cycleUi = getTraderCycleUi(
          traderCycleDocFromDeskSummary(trader),
          nowMs
        );
        const role = DESK_ROLES[index % DESK_ROLES.length];

        return (
          <button
            key={trader.id}
            type="button"
            onClick={() => onOpenTrader(trader.id)}
            className="group min-w-0 border border-[var(--t-divider)] bg-[#070b09] text-left transition-colors hover:border-[var(--t-accent)] focus:border-[var(--t-accent)] focus:outline-none"
          >
            <div className="relative aspect-[5/4] overflow-hidden border-b border-[var(--t-divider)] bg-[linear-gradient(135deg,rgba(104,166,82,0.16),rgba(218,173,94,0.08)_45%,rgba(0,0,0,0.42))]">
              <TraderAvatar
                name={trader.name}
                src={trader.profile_image_url}
                imageStatus={trader.image_status}
                size="lg"
                className="absolute inset-0"
              />
              <div className="absolute right-2 top-2 h-2 w-2 bg-[var(--t-green)] shadow-[0_0_10px_var(--t-green)]" />
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
  );
}

function DeskDealsView({
  deals,
  isLoading,
  onOpenDeal,
}: {
  deals: Deal[];
  isLoading: boolean;
  onOpenDeal: (dealId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="px-4 py-8">
        <LoadingLine label="LOADING DESK DEALS" />
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm uppercase tracking-wider text-[var(--t-muted)]">
        No deals created by your desk
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid gap-2">
        {deals.map((deal) => (
          <button
            key={deal.id}
            type="button"
            onClick={() => onOpenDeal(deal.id)}
            className="group grid grid-cols-[minmax(0,1fr)_6.25rem] gap-3 border border-[var(--t-divider)] bg-[#070b09] px-3 py-2 text-left text-xs transition-colors hover:border-[var(--t-accent)] focus:border-[var(--t-accent)] focus:outline-none"
          >
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                <span
                  className={
                    deal.status === "open"
                      ? "text-[var(--t-green)]"
                      : "text-[var(--t-amber)]"
                  }
                >
                  {deal.status}
                </span>
                <span className="text-[var(--t-divider)]">/</span>
                <span>{new Date(deal.created_at).toLocaleDateString()}</span>
              </div>
              <p className="line-clamp-2 text-[var(--t-amber)] group-hover:text-[var(--t-accent)]">
                {deal.source_headline || deal.prompt}
              </p>
              {deal.source_headline && (
                <p className="mt-1 line-clamp-1 text-[var(--t-green)]">
                  {deal.prompt}
                </p>
              )}
            </div>
            <div className="space-y-1 text-right text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              <p>
                Pot{" "}
                <span className="text-[var(--t-text)]">
                  ${deal.pot_usdc.toFixed(2)}
                </span>
              </p>
              <p>
                Entry{" "}
                <span className="text-[var(--t-text)]">
                  ${deal.entry_cost_usdc.toFixed(2)}
                </span>
              </p>
              <p>
                Hits{" "}
                <span className="text-[var(--t-text)]">{deal.entry_count}</span>
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
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
  traderFilterOptions,
  onTraderFilter,
  traderNames,
  traderProfiles,
  approvalsCount,
  approvals,
  reviewCtaEntryIds,
  approvalIdByEntryId,
  onReviewApproval,
}: {
  activity: AgentActivity[];
  feedLoading: boolean;
  traderFilter: string | null;
  traderFilterOptions: TraderSummary[];
  onTraderFilter: (id: string | null) => void;
  traderNames: Record<string, string>;
  traderProfiles: Record<string, TraderProfile>;
  approvalsCount: number;
  approvals: PendingApproval[];
  reviewCtaEntryIds: ReadonlySet<string>;
  approvalIdByEntryId: ReadonlyMap<string, string>;
  onReviewApproval: (ctx: { traderId: string; dealId: string | null }) => void;
}) {
  let feedMeta = "ALL DESKS";
  if (traderFilter) {
    const name = traderNames[traderFilter];
    if (name) feedMeta = name;
  }

  return (
    <section className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Trader Feed"
        meta={feedMeta}
        action={
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex max-w-[20rem] items-center gap-1 overflow-x-auto">
              <TraderFeedFilterButton
                label="All"
                selected={traderFilter === null}
                onClick={() => onTraderFilter(null)}
              />
              {traderFilterOptions.map((trader) => (
                <TraderFeedFilterButton
                  key={trader.id}
                  label={trader.name}
                  selected={traderFilter === trader.id}
                  onClick={() => onTraderFilter(trader.id)}
                />
              ))}
            </div>
            {approvalsCount > 0 ? (
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--t-amber)]">
                {approvalsCount} approval{approvalsCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
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
              traderProfile={traderProfiles[entry.trader_id]}
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

function TraderFeedFilterButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors",
        selected
          ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
          : "border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
      )}
    >
      {label}
    </button>
  );
}

function MarketPlayersPanel({
  leaderboard,
  isLoading,
  currentWallet,
  onOpenTrader,
}: {
  leaderboard: LeaderboardTrader[] | undefined;
  isLoading: boolean;
  currentWallet: string | undefined;
  onOpenTrader: (id: string, isCurrent: boolean) => void;
}) {
  const current = currentWallet?.toLowerCase();

  return (
    <aside className="terminal-panel flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Trading Floor"
        meta={leaderboard ? `${leaderboard.length}` : "WAIT"}
      />

      <div className="grid grid-cols-[2rem_minmax(0,1fr)_6.5rem_5.75rem_5rem] border-b border-[var(--t-divider)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
        <span>#</span>
        <span>Trader</span>
        <span>Owner</span>
        <span className="text-right">Equity</span>
        <span className="text-right">P&L</span>
      </div>

      {isLoading || leaderboard === undefined ? (
        <div className="px-4 py-8">
          <LoadingLine label="POLLING EXCHANGE FLOOR" />
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs uppercase tracking-wider text-[var(--t-muted)]">
          No traders on the floor yet.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {leaderboard.map((trader, index) => {
            const isCurrent = current
              ? trader.owner_address.toLowerCase() === current
              : false;
            const flavorTrait = leaderboardFlavorTrait(trader.traits);

            return (
              <button
                key={trader.id}
                type="button"
                onClick={() => onOpenTrader(trader.id, isCurrent)}
                className={cn(
                  "grid w-full grid-cols-[2rem_minmax(0,1fr)_6.5rem_5.75rem_5rem] items-center border-b border-[var(--t-divider)] px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--t-accent)]/10 focus:bg-[var(--t-accent)]/10 focus:outline-none",
                  isCurrent
                    ? "bg-[var(--t-green)]/10 text-[var(--t-green)]"
                    : "text-[var(--t-muted)]"
                )}
              >
                <span className="tabular-nums">{index + 1}</span>
                <div className="flex min-w-0 items-center gap-2">
                  <TraderAvatar
                    name={trader.name}
                    src={trader.profileImageUrl}
                    imageStatus={trader.imageStatus}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[var(--t-text)]">
                      {trader.name}
                    </p>
                    <p className="truncate text-[10px] uppercase text-[var(--t-muted)]">
                      {trader.status}
                    </p>
                    {flavorTrait ? (
                      <p className="truncate text-[10px] uppercase text-[var(--t-accent)]/80">
                        {flavorTrait}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="truncate text-[10px] text-[var(--t-muted)]">
                  {formatOwnerWallet(trader.owner_address, isCurrent)}
                </span>
                <span className="text-right tabular-nums">
                  {formatCompactMoney(trader.total_value)}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    pnlSignClass(trader.total_pnl)
                  )}
                >
                  {trader.total_pnl >= 0 ? "+" : ""}
                  {formatCompactMoney(trader.total_pnl)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
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

function formatOwnerWallet(ownerAddress: string, isCurrent: boolean) {
  const suffix = isCurrent ? " (You)" : "";
  return `${formatShortAddress(ownerAddress)}${suffix}`;
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
