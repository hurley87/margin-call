"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowRight,
  Check,
  Copy,
  Github,
  HelpCircle,
  LogOut,
  Plus,
  Twitter,
  User,
  Volume2,
  VolumeX,
  Wallet,
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
import {
  TraderDetailDialog,
  TraderWalletDialog,
} from "@/components/trader-detail";
import { CreateDealDialog } from "@/components/wire/create-deal-dialog";
import type { AgentActivity } from "@/hooks/use-agent";
import { useActivityFeed, type TraderProfile } from "@/hooks/use-activity-feed";
import {
  usePendingApprovals,
  type PendingApproval,
} from "@/hooks/use-approvals";
import { useDeskManager } from "@/hooks/use-desk";
import { useDeals, useMyDeals, type Deal } from "@/hooks/use-deals";
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
import { useMarketHours } from "@/hooks/use-market-hours";
import { useSecondTick } from "@/hooks/use-second-tick";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import {
  DIALOG_BACKDROP_CLASS,
  dialogPopupClass,
  cn,
  formatShortAddress,
  relativeTime,
} from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
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

// Fallback copy only appears when Convex has no generated wire epochs yet.
const FALLBACK_WIRE_ITEMS = [
  {
    time: "09:42",
    headline: "Treasury yields slip as desk managers watch Fed chatter",
    impact: "+2% bond desks / margin pressure easing",
    category: "market_update",
  },
] as const;

type WireCategory =
  | "deal_seed"
  | "breaking"
  | "market_update"
  | "market"
  | "rumor";

const CATEGORY_RAIL: Record<WireCategory, string> = {
  deal_seed: "bg-[var(--t-red)]",
  breaking: "bg-[var(--t-red)]",
  market_update: "bg-[var(--t-accent)]",
  market: "bg-[var(--t-green)]",
  rumor: "bg-[var(--t-blue)]",
};
const DEFAULT_CATEGORY_RAIL = "bg-[var(--t-divider)]";

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
      <div className="crt-scanlines flex min-h-screen flex-col justify-center gap-8 bg-[var(--t-bg)] px-5 py-8 font-mono text-[var(--t-text)]">
        <div className="mx-auto grid w-full max-w-4xl gap-7 md:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)] md:items-end">
          <section className="min-w-0">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--t-green)]">
              DESK_OS 1987 // PRIVATE WIRE
            </p>
            <h1 className="font-[family-name:var(--font-plex-sans)] text-4xl font-black uppercase leading-none tracking-wide text-[var(--t-accent)] sm:text-5xl">
              MARGIN CALL
            </h1>
            <p className="mt-3 max-w-[42rem] text-sm leading-6 text-[var(--t-green)]/90 sm:text-base">
              Run a hostile Wall Street desk. Fund your wallet, hire an AI
              trader, then write deals that lure rival agents into bad rooms.
            </p>
          </section>

          <section className="terminal-panel px-4 py-4">
            <h2 className="font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.16em] text-[var(--t-amber)]">
              First run
            </h2>
            <ol className="mt-4 grid gap-3 text-xs uppercase tracking-[0.14em] text-[var(--t-muted)]">
              {[
                "Enter by email",
                "Fund desk wallet",
                "Hire first trader",
                "Create first deal",
              ].map((step, index) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="mx-auto flex w-full max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            onClick={login}
            className="min-h-11 border border-[var(--t-border)] bg-[var(--t-panel-strong)] px-6 py-3 font-mono text-sm font-black uppercase tracking-wider text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
          >
            {">"} Enter by email<span className="cursor-blink">█</span>
          </button>
          <p className="text-[11px] uppercase tracking-widest text-[var(--t-muted)]">
            Email OTP access. Embedded Base wallet assigned after sign-in.
          </p>
        </div>
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
          [LOG OUT]
        </button>
      </div>
    );
  }

  return (
    <>
      <Dashboard deskWalletAddress={deskManager.wallet_address} />
      {process.env.NODE_ENV === "development" && <ConvexIdentityDebug />}
    </>
  );
}

function Dashboard({ deskWalletAddress }: { deskWalletAddress: string }) {
  const { logout } = usePrivy();
  const nowMs = useSecondTick();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: myDeals, isLoading: myDealsLoading } = useMyDeals();
  const { data: marketDeals, isLoading: marketDealsLoading } = useDeals();
  const { data: approvals } = usePendingApprovals();
  const { data: feedData, isLoading: feedLoading } = useActivityFeed();
  const { data: leaderboard, isLoading: leaderboardLoading } = useLeaderboard();
  const { balance: cashBalance, isLoading: cashLoading } = useUsdcBalance();
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
  const [selectedWalletTraderId, setSelectedWalletTraderId] = useState<
    string | null
  >(null);
  const [selectedPublicTraderId, setSelectedPublicTraderId] = useState<
    string | null
  >(null);

  const openTraderProfile = useCallback((traderId: string) => {
    setSelectedTraderId(traderId);
  }, []);
  const openTraderWallet = useCallback((traderId: string) => {
    setSelectedWalletTraderId(traderId);
  }, []);

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
        openTraderProfile(traderId);
        return;
      }
      setSelectedPublicTraderId(traderId);
    },
    [openTraderProfile, ownedTraderIds]
  );

  const pnl = portfolio?.stats.total_pnl ?? 0;
  const equity = portfolio?.total_value_usdc ?? 0;
  const deskWalletFunded = cashBalance !== undefined && cashBalance > 0;
  const deskWalletFundingKnown = !cashLoading && cashBalance !== undefined;

  return (
    <div className="crt-scanlines flex min-h-svh flex-col bg-[var(--t-bg)] font-mono text-[var(--t-text)] xl:h-svh xl:overflow-hidden">
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
        deskWalletAddress={deskWalletAddress}
        nowMs={nowMs}
        cash={cashBalance}
        cashLoading={cashLoading}
        equity={equity}
        portfolioLoading={portfolioLoading}
        sfxEnabled={sfx.enabled}
        onToggleSfx={sfx.toggleEnabled}
        onLogout={logout}
      />
      <DeskCommandStrip
        cash={cashBalance}
        cashLoading={cashLoading}
        traderCount={portfolio?.traders.length ?? 0}
        portfolioLoading={portfolioLoading}
        dealCount={myDeals?.length ?? 0}
        dealsLoading={myDealsLoading}
        approvalsCount={pendingApprovals.length}
      />

      <main className="mx-auto grid w-full flex-1 gap-3 overflow-y-auto px-2 py-2 pb-4 xl:min-h-0 xl:max-w-[112rem] xl:grid-cols-[22rem_minmax(36rem,1fr)_28rem] xl:overflow-hidden">
        <NewswirePanel
          drops={drops}
          deals={marketDeals}
          dealsLoading={marketDealsLoading}
          walletFunded={deskWalletFunded}
          onOpenDeal={setSelectedDealId}
        />

        <section className="grid gap-3 xl:min-h-0 xl:grid-rows-[minmax(22rem,23rem)_minmax(0,1fr)]">
          <TradingDeskPanel
            nowMs={nowMs}
            portfolio={portfolio}
            portfolioLoading={portfolioLoading}
            onOpenProfile={openTraderProfile}
            onManageWallet={openTraderWallet}
            onHireTrader={() => {
              if (!deskWalletFunded) return;
              setHireDialogOpen(true);
            }}
            canHireTrader={deskWalletFunded}
            hireDisabledReason={
              deskWalletFundingKnown ? "Fund wallet first" : "Checking wallet"
            }
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
            onOpenDeal={setSelectedDealId}
            onReviewApproval={setApprovalCtx}
          />
        </section>

        <MarketPlayersPanel
          leaderboard={leaderboard}
          isLoading={leaderboardLoading}
          currentWallet={deskWalletAddress}
          onOpenTrader={(traderId, isCurrent) => {
            if (isCurrent) {
              openTraderProfile(traderId);
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
      <TraderWalletDialog
        traderId={selectedWalletTraderId}
        open={selectedWalletTraderId !== null}
        onOpenChange={(open) => !open && setSelectedWalletTraderId(null)}
      />
      <PublicTraderDialog
        traderId={selectedPublicTraderId}
        open={selectedPublicTraderId !== null}
        onOpenChange={(open) => !open && setSelectedPublicTraderId(null)}
      />
    </div>
  );
}

function TopStatusBar({
  deskWalletAddress,
  nowMs,
  cash,
  cashLoading,
  equity,
  portfolioLoading,
  sfxEnabled,
  onToggleSfx,
  onLogout,
}: {
  deskWalletAddress: string;
  nowMs: number;
  cash: number | undefined;
  cashLoading: boolean;
  equity: number;
  portfolioLoading: boolean;
  sfxEnabled: boolean;
  onToggleSfx: () => void;
  onLogout: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current !== null)
        window.clearTimeout(copyTimerRef.current);
    },
    []
  );
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
  const { isOpen, countdownLabel: hms } = useMarketHours();
  const shortDeskWallet = deskWalletAddress
    ? formatShortAddress(deskWalletAddress)
    : "Embedding...";
  const showFundWallet =
    !cashLoading && cash === 0 && Boolean(deskWalletAddress);

  async function copyDeskWallet() {
    if (!deskWalletAddress) return;
    try {
      await navigator.clipboard.writeText(deskWalletAddress);
    } catch {
      return;
    }
    setCopied(true);
    if (copyTimerRef.current !== null)
      window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
  }

  const copyButtonClass =
    "grid shrink-0 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40";
  const copyButtonProps = {
    type: "button" as const,
    onClick: copyDeskWallet,
    disabled: !deskWalletAddress,
    title: "Copy desk wallet address",
    "aria-label": "Copy desk wallet address",
  };
  const copyIcon = copied ? (
    <Check className="h-4 w-4" />
  ) : (
    <Copy className="h-4 w-4" />
  );

  return (
    <header className="z-40 shrink-0 bg-[#050706]/95 px-2 pt-2 shadow-[0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
      <div className="grid gap-2 xl:grid-cols-[18rem_14rem_minmax(42rem,1fr)_max-content]">
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

        <div className="terminal-panel grid grid-cols-4 divide-x divide-[var(--t-divider)] text-[11px] uppercase">
          <StatusCell label="Firm" value="Trading Desk" />
          <StatusCell
            label="Cash"
            value={
              cashLoading || cash === undefined ? "..." : formatMoney(cash)
            }
            tone="green"
          />
          <StatusCell
            label="Equity"
            value={portfolioLoading ? "..." : formatMoney(equity)}
            tone="green"
          />
          <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[var(--t-muted)]">Wallet</p>
              <p className="mt-1 truncate text-sm font-bold text-[var(--t-text)]">
                {shortDeskWallet}
              </p>
            </div>
            <button
              {...copyButtonProps}
              className={`${copyButtonClass} h-9 w-9`}
            >
              {copyIcon}
            </button>
          </div>
        </div>

        <div className="terminal-panel flex items-center justify-end gap-2 px-3 py-2">
          {showFundWallet && (
            <button
              type="button"
              onClick={() => setFundDialogOpen(true)}
              className="flex h-9 items-center gap-2 border border-[var(--t-amber)] px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--t-amber)] hover:bg-[var(--t-amber)] hover:text-[var(--t-bg)]"
            >
              <Wallet className="h-4 w-4" />
              Fund Wallet
            </button>
          )}
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
      <Dialog.Root
        open={fundDialogOpen || showFundWallet}
        onOpenChange={(open) => {
          if (showFundWallet && !open) return;
          setFundDialogOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
            <Dialog.Title className="sr-only">
              Fund Your Desk Wallet
            </Dialog.Title>
            <div className="flex items-center justify-between border-b border-[var(--t-divider)] bg-[#0b100d] px-4 py-3">
              <h2 className="font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Fund Wallet To Start
              </h2>
              {!showFundWallet && (
                <Dialog.Close
                  aria-label="Close"
                  className="grid h-7 w-7 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-red)] hover:text-[var(--t-red)]"
                >
                  <X className="h-3.5 w-3.5" />
                </Dialog.Close>
              )}
            </div>

            <div className="space-y-4 px-5 py-5 text-xs leading-relaxed text-[var(--t-text)]">
              <p className="text-[var(--t-green)]/90">
                Your desk wallet needs USDC before you can hire traders or
                create deals. Use the Circle faucet to request free test USDC
                for this wallet address. On the faucet page, be sure to select{" "}
                <span className="font-bold text-[var(--t-accent)]">
                  Base Sepolia
                </span>{" "}
                as the network.
              </p>
              {showFundWallet && (
                <div className="border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/[0.08] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--t-amber)]">
                  Funding required: this prompt will clear once wallet cash is
                  detected.
                </div>
              )}

              <div className="border border-[var(--t-divider)] bg-[#070a08] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
                  Desk Wallet
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--t-text)]">
                    {deskWalletAddress || "Wallet not ready"}
                  </p>
                  <button
                    {...copyButtonProps}
                    className={`${copyButtonClass} h-8 w-8 shrink-0`}
                  >
                    {copyIcon}
                  </button>
                </div>
              </div>

              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 items-center justify-center border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 text-xs font-bold uppercase tracking-wider text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
              >
                Open Circle Faucet
              </a>

              <p className="border-t border-[var(--t-divider)] pt-3 text-center text-[11px] text-[var(--t-muted)]">
                Questions?{" "}
                <a
                  href="https://margin-call.gitbook.io/product-docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--t-accent)] underline-offset-2 hover:underline"
                >
                  Read the docs
                </a>
                .
              </p>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}

const STEP_TONE_BADGE = {
  green: "border-[var(--t-green)]/45 text-[var(--t-green)]",
  amber: "border-[var(--t-amber)]/55 text-[var(--t-amber)]",
  muted: "border-[var(--t-divider)] text-[var(--t-muted)]",
} as const;

const STEP_TONE_STATUS = {
  green: "text-[var(--t-green)]",
  amber: "text-[var(--t-amber)]",
  muted: "text-[var(--t-text)]",
} as const;

export function DeskCommandStrip({
  cash,
  cashLoading,
  traderCount,
  portfolioLoading,
  dealCount,
  dealsLoading,
  approvalsCount,
}: {
  cash: number | undefined;
  cashLoading: boolean;
  traderCount: number;
  portfolioLoading: boolean;
  dealCount: number;
  dealsLoading: boolean;
  approvalsCount: number;
}) {
  const walletFunded = cash !== undefined && cash > 0;
  const steps = [
    {
      label: "Fund desk",
      value: cashLoading || cash === undefined ? "Checking" : formatMoney(cash),
      tone: walletFunded ? "green" : "amber",
      status: walletFunded ? "Ready" : "Required",
    },
    {
      label: "Hire trader",
      value: portfolioLoading ? "Checking" : `${traderCount}`,
      tone: traderCount > 0 ? "green" : walletFunded ? "amber" : "muted",
      status:
        traderCount > 0 ? "Roster live" : walletFunded ? "Next" : "Locked",
    },
    {
      label: "Create deal",
      value: dealsLoading ? "Checking" : `${dealCount}`,
      tone: dealCount > 0 ? "green" : traderCount > 0 ? "amber" : "muted",
      status: dealCount > 0 ? "In market" : traderCount > 0 ? "Next" : "Queued",
    },
    {
      label: "Approvals",
      value: `${approvalsCount}`,
      tone: approvalsCount > 0 ? "amber" : "green",
      status: approvalsCount > 0 ? "Needs call" : "Clear",
    },
  ] as const;

  return (
    <section className="z-30 shrink-0 border-b border-[var(--t-bronze)] bg-[#060907]/95 px-2 py-2">
      <div className="mx-auto grid max-w-[112rem] gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className="grid min-h-14 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border border-[var(--t-divider)] bg-[#070b09]/90 px-3 py-2"
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center border text-[10px] font-bold tabular-nums",
                STEP_TONE_BADGE[step.tone]
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
                {step.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 truncate text-sm font-black uppercase tracking-wide",
                  STEP_TONE_STATUS[step.tone]
                )}
              >
                {step.status}
              </p>
            </div>
            <span className="shrink-0 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
              {step.value}
            </span>
          </div>
        ))}
      </div>
    </section>
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
  deals,
  dealsLoading,
  walletFunded,
  onOpenDeal,
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
  deals: Deal[] | undefined;
  dealsLoading: boolean;
  walletFunded: boolean;
  onOpenDeal: (dealId: string) => void;
}) {
  const [dealDialog, setDealDialog] = useState<NewswireCreateDialog | null>(
    null
  );
  const [helpOpen, setHelpOpen] = useState(false);

  const activeMarketDeals = useMemo(() => {
    return (deals ?? []).filter(isActiveMarketDeal);
  }, [deals]);

  const activeDealsByHeadline = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    for (const deal of activeMarketDeals) {
      if (!deal.source_headline) continue;
      const key = normalizeHeadlineKey(deal.source_headline);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(deal);
      } else {
        grouped.set(key, [deal]);
      }
    }
    return grouped;
  }, [activeMarketDeals]);

  const items = useMemo(() => {
    if (!drops) return undefined;
    return drops
      .flatMap((drop) => {
        const time = formatNewswireTime(drop.createdAt);
        return drop.dispatches.map((dispatch) => ({
          time,
          headline: dispatch.headline,
          impact: dispatch.body,
          category: dispatch.category,
          body: dispatch.body,
          dealSeed: dispatch.dealSeed,
          deals:
            activeDealsByHeadline.get(
              normalizeHeadlineKey(dispatch.headline)
            ) ?? [],
        }));
      })
      .slice(0, 10);
  }, [activeDealsByHeadline, drops]);

  const marketStats = useMemo(() => {
    return activeMarketDeals.reduce(
      (acc, deal) => ({
        count: acc.count + 1,
        pot: acc.pot + deal.pot_usdc,
        entries: acc.entries + deal.entry_count,
      }),
      { count: 0, pot: 0, entries: 0 }
    );
  }, [activeMarketDeals]);

  return (
    <aside className="terminal-panel flex min-h-[24rem] flex-col overflow-hidden xl:min-h-0">
      <PanelHeader
        title="The Wire"
        meta={
          items === undefined || dealsLoading
            ? "WAIT"
            : `${marketStats.count} OPEN`
        }
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
        <NewswireMarketTape stats={marketStats} isLoading={dealsLoading} />
        <NewswireList
          items={items}
          dealsLoading={dealsLoading}
          walletFunded={walletFunded}
          onCreate={setDealDialog}
          onOpenDeal={onOpenDeal}
        />
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
          <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
          <Dialog.Popup className={dialogPopupClass("lg")}>
            <HowDealsWorkBrief onClose={() => setHelpOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}

export function HowDealsWorkBrief({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Dialog.Title className="sr-only">How deals work</Dialog.Title>
      <div className="flex items-center justify-between border-b border-[var(--t-divider)] bg-[#0b100d] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
            Desk brief
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
            How Deals Work
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 shrink-0 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-red)] hover:text-[var(--t-red)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-4 py-4 text-xs leading-relaxed text-[var(--t-text)] sm:max-h-[calc(88vh-9rem)]">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "01",
              "Pick a wire",
              "Each news item can become a live desk opportunity.",
            ],
            [
              "02",
              "Size the room",
              "Set the pot and entry cost before rivals arrive.",
            ],
            [
              "03",
              "Let agents trade",
              "GPT resolves each agent against the scenario.",
            ],
          ].map(([step, title, body]) => (
            <section
              key={step}
              className="border border-[var(--t-divider)] bg-[#070b09] p-3"
            >
              <p className="text-[10px] text-[var(--t-muted)]">{step}</p>
              <h3 className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
                {title}
              </h3>
              <p className="mt-2 text-[var(--t-green)]/90">{body}</p>
            </section>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
          <section className="border border-[var(--t-divider)] bg-[#070b09] p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
              Deal economics
            </h3>
            <dl className="mt-3 grid gap-2">
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                <dt className="text-[var(--t-muted)]">Pot</dt>
                <dd className="text-[var(--t-green)]">
                  Prize pool winners draw from.
                </dd>
              </div>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                <dt className="text-[var(--t-muted)]">Entry</dt>
                <dd className="text-[var(--t-amber)]">
                  USDC rival traders pay to enter.
                </dd>
              </div>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                <dt className="text-[var(--t-muted)]">Creator rake</dt>
                <dd className="text-[var(--t-text)]">
                  Your desk keeps a share of each entry fee.
                </dd>
              </div>
            </dl>
          </section>

          <section className="border border-[var(--t-divider)] bg-[#070b09] p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
              Sizing tactics
            </h3>
            <ul className="mt-3 space-y-2 text-[var(--t-green)]/90">
              <li>
                <span className="text-[var(--t-amber)]">▸</span> Big pot plus
                high entry attracts aggressive agents.
              </li>
              <li>
                <span className="text-[var(--t-amber)]">▸</span> Low entry
                invites more volume and more rake attempts.
              </li>
              <li>
                <span className="text-[var(--t-amber)]">▸</span> Your own
                traders cannot enter deals your desk creates.
              </li>
            </ul>
          </section>
        </div>

        <p className="mt-4 border border-[var(--t-amber)]/40 bg-[var(--t-amber)]/[0.07] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[var(--t-amber)]">
          Rule of thumb: price entry low for flow, high for conviction.
        </p>
      </div>

      <div className="border-t border-[var(--t-divider)] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 w-full border border-[var(--t-divider)] py-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
        >
          Got it — Back to the wire
        </button>
      </div>
    </>
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
  deals: Deal[];
};

function NewswireMarketTape({
  stats,
  isLoading,
}: {
  stats: { count: number; pot: number; entries: number };
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mb-3 border border-[var(--t-divider)] bg-[#070b09] px-3 py-2">
        <LoadingLine label="SCANNING ACTIVE DEALS" />
      </div>
    );
  }

  return (
    <div className="mb-3 grid grid-cols-3 gap-1 border border-[var(--t-divider)] bg-[#070b09] px-2 py-2 text-center text-[10px] uppercase tracking-wider">
      <div className="min-w-0 border-r border-[var(--t-divider)] px-1">
        <p className="truncate text-[var(--t-muted)]">Open</p>
        <p className="mt-1 tabular-nums text-[var(--t-accent)]">
          {stats.count}
        </p>
      </div>
      <div className="min-w-0 border-r border-[var(--t-divider)] px-1">
        <p className="truncate text-[var(--t-muted)]">Pots</p>
        <p className="mt-1 tabular-nums text-[var(--t-green)]">
          {formatCompactMoney(stats.pot)}
        </p>
      </div>
      <div className="min-w-0 px-1">
        <p className="truncate text-[var(--t-muted)]">Entries</p>
        <p className="mt-1 tabular-nums text-[var(--t-text)]">
          {stats.entries}
        </p>
      </div>
    </div>
  );
}

function NewswireList({
  items,
  dealsLoading,
  walletFunded,
  onCreate,
  onOpenDeal,
}: {
  items: NewswirePostItem[] | undefined;
  dealsLoading: boolean;
  walletFunded: boolean;
  onCreate: (item: NewswireCreateDialog) => void;
  onOpenDeal: (dealId: string) => void;
}) {
  if (items === undefined) {
    return <LoadingLine label="TUNING PRIVATE WIRE" />;
  }
  if (items.length === 0) {
    const today = formatNewswireDay(new Date());
    return (
      <div className="space-y-3">
        {FALLBACK_WIRE_ITEMS.map((item, index) => (
          <NewswireItem
            key={item.time + item.headline}
            time={`${today} ${item.time}`}
            headline={item.headline}
            body={item.impact}
            category={item.category}
            isFirst={index === 0}
            deals={[]}
            dealsLoading={dealsLoading}
            walletFunded={walletFunded}
            onOpenDeal={onOpenDeal}
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
          deals={item.deals}
          dealsLoading={dealsLoading}
          walletFunded={walletFunded}
          onOpenDeal={onOpenDeal}
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
  deals,
  dealsLoading,
  walletFunded,
  onOpenDeal,
  onCreate,
}: {
  time: string;
  headline: string;
  body: string;
  category?: string;
  dealSeed?: NewswireDealSeed;
  isFirst?: boolean;
  deals: Deal[];
  dealsLoading: boolean;
  walletFunded: boolean;
  onOpenDeal: (dealId: string) => void;
  onCreate: () => void;
}) {
  const rail =
    category && category in CATEGORY_RAIL
      ? CATEGORY_RAIL[category as WireCategory]
      : DEFAULT_CATEGORY_RAIL;
  const isSeed = Boolean(dealSeed);
  const dealCount = deals.length;
  const hasDeals = dealCount > 0;

  return (
    <article
      className={cn(
        "group relative -mx-2 border-b border-[var(--t-divider)]/45 pb-3 pl-3 pr-2 text-xs leading-relaxed transition-colors last:border-b-0 last:pb-0",
        hasDeals
          ? "bg-[var(--t-accent-soft)]/20"
          : "hover:bg-[var(--t-accent-soft)]/25"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full w-[2px]",
          rail,
          hasDeals || isSeed ? "opacity-90" : "opacity-60"
        )}
      />
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
        {isFirst && (
          <span
            aria-label="latest"
            className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-[var(--t-green)]"
          />
        )}
        <time className="tabular-nums text-[var(--t-muted)]">{time}</time>
        <span className="text-[var(--t-divider)]">/</span>
        <span
          className={cn(
            "tabular-nums",
            hasDeals ? "text-[var(--t-green)]" : "text-[var(--t-muted)]"
          )}
        >
          {dealStatusLabel(dealCount, dealsLoading)}
        </span>
      </div>
      <h3 className="line-clamp-3 break-words font-medium text-[var(--t-amber)]">
        {headline}
      </h3>
      <p className="mt-1 text-[var(--t-green)]/90">{body}</p>

      {dealsLoading && (
        <div className="mt-2 border border-[var(--t-divider)] bg-[#070b09] px-2 py-2">
          <LoadingLine label="MATCHING DEALS" />
        </div>
      )}

      {!dealsLoading && hasDeals && (
        <>
          <div className="mt-2 grid gap-1.5">
            {deals.slice(0, 3).map((deal) => (
              <NewswireDealCard
                key={deal.id}
                deal={deal}
                onOpenDeal={onOpenDeal}
              />
            ))}
            {deals.length > 3 && (
              <p className="px-2 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                +{deals.length - 3} more active{" "}
                {deals.length - 3 === 1 ? "deal" : "deals"} from this wire
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onCreate}
              disabled={!walletFunded}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus aria-hidden className="h-3 w-3" />
              {walletFunded ? "Create another deal" : "Fund wallet first"}
            </button>
            {isSeed && dealSeed && dealSeed.linkedDealCount > 0 && (
              <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                Seed linked {dealSeed.linkedDealCount} ·{" "}
                {formatCompactMoney(dealSeed.linkedPotTotalUsdc)}
              </span>
            )}
          </div>
        </>
      )}

      {!dealsLoading && !hasDeals && (
        <div className="mt-2.5 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            No deals yet
          </p>
          <button
            type="button"
            onClick={onCreate}
            disabled={!walletFunded}
            className="group/cta grid w-full min-h-9 grid-cols-[auto_1fr_auto] items-center gap-2 border border-[var(--t-divider)] bg-[#070b09] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--t-accent)]/85 transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]/30 hover:text-[var(--t-accent)] focus:border-[var(--t-accent)] focus:bg-[var(--t-accent-soft)]/30 focus:text-[var(--t-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--t-divider)] disabled:hover:bg-[#070b09] disabled:hover:text-[var(--t-accent)]/85"
          >
            {walletFunded ? (
              <Plus aria-hidden className="h-3 w-3 text-[var(--t-accent)]" />
            ) : (
              <span aria-hidden className="h-3 w-3" />
            )}
            <span className="text-left">
              {walletFunded ? "Create deal" : "Fund wallet first"}
            </span>
            <ArrowRight
              aria-hidden
              className="wire-cta-bounce h-3 w-3 text-[var(--t-accent)]/80 transition-opacity group-hover/cta:text-[var(--t-accent)] group-focus/cta:text-[var(--t-accent)]"
            />
          </button>
        </div>
      )}
    </article>
  );
}

function NewswireDealCard({
  deal,
  onOpenDeal,
}: {
  deal: Deal;
  onOpenDeal: (dealId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenDeal(deal.id)}
      className="group/deal grid grid-cols-[minmax(0,1fr)_4.75rem] gap-2 border border-[var(--t-divider)] bg-[#070b09] px-2 py-2 text-left transition-colors hover:border-[var(--t-accent)] focus:border-[var(--t-accent)] focus:outline-none"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider">
          <span
            className={
              isActiveMarketDeal(deal)
                ? "text-[var(--t-green)]"
                : "text-[var(--t-amber)]"
            }
          >
            {deal.status.toUpperCase()}
          </span>
          <span className="text-[var(--t-divider)]">/</span>
          <span className="text-[var(--t-muted)]">
            {dealCreatorLabel(deal)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 break-words text-[var(--t-text)] group-hover/deal:text-[var(--t-accent)]">
          {deal.prompt}
        </p>
      </div>
      <dl className="grid content-start gap-1 text-right text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
        <div className="min-w-0">
          <dt className="sr-only">Pot</dt>
          <dd className="truncate">
            Pot{" "}
            <span className="tabular-nums text-[var(--t-green)]">
              {formatCompactMoney(deal.pot_usdc)}
            </span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">Entry cost</dt>
          <dd className="truncate">
            In{" "}
            <span className="tabular-nums text-[var(--t-text)]">
              {formatCompactMoney(deal.entry_cost_usdc)}
            </span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">Entries</dt>
          <dd className="truncate">
            Hits{" "}
            <span className="tabular-nums text-[var(--t-amber)]">
              {deal.entry_count}
            </span>
          </dd>
        </div>
      </dl>
    </button>
  );
}

function dealStatusLabel(dealCount: number, isLoading: boolean): string {
  if (isLoading) return "MATCHING";
  if (dealCount === 0) return "NO DEAL";
  if (dealCount === 1) return "1 OPEN DEAL";
  return `${dealCount} OPEN DEALS`;
}

function dealCreatorLabel(deal: Deal): string {
  if (deal.creator_type === "agent") return "Agent source";
  if (deal.creator_address) return formatShortAddress(deal.creator_address);
  return "Desk source";
}

function isActiveMarketDeal(deal: Deal): boolean {
  const status = deal.status.toLowerCase();
  return status === "open" || status === "active";
}

function normalizeHeadlineKey(headline: string): string {
  return headline.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatNewswireDay(date: Date): string {
  return date
    .toLocaleDateString("en-US", {
      weekday: "short",
      ...NY_TIME,
    })
    .toUpperCase();
}

function formatNewswireTime(createdAt: string): string {
  const date = new Date(createdAt);
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...NY_TIME,
  });
  return `${formatNewswireDay(date)} ${time}`;
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
  onOpenProfile,
  onManageWallet,
  onHireTrader,
  canHireTrader,
  hireDisabledReason,
  deals,
  dealsLoading,
  onOpenDeal,
}: {
  nowMs: number;
  portfolio: Portfolio | undefined;
  portfolioLoading: boolean;
  onOpenProfile: (id: string) => void;
  onManageWallet: (id: string) => void;
  onHireTrader: () => void;
  canHireTrader: boolean;
  hireDisabledReason: string;
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
    <section className="terminal-panel flex min-h-[24rem] flex-col overflow-hidden xl:min-h-0">
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
              disabled={!canHireTrader}
              className="border border-[var(--t-divider)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canHireTrader ? "Hire Trader" : hireDisabledReason}
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
        onOpenProfile={onOpenProfile}
        onManageWallet={onManageWallet}
        onOpenDeal={onOpenDeal}
        onHireTrader={onHireTrader}
        canHireTrader={canHireTrader}
        hireDisabledReason={hireDisabledReason}
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
  onOpenProfile,
  onManageWallet,
  onOpenDeal,
  onHireTrader,
  canHireTrader,
  hireDisabledReason,
}: {
  showingDeals: boolean;
  traders: TraderSummary[];
  portfolioLoading: boolean;
  deskDeals: Deal[];
  dealsLoading: boolean;
  nowMs: number;
  onOpenProfile: (id: string) => void;
  onManageWallet: (id: string) => void;
  onOpenDeal: (dealId: string) => void;
  onHireTrader: () => void;
  canHireTrader: boolean;
  hireDisabledReason: string;
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
      <EmptyState
        title="No traders on your desk"
        description="Hire one floor operator, set their mandate, then fund escrow so they can start reading the wire."
        action={
          <button
            type="button"
            onClick={onHireTrader}
            disabled={!canHireTrader}
            className="inline-flex min-h-11 items-center border border-[var(--t-accent)] px-5 py-2 text-xs font-black uppercase tracking-wider text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canHireTrader ? "Hire Trader" : hireDisabledReason}
          </button>
        }
      />
    );
  }
  return (
    <DeskTradersView
      traders={traders}
      onOpenProfile={onOpenProfile}
      onManageWallet={onManageWallet}
      nowMs={nowMs}
    />
  );
}

const DESK_ROW_GRID =
  "grid-cols-[2rem_2.25rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[2rem_2.25rem_minmax(0,1fr)_5rem_5.5rem_5rem_4.5rem_5rem_3.5rem]";

function DeskTradersView({
  traders,
  onOpenProfile,
  onManageWallet,
  nowMs,
}: {
  traders: TraderSummary[];
  onOpenProfile: (id: string) => void;
  onManageWallet: (id: string) => void;
  nowMs: number;
}) {
  const ranked = useMemo(
    () => [...traders].sort((a, b) => b.total_pnl - a.total_pnl),
    [traders]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
      <div
        className={cn(
          "sticky top-0 z-10 grid items-center gap-2 border-b border-[var(--t-divider)] bg-[#070b09] px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]",
          DESK_ROW_GRID
        )}
      >
        <span>#</span>
        <span />
        <span>Trader</span>
        <span className="hidden sm:inline">Status</span>
        <span className="hidden text-right sm:inline">Equity</span>
        <span className="hidden text-right sm:inline">P&amp;L%</span>
        <span className="hidden text-right sm:inline">W-L-X</span>
        <span className="hidden text-right sm:inline">Last</span>
        <span />
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {ranked.map((trader, index) => (
          <DeskTraderRow
            key={trader.id}
            rank={index + 1}
            trader={trader}
            nowMs={nowMs}
            onOpenProfile={onOpenProfile}
            onManageWallet={onManageWallet}
          />
        ))}
      </div>
    </div>
  );
}

function DeskTraderRow({
  rank,
  trader,
  nowMs,
  onOpenProfile,
  onManageWallet,
}: {
  rank: number;
  trader: TraderSummary;
  nowMs: number;
  onOpenProfile: (id: string) => void;
  onManageWallet: (id: string) => void;
}) {
  const statusTone = statusToneClass(trader.status);
  const pnlPct = pnlPercent(trader.total_pnl, trader.total_value_usdc);
  const pnlText = pnlPct === null ? "—" : formatSignedPercent(pnlPct);
  const pnlClass =
    pnlPct === null ? "text-[var(--t-muted)]" : pnlSignClass(pnlPct);

  return (
    <div
      className={cn(
        "grid items-center gap-2 border border-[var(--t-divider)] bg-[#070b09] px-2 py-1.5 text-left text-xs",
        DESK_ROW_GRID
      )}
    >
      <span className="tabular-nums text-[var(--t-muted)]">{rank}</span>
      <TraderAvatar
        name={trader.name}
        src={trader.profile_image_url}
        imageStatus={trader.image_status}
        size="sm"
      />
      <span className="truncate font-bold uppercase tracking-wider text-[var(--t-amber)]">
        {trader.name}
      </span>
      <span
        className={cn(
          "hidden uppercase tracking-wider text-[11px] sm:inline",
          statusTone
        )}
      >
        {trader.status}
      </span>
      <span className="hidden tabular-nums text-right text-[var(--t-text)] sm:inline">
        {formatCompactMoney(trader.total_value_usdc)}
      </span>
      <span
        className={cn("hidden tabular-nums text-right sm:inline", pnlClass)}
      >
        {pnlText}
      </span>
      <span className="hidden tabular-nums text-right text-[var(--t-text)] sm:inline">
        {trader.wins}-{trader.losses}-{trader.wipeouts}
      </span>
      <span className="hidden text-right text-[10px] uppercase tracking-wider text-[var(--t-muted)] sm:inline">
        {relativeTime(trader.last_cycle_at, nowMs)}
      </span>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onManageWallet(trader.id)}
          title="Manage wallet"
          aria-label={`Manage wallet for ${trader.name}`}
          className={DESK_ROW_ICON_BTN}
        >
          <Wallet className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onOpenProfile(trader.id)}
          title="View profile"
          aria-label={`View ${trader.name} profile`}
          className={DESK_ROW_ICON_BTN}
        >
          <User className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const DESK_ROW_ICON_BTN =
  "grid h-6 w-6 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none";

function statusToneClass(status: string): string {
  if (status === "active") return TONE_CLASS.green;
  if (status === "paused") return TONE_CLASS.amber;
  return TONE_CLASS.red;
}

function pnlPercent(pnl: number, totalValue: number): number | null {
  if (totalValue === 0 && pnl < 0) return -100;
  const basis = totalValue - pnl;
  if (basis <= 0) return null;
  return (pnl / basis) * 100;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
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
      <EmptyState
        title="No deals created by your desk"
        description="Open the newswire and turn a live item into a funded trap for rival traders."
      />
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
  onOpenDeal,
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
  onOpenDeal: (dealId: string) => void;
  onReviewApproval: (ctx: { traderId: string; dealId: string | null }) => void;
}) {
  let feedMeta = "ALL DESKS";
  if (traderFilter) {
    const name = traderNames[traderFilter];
    if (name) feedMeta = name;
  }

  return (
    <section className="terminal-panel flex min-h-[26rem] flex-col overflow-hidden xl:min-h-0">
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
        <EmptyState
          title="No trader activity yet"
          description="Fund escrow and activate a trader. Their scans, skips, approvals, wins, and losses will print here."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activity.map((entry) => (
            <FeedLine
              key={entry.id}
              entry={entry}
              traderName={traderNames[entry.trader_id] ?? "???"}
              traderProfile={traderProfiles[entry.trader_id]}
              showTrader={traderFilter === null}
              onOpenDeal={onOpenDeal}
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
    <aside className="terminal-panel flex min-h-[24rem] flex-col overflow-hidden xl:min-h-0">
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
        <EmptyState
          title="No traders on the floor yet"
          description="Once desks activate traders, market rank and public profiles appear here."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {leaderboard.map((trader, index) => {
            const isCurrent = current
              ? trader.owner_address.toLowerCase() === current
              : false;

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
