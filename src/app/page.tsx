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
  Check,
  Copy,
  Github,
  HelpCircle,
  LogOut,
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
import { useMarketHours } from "@/hooks/use-market-hours";
import { useSecondTick } from "@/hooks/use-second-tick";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { cn, formatShortAddress, relativeTime } from "@/lib/utils";
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
          {">"} ENTER BY EMAIL<span className="cursor-blink">█</span>
        </button>
        <p className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
          Email OTP access // embedded Base wallet assigned
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

      <main className="mx-auto grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] gap-2 overflow-hidden px-2 py-2 xl:w-full xl:max-w-[112rem] xl:grid-cols-[22rem_minmax(36rem,1fr)_28rem] xl:grid-rows-1">
        <NewswirePanel drops={drops} walletFunded={deskWalletFunded} />

        <section className="grid min-h-0 grid-rows-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] gap-2 xl:grid-rows-[minmax(22rem,23rem)_minmax(0,1fr)]">
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
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
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
  walletFunded,
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
  walletFunded: boolean;
}) {
  const [dealDialog, setDealDialog] = useState<NewswireCreateDialog | null>(
    null
  );
  const [helpOpen, setHelpOpen] = useState(false);

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
        <NewswireList
          items={items}
          walletFunded={walletFunded}
          onCreate={setDealDialog}
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
  walletFunded,
  onCreate,
}: {
  items: NewswirePostItem[] | undefined;
  walletFunded: boolean;
  onCreate: (item: NewswireCreateDialog) => void;
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
            walletFunded={walletFunded}
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
          walletFunded={walletFunded}
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
  walletFunded,
  onCreate,
}: {
  time: string;
  headline: string;
  body: string;
  category?: string;
  dealSeed?: NewswireDealSeed;
  isFirst?: boolean;
  walletFunded: boolean;
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
      role={walletFunded ? "button" : undefined}
      tabIndex={walletFunded ? 0 : undefined}
      aria-disabled={!walletFunded}
      onClick={() => {
        if (!walletFunded) return;
        onCreate();
      }}
      onKeyDown={(event) => {
        if (!walletFunded) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCreate();
        }
      }}
      className={cn(
        "group relative -mx-2 border-b border-[var(--t-divider)]/45 pb-3 pl-3 pr-2 text-xs leading-relaxed transition-colors last:border-b-0 last:pb-0",
        walletFunded
          ? "cursor-money hover:bg-[var(--t-accent-soft)]/40 focus:bg-[var(--t-accent-soft)]/40 focus:outline-none"
          : "cursor-not-allowed opacity-60"
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
          <span>
            {walletFunded ? "→ Take seed" : "Fund wallet first"} · {potLabel}{" "}
            pot
          </span>
          {dealSeed && dealSeed.linkedDealCount > 0 && (
            <span className="text-[var(--t-muted)]">
              ({dealSeed.linkedDealCount} taken)
            </span>
          )}
        </span>
      ) : (
        <span className="wire-cta-bounce mt-2 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--t-accent)]/70 transition-colors group-hover:text-[var(--t-accent)]">
          {walletFunded ? "→ Create deal" : "Fund wallet first"}
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
      <div className="px-4 py-10 text-center">
        <p className="text-sm uppercase tracking-wider text-[var(--t-muted)]">
          No traders on your desk
        </p>
        <button
          type="button"
          onClick={onHireTrader}
          disabled={!canHireTrader}
          className="mt-4 inline-block border border-[var(--t-accent)] px-5 py-2 text-xs uppercase tracking-wider text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canHireTrader ? "Hire Trader" : hireDisabledReason}
        </button>
      </div>
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
  "grid-cols-[2rem_2.25rem_minmax(0,1fr)_5rem_5.5rem_5rem_4.5rem_5rem_3.5rem]";

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
        <span>Status</span>
        <span className="text-right">Equity</span>
        <span className="text-right">P&amp;L%</span>
        <span className="text-right">W-L-X</span>
        <span className="text-right">Last</span>
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
      <span className={cn("uppercase tracking-wider text-[11px]", statusTone)}>
        {trader.status}
      </span>
      <span className="tabular-nums text-right text-[var(--t-text)]">
        {formatCompactMoney(trader.total_value_usdc)}
      </span>
      <span className={cn("tabular-nums text-right", pnlClass)}>{pnlText}</span>
      <span className="tabular-nums text-right text-[var(--t-text)]">
        {trader.wins}-{trader.losses}-{trader.wipeouts}
      </span>
      <span className="text-right text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
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
