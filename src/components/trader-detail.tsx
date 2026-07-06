"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { useTrader, type Trader, type TraderStatus } from "@/hooks/use-traders";
import { TraderAvatar } from "@/components/trader-avatar";
import { DatumCell } from "@/components/datum-cell";
import { PersonaTraits, RarityBadge } from "@/components/persona-traits";
import { formatStatus } from "@/lib/format-status";
import {
  useSepoliaUsdcBalance,
  useTraderEscrowBalance,
} from "@/hooks/use-escrow";
import {
  useTraderOutcomes,
  useTraderAssets,
  usePauseTrader,
  useResumeTrader,
  useReviveTrader,
  useSyncTraderBalance,
  type DealOutcomeWithNarrative,
} from "@/hooks/use-agent";
import { NarrativeRenderer } from "@/components/narrative-renderer";
import {
  useConfigureMandate,
  usePendingApprovals,
} from "@/hooks/use-approvals";
import { TraderActivityPanel } from "@/components/trader-activity-panel";
import { PendingApprovalCard } from "@/components/pending-approval-card";
import { WalletDialog } from "@/components/wire/wallet-dialog";
import { MarketClosedButton } from "@/components/market-closed-button";
import { shortAssetLabel } from "@/lib/format-asset-label";
import { useMarketHours } from "@/hooks/use-market-hours";
import { useSecondTick } from "@/hooks/use-second-tick";
import {
  getTraderCycleUi,
  traderCycleDocFromDetailTrader,
} from "@/lib/trader-cycle";
import {
  DIALOG_BACKDROP_CLASS,
  cn,
  dialogPopupClass,
  formatSignedMoney,
  formatUsdc,
} from "@/lib/utils";
import { AnimatedNumber } from "@/components/animated-number";
import { ActivateTradingLabel } from "@/components/activate-trading-label";

const TRADER_SECTION_TITLE_CLASS =
  "text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]";

function traderViewportMinClass(compact: boolean) {
  return compact ? "min-h-[24rem]" : "min-h-screen";
}

function CollapsibleSection({
  title,
  children,
  action,
  defaultOpen = false,
  canCollapse = true,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  canCollapse?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden border border-[var(--t-divider)] bg-[#070b09]">
      <div
        className={cn(
          "flex items-center gap-3 p-3",
          isOpen && "border-b border-[var(--t-divider)]"
        )}
      >
        {canCollapse ? (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
          >
            <h2 className={TRADER_SECTION_TITLE_CLASS}>{title}</h2>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
              {isOpen ? "Hide" : "Show"}
            </span>
          </button>
        ) : (
          <div className="flex-1">
            <h2 className={TRADER_SECTION_TITLE_CLASS}>{title}</h2>
          </div>
        )}
        {action}
      </div>
      {isOpen && <div className="p-4">{children}</div>}
    </section>
  );
}

export function TraderDeskSummaryStrip({
  status,
  balanceUsdc,
  unfunded,
  onOpenWallet,
}: {
  status: TraderStatus;
  balanceUsdc: number | null;
  unfunded: boolean;
  onOpenWallet: () => void;
}) {
  return (
    <div className="grid border border-[var(--t-divider)] bg-[#070b09] sm:grid-cols-3">
      <DatumCell
        label="Desk order"
        value={status === "active" ? "Autonomous" : "Standing by"}
        className="border-0 border-b border-[var(--t-divider)] sm:border-b-0 sm:border-r"
        valueClassName={
          status === "active"
            ? "text-[var(--t-green)]"
            : "text-[var(--t-amber)]"
        }
      />
      <button
        type="button"
        onClick={onOpenWallet}
        className="text-left transition-colors hover:bg-[var(--t-surface)] focus:bg-[var(--t-surface)] focus:outline-none"
      >
        <DatumCell
          label="Cash at risk"
          value={
            balanceUsdc !== null ? (
              <AnimatedNumber value={balanceUsdc} format={formatUsdc} live />
            ) : (
              "..."
            )
          }
          className="border-0 border-b border-[var(--t-divider)] sm:border-b-0 sm:border-r"
          valueClassName={unfunded ? "text-[var(--t-amber)]" : undefined}
        />
      </button>
      <DatumCell
        label="Next move"
        value={unfunded ? "Fund first" : "Mandate driven"}
        className="border-0"
        valueClassName={
          unfunded ? "text-[var(--t-amber)]" : "text-[var(--t-text)]"
        }
      />
    </div>
  );
}

export function TraderDetailContent({
  id,
  compact = false,
  onClose,
}: {
  id: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const { data: trader, isLoading, error } = useTrader(id);

  const {
    balanceUsdc,
    unfunded,
    refetch: refetchBalance,
  } = useTraderEscrowBalance(trader?.token_id);

  const { balance: walletUsdc } = useSepoliaUsdcBalance();
  const [walletOpen, setWalletOpen] = useState(false);
  const hasAutoOpened = useRef(false);
  const isNewTrader = !!trader && trader.status === "paused" && unfunded;

  // One-shot auto-open once async data lands; ref guard preserves user-close.
  useEffect(() => {
    if (compact) return;
    if (hasAutoOpened.current) return;
    if (!isNewTrader) return;
    if (walletUsdc === undefined || walletUsdc > 0) return;
    hasAutoOpened.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWalletOpen(true);
  }, [compact, isNewTrader, walletUsdc]);

  useEffect(() => {
    hasAutoOpened.current = false;
  }, [id]);

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-[var(--t-bg)]",
          traderViewportMinClass(compact)
        )}
      >
        <p className="text-[var(--t-muted)]">Loading...</p>
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 bg-[var(--t-bg)]",
          traderViewportMinClass(compact)
        )}
      >
        <p className="text-[var(--t-red)]">
          {error?.message ?? "Trader not found"}
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--t-muted)] hover:text-[var(--t-text)]"
          >
            Close
          </button>
        ) : (
          <Link
            href="/"
            className="text-sm text-[var(--t-muted)] hover:text-[var(--t-text)]"
          >
            Back to desk
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("bg-[var(--t-bg)] font-mono", !compact && "min-h-screen")}
    >
      <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
            View trader
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="truncate font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-wide text-[var(--t-amber)]">
              {trader.name}
            </h2>
            <StatusBadge status={trader.status} />
            <span className="min-w-0">
              <TraderCycleLine trader={trader} />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center text-xs">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 border border-[var(--t-divider)] px-3 uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-red)] hover:text-[var(--t-red)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
            >
              [CLOSE]
            </button>
          ) : (
            <Link
              href="/"
              className="grid min-h-10 place-items-center border border-[var(--t-divider)] px-3 uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
            >
              &larr; DESK
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-5">
        <section className="min-w-0">
          <div className="overflow-hidden border border-[var(--t-divider)] bg-[#070b09]">
            <div className="relative aspect-square">
              <TraderAvatar
                name={trader.name}
                src={trader.profile_image_url}
                imageStatus={trader.image_status}
                size="lg"
                className="absolute inset-0"
              />
            </div>
            <div className="grid grid-cols-2 border-t border-[var(--t-divider)]">
              <DatumCell label="Status" value={formatStatus(trader.status)} />
              <DatumCell label="Token" value={`#${trader.token_id}`} />
            </div>
            <button
              onClick={() => setWalletOpen(true)}
              className="w-full border-t border-[var(--t-divider)] text-left transition-colors hover:bg-[var(--t-surface)]"
            >
              <DatumCell
                label="Escrow"
                value={
                  balanceUsdc !== null ? (
                    <AnimatedNumber
                      value={balanceUsdc}
                      format={formatUsdc}
                      live
                    />
                  ) : (
                    "..."
                  )
                }
                valueClassName={unfunded ? "text-[var(--t-amber)]" : undefined}
              />
            </button>
          </div>

          {trader.traits ? (
            <div className="mt-4 overflow-hidden border border-[var(--t-divider)] bg-[#070b09]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[var(--t-surface)]/70 px-3 py-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--t-amber)]">
                  Persona traits
                </h3>
                <RarityBadge
                  rarity={trader.rarity}
                  className="px-1.5 py-0.5 text-[9px] tracking-[0.16em]"
                />
              </div>
              <PersonaTraits
                traits={trader.traits}
                className="sm:grid-cols-1"
              />
            </div>
          ) : null}
        </section>

        <section className="grid min-w-0 content-start gap-4">
          <TraderDeskSummaryStrip
            status={trader.status}
            balanceUsdc={balanceUsdc}
            unfunded={unfunded}
            onOpenWallet={() => setWalletOpen(true)}
          />
          <AgentControls
            traderId={id}
            status={trader.status}
            unfunded={unfunded}
            convexEscrowUsdc={trader.escrow_balance_usdc}
            walletReady={trader.wallet_status === "ready"}
            onOpenWallet={() => setWalletOpen(true)}
          />
          <TraderPendingApprovals traderId={id} />
          <ReputationSection traderId={id} />
          <MandateConfig
            traderId={id}
            mandate={trader.mandate}
            personality={trader.personality ?? null}
          />
          <AssetInventory traderId={id} />
          <DealOutcomes traderId={id} />
          <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
            <TraderActivityPanel key={id} traderId={id} />
          </div>
        </section>
      </div>

      {walletOpen && (
        <WalletDialog
          open
          onOpenChange={setWalletOpen}
          convexTraderId={trader.id}
          traderId={trader.token_id}
          walletUsdc={walletUsdc}
          escrowUsdc={balanceUsdc}
          walletAddress={trader.cdp_wallet_address}
          ownerAddress={trader.owner_address}
          walletStatus={trader.wallet_status}
          walletError={trader.wallet_error}
          isNewTrader={isNewTrader}
          onSuccess={refetchBalance}
        />
      )}
    </div>
  );
}

export function TraderDetailDialog({
  traderId,
  open,
  onOpenChange,
}: {
  traderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={dialogPopupClass("xl")}>
          <Dialog.Title className="sr-only">Trader detail</Dialog.Title>
          <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[88vh]">
            {traderId ? (
              <TraderDetailContent
                id={traderId}
                compact
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 bg-[var(--t-bg)]">
                <p className="text-[var(--t-red)]">Trader not found</p>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-sm text-[var(--t-muted)] hover:text-[var(--t-text)]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TraderWalletDialog({
  traderId,
  open,
  onOpenChange,
}: {
  traderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!traderId) return null;
  return (
    <TraderWalletDialogInner
      traderId={traderId}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function TraderWalletDialogInner({
  traderId,
  open,
  onOpenChange,
}: {
  traderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: trader } = useTrader(traderId);
  const { balanceUsdc, unfunded, refetch } = useTraderEscrowBalance(
    trader?.token_id
  );
  const { balance: walletUsdc } = useSepoliaUsdcBalance();

  if (!trader) return null;

  const isNewTrader = trader.status === "paused" && unfunded;

  return (
    <WalletDialog
      open={open}
      onOpenChange={onOpenChange}
      convexTraderId={trader.id}
      traderId={trader.token_id}
      walletUsdc={walletUsdc}
      escrowUsdc={balanceUsdc}
      walletAddress={trader.cdp_wallet_address}
      ownerAddress={trader.owner_address}
      walletStatus={trader.wallet_status}
      walletError={trader.wallet_error}
      isNewTrader={isNewTrader}
      onSuccess={refetch}
    />
  );
}

function TraderCycleLine({ trader }: { trader: Trader }) {
  const nowMs = useSecondTick();
  const ui = getTraderCycleUi(traderCycleDocFromDetailTrader(trader), nowMs);
  return (
    <span
      title={ui.text}
      className={`truncate text-[10px] font-bold uppercase leading-none tracking-wide ${ui.className}`}
    >
      {ui.text}
    </span>
  );
}

function TraderPendingApprovals({ traderId }: { traderId: string }) {
  const { data: approvals } = usePendingApprovals();
  const pending = (approvals ?? []).filter((a) => a.trader_id === traderId);
  if (pending.length === 0) return null;

  return (
    <div className="mt-4 border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/[0.07] px-4 py-3">
      <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--t-amber)]">
        Pending deal approval{pending.length > 1 ? "s" : ""}
      </h2>
      <p className="mt-1 text-[11px] text-[var(--t-muted)]">
        Approve or deny so this trader can enter the deal, or use{" "}
        <span className="text-[var(--t-text)]">Review</span> on the activity
        lines below.
      </p>
      <div className="mt-3 flex flex-col gap-[1px] bg-[var(--t-border)]">
        {pending.map((a) => (
          <PendingApprovalCard key={a.id} approval={a} />
        ))}
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<
  string,
  { className: string; label: string } | undefined
> = {
  active: {
    className: "text-[var(--t-green)]",
    label: "[ACTIVE]",
  },
  paused: {
    className: "text-[var(--t-amber)]",
    label: "[PAUSED]",
  },
  wiped_out: {
    className: "text-[var(--t-red)]",
    label: "[WIPED]",
  },
};

function StatusBadge({ status }: { status: string }) {
  const preset = STATUS_BADGE[status];
  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase leading-none",
        preset?.className ?? "text-[var(--t-muted)]"
      )}
    >
      {preset?.label ?? `[${status.toUpperCase()}]`}
    </span>
  );
}

function AgentControls({
  traderId,
  status,
  unfunded,
  convexEscrowUsdc,
  walletReady,
  onOpenWallet,
}: {
  traderId: string;
  status: string;
  unfunded: boolean;
  convexEscrowUsdc: number;
  walletReady: boolean;
  onOpenWallet: () => void;
}) {
  const pause = usePauseTrader();
  const resume = useResumeTrader();
  const revive = useReviveTrader();
  const pauseResumeError =
    pause.error?.message ?? resume.error?.message ?? null;
  const { isOpen: marketOpen, countdownLabel: marketCountdown } =
    useMarketHours();

  const convexFunded = convexEscrowUsdc > 0;
  const isSyncingDeposit = !unfunded && !convexFunded && walletReady;
  useSyncTraderBalance(traderId, isSyncingDeposit);
  const canActivate =
    !unfunded && convexFunded && walletReady && !resume.isPending;

  if (status === "wiped_out") {
    return (
      <div className="mt-4 border border-[var(--t-red)]/20 bg-[var(--t-red)]/5 px-4 py-3">
        <p className="text-sm text-[var(--t-red)]">
          This trader has been wiped out and can no longer trade.
        </p>
        <button
          onClick={() => revive.mutate(traderId)}
          disabled={revive.isPending}
          className="mt-3 border border-[var(--t-border)] px-4 py-2 text-sm text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] disabled:opacity-50"
        >
          {revive.isPending ? "Reviving..." : "Revive Trader"}
        </button>
        {revive.isError && (
          <p className="mt-2 text-xs text-[var(--t-red)]">
            {revive.error?.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "active" ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-[var(--t-green)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--t-green)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--t-green)]" />
            </span>
            Trading autonomously
          </span>
          <button
            onClick={() => pause.mutate(traderId)}
            disabled={pause.isPending}
            className="ml-auto min-h-10 border border-[var(--t-border)] px-3 py-1.5 text-xs text-[var(--t-amber)] transition-colors hover:border-[var(--t-amber)] disabled:opacity-50"
          >
            {pause.isPending ? "PAUSING..." : "PAUSE"}
          </button>
        </>
      ) : (
        <>
          <MarketClosedButton
            // Only surface the market-closed state once wallet is ready / funded;
            // unfunded keeps the existing disabled "ACTIVATE TRADING" label.
            isClosed={
              !marketOpen &&
              !unfunded &&
              convexFunded &&
              walletReady &&
              !resume.isPending &&
              !isSyncingDeposit
            }
            countdownLabel={marketCountdown}
            enabledChildren={
              <ActivateTradingLabel
                isActivating={resume.isPending}
                isSyncingDeposit={isSyncingDeposit}
              />
            }
            onClick={() => resume.mutate(traderId)}
            disabled={resume.isPending || !canActivate || isSyncingDeposit}
            className="min-h-10 border border-[var(--t-accent)] px-4 py-1.5 text-xs font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          />
          {isSyncingDeposit ? (
            <span className="text-xs text-[var(--t-amber)]">
              Confirming your deposit on-chain — this takes a few seconds…
            </span>
          ) : unfunded ? (
            <button
              onClick={onOpenWallet}
              className="min-h-10 px-2 text-xs text-[var(--t-amber)] transition-colors hover:text-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
            >
              Deposit USDC to enable &rarr;
            </button>
          ) : (
            <span className="text-xs text-[var(--t-muted)]">
              Ready to trade
            </span>
          )}
        </>
      )}

      {pauseResumeError && (
        <p className="ml-auto text-xs text-[var(--t-red)]">
          {pauseResumeError}
        </p>
      )}
    </div>
  );
}

function AssetInventory({ traderId }: { traderId: string }) {
  const { data: assets, isLoading } = useTraderAssets(traderId);

  return (
    <CollapsibleSection title="Asset Inventory">
      {isLoading ? (
        <p className="text-sm text-[var(--t-muted)]">Loading...</p>
      ) : !assets || assets.length === 0 ? (
        <p className="text-sm text-[var(--t-muted)]">No assets acquired yet.</p>
      ) : (
        <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between bg-[var(--t-bg)] px-3 py-2"
            >
              <span className="text-sm text-[var(--t-text)]">
                {shortAssetLabel(asset.name)}
              </span>
              <span className="text-sm text-[var(--t-green)]">
                ${Number(asset.value_usdc).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function DealOutcomes({ traderId }: { traderId: string }) {
  const { data: outcomes, isLoading } = useTraderOutcomes(traderId);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <CollapsibleSection title="Deal Outcomes">
      {isLoading ? (
        <p className="text-sm text-[var(--t-muted)]">Loading...</p>
      ) : !outcomes || outcomes.length === 0 ? (
        <p className="text-sm text-[var(--t-muted)]">No deals entered yet.</p>
      ) : (
        <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
          {outcomes.map((outcome) => (
            <OutcomeCard
              key={outcome.id}
              outcome={outcome}
              isExpanded={expanded === outcome.id}
              onToggle={() =>
                setExpanded(expanded === outcome.id ? null : outcome.id)
              }
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function outcomeDealBadgeLabel(isWipeout: boolean, isWin: boolean) {
  if (isWipeout) return "WIPEOUT";
  if (isWin) return "WIN";
  return "LOSS";
}

function OutcomeCard({
  outcome,
  isExpanded,
  onToggle,
}: {
  outcome: DealOutcomeWithNarrative;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const pnl = Number(outcome.trader_pnl_usdc);
  const isWin = pnl > 0;
  const isWipeout = outcome.trader_wiped_out;
  const pnlColor = isWin ? "text-[var(--t-green)]" : "text-[var(--t-red)]";
  const headlineLabel = outcomeDealBadgeLabel(isWipeout, isWin);

  return (
    <div
      className={cn(
        "bg-[var(--t-bg)]",
        isWipeout && "border-l-2 border-l-[var(--t-red)]",
        !isWipeout && isWin && "border-l-2 border-l-[var(--t-green)]"
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--t-surface)]"
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${pnlColor}`}>
            {headlineLabel}
          </span>
          <span className={`text-sm ${pnlColor}`}>
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(2)} USDC
          </span>
          {isWipeout && outcome.wipeout_reason && (
            <span className="text-[10px] text-[var(--t-red)]">
              ({outcome.wipeout_reason.replace("_", " ")})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--t-muted)]">
            {new Date(outcome.created_at).toLocaleString()}
          </span>
          <span className="text-xs text-[var(--t-muted)]">
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {isExpanded && outcome.narrative && (
        <div className="border-t border-[var(--t-border)] px-4 py-3">
          <div className="text-sm leading-relaxed text-[var(--t-text)]">
            <NarrativeRenderer narrative={outcome.narrative} />
          </div>
          {outcome.assets_gained && outcome.assets_gained.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {outcome.assets_gained.map(
                (asset: { name: string; value_usdc: number }, i: number) => (
                  <span
                    key={i}
                    className="border border-[var(--t-green)]/30 px-2 py-1 text-xs text-[var(--t-green)]"
                  >
                    +{shortAssetLabel(asset.name)} (${asset.value_usdc})
                  </span>
                )
              )}
            </div>
          )}
          {outcome.assets_lost && outcome.assets_lost.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {outcome.assets_lost.map((name: string, i: number) => (
                <span
                  key={i}
                  className="border border-[var(--t-red)]/30 px-2 py-1 text-xs text-[var(--t-red)]"
                >
                  -{shortAssetLabel(name)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-4 border-t border-[var(--t-border)] pt-3 text-xs text-[var(--t-muted)]">
            <span>Rake: ${Number(outcome.rake_usdc).toFixed(2)}</span>
            <span>
              Pot change: ${Number(outcome.pot_change_usdc).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function mandateFormDefaults(
  mandate: Record<string, unknown>,
  personality: string | null
) {
  return {
    max_entry_cost_usdc:
      mandate.max_entry_cost_usdc != null
        ? String(mandate.max_entry_cost_usdc)
        : "",
    min_pot_usdc:
      mandate.min_pot_usdc != null ? String(mandate.min_pot_usdc) : "",
    max_pot_usdc:
      mandate.max_pot_usdc != null ? String(mandate.max_pot_usdc) : "",
    bankroll_pct:
      mandate.bankroll_pct != null ? String(mandate.bankroll_pct) : "25",
    approval_threshold_usdc:
      mandate.approval_threshold_usdc != null
        ? String(mandate.approval_threshold_usdc)
        : "",
    keywords: ((mandate.keywords as string[]) ?? []).join(", "),
    personality: personality ?? "",
    llm_deal_selection: mandate.llm_deal_selection !== false,
  };
}

function MandateConfig({
  traderId,
  mandate,
  personality,
}: {
  traderId: string;
  mandate: Record<string, unknown>;
  personality: string | null;
}) {
  const configure = useConfigureMandate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() =>
    mandateFormDefaults(mandate, personality)
  );

  function handleSave() {
    const cleaned: Record<string, unknown> = {};
    if (form.max_entry_cost_usdc !== "")
      cleaned.max_entry_cost_usdc = Number(form.max_entry_cost_usdc);
    if (form.min_pot_usdc !== "")
      cleaned.min_pot_usdc = Number(form.min_pot_usdc);
    if (form.max_pot_usdc !== "")
      cleaned.max_pot_usdc = Number(form.max_pot_usdc);
    if (form.bankroll_pct !== "")
      cleaned.bankroll_pct = Number(form.bankroll_pct);
    if (form.approval_threshold_usdc !== "")
      cleaned.approval_threshold_usdc = Number(form.approval_threshold_usdc);
    if (form.keywords.trim())
      cleaned.keywords = form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

    cleaned.llm_deal_selection = form.llm_deal_selection;

    configure.mutate(
      {
        traderId,
        mandate: cleaned,
        personality:
          form.personality.trim() === "" ? null : form.personality.trim(),
      },
      {
        onSuccess: () => setEditing(false),
      }
    );
  }

  function openEdit() {
    setForm(mandateFormDefaults(mandate, personality));
    setEditing(true);
  }

  if (!editing) {
    return (
      <CollapsibleSection key="mandate-view" title="Mandate">
        {(personality?.trim() || mandate.llm_deal_selection === false) && (
          <div className="mb-4 space-y-2 text-sm">
            {personality?.trim() && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Personality</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Injected into AI deal selection
                </p>
                <p className="whitespace-pre-wrap text-[var(--t-text)]">
                  {personality}
                </p>
              </div>
            )}
            {mandate.llm_deal_selection === false && (
              <p className="text-xs text-[var(--t-amber)]">
                LLM deal selection is off — using pot/entry ratio only.
              </p>
            )}
          </div>
        )}
        {Object.keys(mandate).length === 0 ? (
          <p className="text-sm text-[var(--t-muted)]">
            No mandate configured yet. Configure risk tolerance and deal filters
            to control how this trader enters deals.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {mandate.max_entry_cost_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Max Entry Cost</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Maximum USDC to pay for a single deal
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.max_entry_cost_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.min_pot_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Min Pot</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Only enter deals with at least this pot
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.min_pot_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.max_pot_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Max Pot</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Skip deals where the pot exceeds this
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.max_pot_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.bankroll_pct !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Bankroll %</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  % of escrow balance to risk per deal
                </p>
                <p className="text-[var(--t-text)]">
                  {String(mandate.bankroll_pct)}%
                </p>
              </div>
            )}
            {mandate.approval_threshold_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">
                  Approval Threshold
                </p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Deals above this cost need your approval
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.approval_threshold_usdc)} USDC
                </p>
              </div>
            )}
            {Array.isArray(mandate.keywords) &&
              (mandate.keywords as string[]).length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-[var(--t-muted)]">Keywords</p>
                  <p className="text-[10px] text-[var(--t-muted)]/60">
                    Only enter deals matching these keywords
                  </p>
                  <p className="text-[var(--t-text)]">
                    {(mandate.keywords as string[]).join(", ")}
                  </p>
                </div>
              )}
          </div>
        )}
        <div className="mt-4 flex justify-end border-t border-[var(--t-border)]/60 pt-4">
          <button
            type="button"
            onClick={openEdit}
            className="min-h-10 border border-[var(--t-border)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)] focus:border-[var(--t-accent)] focus:text-[var(--t-text)] focus:outline-none"
          >
            Configure mandate
          </button>
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
      key="mandate-edit"
      title="Configure Mandate"
      defaultOpen
      canCollapse={false}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Max Entry Cost (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Maximum USDC your trader will pay to enter a single deal
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.max_entry_cost_usdc}
            onChange={(e) =>
              setForm({ ...form, max_entry_cost_usdc: e.target.value })
            }
            placeholder="No limit"
            className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Min Pot (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Only enter deals where the pot is at least this amount
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.min_pot_usdc}
            onChange={(e) => setForm({ ...form, min_pot_usdc: e.target.value })}
            placeholder="No limit"
            className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Max Pot (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Skip deals where the pot exceeds this amount
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.max_pot_usdc}
            onChange={(e) => setForm({ ...form, max_pot_usdc: e.target.value })}
            placeholder="No limit"
            className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Bankroll % (1-100)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Percentage of escrow balance to risk per deal
          </p>
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            value={form.bankroll_pct}
            onChange={(e) => setForm({ ...form, bankroll_pct: e.target.value })}
            placeholder="25"
            className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Approval Threshold (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Deals above this cost require your manual approval
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.approval_threshold_usdc}
            onChange={(e) =>
              setForm({ ...form, approval_threshold_usdc: e.target.value })
            }
            placeholder="No approval required"
            className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Keywords (comma-separated)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Only enter deals matching these keywords (leave empty for all)
          </p>
          <input
            type="text"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            placeholder="e.g. oil, gold, tech"
            className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 flex items-center gap-2 text-xs text-[var(--t-muted)]">
            <input
              type="checkbox"
              checked={form.llm_deal_selection}
              onChange={(e) =>
                setForm({ ...form, llm_deal_selection: e.target.checked })
              }
              className="min-h-5 min-w-5 border-[var(--t-border)] accent-[var(--t-accent)]"
            />
            Use GPT for deal selection (vs. pot/entry ratio only)
          </label>
          <p className="mt-1 text-[10px] text-[var(--t-muted)]/60">
            When enabled, the model ranks eligible deals using prompts, creator
            history, and outcome stats. Requires OPENAI_API_KEY on the server.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Personality / strategy (optional)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Short instructions for how this trader judges deals (risk posture,
            skepticism of trap deals, etc.). Max 2000 characters.
          </p>
          <textarea
            value={form.personality}
            onChange={(e) => setForm({ ...form, personality: e.target.value })}
            rows={4}
            maxLength={2000}
            placeholder="e.g. Cautious: avoid large pots from unknown creators…"
            className="min-h-28 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={configure.isPending}
          className="min-h-11 border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] focus:bg-[var(--t-accent)] focus:text-[var(--t-bg)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {configure.isPending ? "Saving..." : "Save Mandate"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="min-h-10 px-2 text-sm uppercase tracking-[0.14em] text-[var(--t-muted)] hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none"
        >
          Cancel
        </button>
      </div>
      {configure.isError && (
        <p className="mt-2 text-xs text-[var(--t-red)]">
          {configure.error?.message}
        </p>
      )}
    </CollapsibleSection>
  );
}

function ReputationSection({ traderId }: { traderId: string }) {
  const { data: outcomes, isLoading } = useTraderOutcomes(traderId);

  if (isLoading || !outcomes) return null;

  const wins = outcomes.filter((o) => Number(o.trader_pnl_usdc) > 0).length;
  const losses = outcomes.filter((o) => Number(o.trader_pnl_usdc) < 0).length;
  const wipeouts = outcomes.filter((o) => o.trader_wiped_out).length;
  const totalPnl = outcomes.reduce(
    (acc, o) => acc + Number(o.trader_pnl_usdc),
    0
  );
  const totalDeals = outcomes.length;
  const winRate = totalDeals > 0 ? ((wins / totalDeals) * 100).toFixed(0) : "0";

  const reputationScore = Math.max(0, wins * 3 - losses - wipeouts * 5);

  if (totalDeals === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <DatumCell label="Score" value={String(reputationScore)} />
      <DatumCell
        label="Wins"
        value={String(wins)}
        valueClassName="text-[var(--t-green)]"
      />
      <DatumCell
        label="Losses"
        value={String(losses)}
        valueClassName="text-[var(--t-red)]"
      />
      <DatumCell label="Win Rate" value={`${winRate}%`} />
      <DatumCell
        label="Wipeouts"
        value={String(wipeouts)}
        valueClassName={wipeouts > 0 ? "text-[var(--t-red)]" : undefined}
      />
      <DatumCell
        label="Total P&L"
        value={
          <AnimatedNumber value={totalPnl} format={formatSignedMoney} live />
        }
        valueClassName={
          totalPnl >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]"
        }
      />
    </div>
  );
}
