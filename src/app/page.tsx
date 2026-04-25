"use client";

import { useState } from "react";

import { usePrivy } from "@privy-io/react-auth";

import { useDeskManager } from "@/hooks/use-desk";
import { useDashboardRealtime } from "@/hooks/use-realtime";

import { DealApprovalDialog } from "@/components/deal-approval-dialog";
import { TopStatusBar } from "@/components/dashboard/top-status-bar";
import { NewswirePanel } from "@/components/dashboard/newswire-panel";
import { TraderDesk } from "@/components/dashboard/trader-desk";
import { TraderFeedPanel } from "@/components/dashboard/trader-feed-panel";
import { MarketPlayersPanel } from "@/components/dashboard/market-players-panel";
import { BottomTicker } from "@/components/dashboard/bottom-ticker";

export default function Home() {
  const { ready, authenticated, login, logout, user } = usePrivy();
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
            The 1980s Wall Street Trading Game
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
    <Dashboard
      displayName={deskManager.display_name}
      ownerAddress={user?.wallet?.address ?? null}
    />
  );
}

function Dashboard({
  displayName,
  ownerAddress,
}: {
  displayName: string;
  ownerAddress: string | null;
}) {
  useDashboardRealtime();

  const [approvalCtx, setApprovalCtx] = useState<{
    traderId: string;
    dealId: string | null;
  } | null>(null);

  return (
    <div className="crt-scanlines flex min-h-screen flex-col bg-[var(--t-bg)] font-mono lg:h-dvh lg:min-h-0">
      <TopStatusBar displayName={displayName} />

      <main className="flex flex-1 flex-col gap-2 p-2 lg:grid lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(280px,360px)] lg:overflow-hidden">
        <div className="min-h-0 lg:h-full">
          <NewswirePanel />
        </div>

        <div className="flex min-h-0 flex-col gap-2 lg:h-full">
          <TraderDesk />
          <TraderFeedPanel onReviewApproval={setApprovalCtx} />
        </div>

        <div className="min-h-0 lg:h-full">
          <MarketPlayersPanel ownerAddress={ownerAddress} />
        </div>
      </main>

      <BottomTicker />

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
