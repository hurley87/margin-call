"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation } from "convex/react";
import { formatUnits } from "viem";
import { useReadContract } from "wagmi";

import { api } from "../../convex/_generated/api";
import { NarrativeRenderer } from "@/components/narrative-renderer";
import { shortAssetLabel } from "@/lib/format-asset-label";
import {
  CONTRACTS_CHAIN_ID,
  DEAL_STATUS_CLOSED,
  ESCROW_ADDRESS,
  escrowAbi,
} from "@/lib/contracts/escrow";
import { makePublicClient } from "@/lib/contracts/client";
import {
  closeDealButtonLabel,
  closeDealErrorMessage,
  isCloseDealBusy,
  type CloseDealPhase,
} from "@/lib/deal-close-state";
import { useDeal, type DealOutcome } from "@/hooks/use-deals";
import { useDeskManager } from "@/hooks/use-desk";
import { useSponsoredContractWrite } from "@/hooks/use-sponsored-contract-write";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";
import { DIALOG_BACKDROP_CLASS, cn, dialogPopupClass } from "@/lib/utils";

function formatOutcomeResult(outcome: DealOutcome) {
  const traderName = outcome.trader_name ?? "Trader";
  const formattedAmount = `$${Math.abs(outcome.trader_pnl_usdc).toFixed(2)}`;

  if (outcome.trader_wiped_out || outcome.trader_pnl_usdc < 0) {
    return `${traderName} lost ${formattedAmount}`;
  }

  if (outcome.trader_pnl_usdc > 0) {
    return `${traderName} made ${formattedAmount}`;
  }

  return `${traderName} broke even`;
}

function DealMetricCell({
  label,
  value,
  className = "text-[var(--t-text)]",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0 border-b border-r border-[var(--t-border)] px-3 py-2.5 even:border-r-0 last:border-r-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-bold ${className}`}>{value}</p>
    </div>
  );
}

export function DealMetricGrid({
  displayPotLabel,
  entryCostUsdc,
  feeUsdc,
  entryCount,
  wipeoutCount,
}: {
  displayPotLabel: string;
  entryCostUsdc: number;
  feeUsdc?: number;
  entryCount: number;
  wipeoutCount: number;
}) {
  const hasDealFee = feeUsdc !== undefined && feeUsdc > 0;

  return (
    <div
      className={cn(
        "grid grid-cols-2 border-t border-[var(--t-border)] text-xs",
        hasDealFee ? "sm:grid-cols-5" : "sm:grid-cols-4"
      )}
    >
      <DealMetricCell
        label="Pot"
        value={`$${displayPotLabel}`}
        className="text-[var(--t-green)]"
      />
      <DealMetricCell
        label="Entry"
        value={`$${entryCostUsdc}`}
        className="text-[var(--t-accent)]"
      />
      {hasDealFee && <DealMetricCell label="Fee" value={`$${feeUsdc}`} />}
      <DealMetricCell label="Entries" value={entryCount} />
      <DealMetricCell
        label="Wipeouts"
        value={wipeoutCount}
        className={
          wipeoutCount > 0 ? "text-[var(--t-red)]" : "text-[var(--t-text)]"
        }
      />
    </div>
  );
}

function DealLoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center bg-[var(--t-bg)] font-mono ${
        compact ? "min-h-72" : "min-h-screen"
      }`}
    >
      <p className="text-[var(--t-muted)]">
        LOADING...<span className="cursor-blink">█</span>
      </p>
    </div>
  );
}

function DealErrorState({
  message,
  compact = false,
  onClose,
}: {
  message: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={`crt-scanlines flex flex-col items-center justify-center gap-4 bg-[var(--t-bg)] font-mono ${
        compact ? "min-h-72" : "min-h-screen"
      }`}
    >
      <p className="text-sm text-[var(--t-red)]">ERR: {message}</p>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 px-2 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none"
        >
          [CLOSE]
        </button>
      ) : (
        <Link
          href="/"
          className="text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
        >
          {"<"} BACK TO DESK
        </Link>
      )}
    </div>
  );
}

export function DealDetailContent({
  dealId,
  compact = false,
  onClose,
}: {
  dealId: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const { data, isLoading, error } = useDeal(dealId);
  const { user } = usePrivy();
  const { data: deskManager } = useDeskManager();
  const convexDeal = data?.deal;
  const onChainDealId = convexDeal?.on_chain_deal_id;
  const { data: onChainDeal } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getDeal",
    args: onChainDealId !== undefined ? [BigInt(onChainDealId)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: onChainDealId !== undefined,
    },
  });
  const walletAddress = getEmbeddedEvmWalletAddress(user) ?? undefined;

  if (isLoading) {
    return <DealLoadingState compact={compact} />;
  }

  if (error || !data) {
    return (
      <DealErrorState
        compact={compact}
        message={error?.message ?? "DEAL NOT FOUND"}
        onClose={onClose}
      />
    );
  }

  const { deal, outcomes } = data;
  const wipeoutCount = Math.max(
    deal.wipeout_count,
    outcomes.filter((outcome) => outcome.trader_wiped_out).length
  );
  const legacyPotDelta = outcomes
    .filter((outcome) => outcome.pot_change_inferred)
    .reduce((sum, outcome) => sum + outcome.pot_change_usdc, 0);
  const displayPotUsdc =
    onChainDeal !== undefined
      ? Number(formatUnits(onChainDeal.potAmount, 6))
      : deal.pot_usdc + legacyPotDelta;
  const displayPotLabel = displayPotUsdc.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  const isDealOwner =
    deal.creator_id !== undefined &&
    deskManager?.id === deal.creator_id &&
    walletAddress !== undefined &&
    (deal.creator_address === undefined ||
      deal.creator_address.toLowerCase() === walletAddress.toLowerCase());

  return (
    <>
      <div
        className={`sticky z-20 border-b border-[var(--t-border)] bg-[var(--t-surface)] ${
          compact ? "top-0" : "top-[37px]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
              View deal
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-[family-name:var(--font-plex-sans)] text-lg font-black uppercase tracking-wide text-[var(--t-amber)]">
                Deal dossier
              </h2>
              {deal.on_chain_deal_id !== undefined && (
                <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
                  #{deal.on_chain_deal_id}
                </span>
              )}
              <span
                className={`text-[10px] font-bold uppercase ${
                  deal.status === "open"
                    ? "text-[var(--t-green)]"
                    : "text-[var(--t-muted)]"
                }`}
              >
                [{deal.status}]
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 border border-[var(--t-divider)] px-3 text-xs uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-red)] hover:text-[var(--t-red)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
              >
                [CLOSE]
              </button>
            ) : (
              <Link
                href="/"
                className="grid min-h-10 place-items-center border border-[var(--t-divider)] px-3 text-xs uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                {"<"} DESK
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-3 py-4 sm:px-4">
        <div className="border border-[var(--t-border)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              SCENARIO
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
              {new Date(deal.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="px-3 py-3">
            <p className="text-xs leading-relaxed text-[var(--t-text)]">
              {deal.prompt}
            </p>
          </div>

          <DealMetricGrid
            displayPotLabel={displayPotLabel}
            entryCostUsdc={deal.entry_cost_usdc}
            feeUsdc={deal.fee_usdc}
            entryCount={deal.entry_count}
            wipeoutCount={wipeoutCount}
          />

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--t-border)] px-3 py-2">
            {deal.on_chain_tx_hash && (
              <a
                href={`https://sepolia.basescan.org/tx/${deal.on_chain_tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
              >
                Creation TX
              </a>
            )}
          </div>

          {deal.on_chain_deal_id !== undefined &&
            isDealOwner &&
            walletAddress && (
              <DealOwnerStatusFooter
                status={deal.status}
                onChainDealId={deal.on_chain_deal_id}
              />
            )}
        </div>

        <div className="border border-[var(--t-border)]">
          <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            OUTCOMES ({outcomes.length})
          </div>

          {outcomes.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--t-muted)]">
              NO OUTCOMES YET — waiting for traders to enter
            </div>
          ) : (
            <div className="flex flex-col">
              {outcomes.map((outcome, idx) => (
                <div
                  key={outcome.id}
                  className={`border-b border-[var(--t-border)] px-3 py-3 last:border-b-0 ${
                    outcome.trader_wiped_out
                      ? "bg-[#D48787]/5"
                      : "bg-[var(--t-bg)]"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[10px] text-[var(--t-muted)]">
                        #{idx + 1}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          outcome.trader_pnl_usdc >= 0
                            ? "text-[var(--t-green)]"
                            : "text-[var(--t-red)]"
                        }`}
                      >
                        {formatOutcomeResult(outcome)}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {outcome.trader_wiped_out && (
                        <span className="text-[10px] font-bold text-[var(--t-red)]">
                          [WIPED OUT
                          {outcome.wipeout_reason
                            ? ` — ${outcome.wipeout_reason.replace("_", " ")}`
                            : ""}
                          ]
                        </span>
                      )}
                      {outcome.rake_usdc > 0 && (
                        <span className="text-[10px] text-[var(--t-muted)]">
                          RAKE ${outcome.rake_usdc}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 text-xs leading-relaxed text-[var(--t-text)]">
                    <NarrativeRenderer narrative={outcome.narrative} />
                  </div>

                  {(outcome.assets_gained.length > 0 ||
                    outcome.assets_lost.length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
                      {outcome.assets_gained.length > 0 && (
                        <span className="text-[var(--t-green)]">
                          +{" "}
                          {outcome.assets_gained
                            .map(
                              (a) =>
                                `${shortAssetLabel(a.name)} ($${a.value_usdc})`
                            )
                            .join(", ")}
                        </span>
                      )}
                      {outcome.assets_lost.length > 0 && (
                        <span className="text-[var(--t-red)]">
                          -{" "}
                          {outcome.assets_lost
                            .map((n) => shortAssetLabel(n))
                            .join(", ")}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--t-muted)]">
                    <span>{new Date(outcome.created_at).toLocaleString()}</span>
                    {outcome.on_chain_tx_hash && (
                      <a
                        href={`https://sepolia.basescan.org/tx/${outcome.on_chain_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
                      >
                        Settlement TX
                      </a>
                    )}
                    {outcome.pot_change_usdc !== 0 && (
                      <span>
                        Pot {outcome.pot_change_usdc > 0 ? "+" : "-"}$
                        {Math.abs(outcome.pot_change_usdc).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function DealDetailDialog({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={dialogPopupClass("xl")}>
          <Dialog.Title className="sr-only">Deal detail</Dialog.Title>
          <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[88vh]">
            {dealId ? (
              <DealDetailContent
                dealId={dealId}
                compact
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <DealErrorState
                compact
                message="DEAL NOT FOUND"
                onClose={() => onOpenChange(false)}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DealOwnerStatusFooter({
  status,
  onChainDealId,
}: {
  status: string;
  onChainDealId: number;
}) {
  if (status === "open") {
    return <CloseDealButton onChainDealId={onChainDealId} />;
  }
  if (status === "closed") {
    return (
      <div className="border border-green-500/30 bg-green-500/10 px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-green-400">
        DEAL CLOSED — pot withdrawn
      </div>
    );
  }
  return null;
}

function CloseDealButton({ onChainDealId }: { onChainDealId: number }) {
  const [phase, setPhase] = useState<CloseDealPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const writeSponsoredContract = useSponsoredContractWrite();
  const {
    data: onChainDeal,
    isLoading: isLoadingOnChainDeal,
    error: onChainDealError,
  } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [BigInt(onChainDealId)],
    chainId: CONTRACTS_CHAIN_ID,
  });
  const setStatusByOnChainId = useMutation(api.deals.setStatusByOnChainId);
  const pendingEntries = onChainDeal?.pendingEntries;
  const isOnChainClosed = onChainDeal?.status === DEAL_STATUS_CLOSED;
  const hasConfirmedClose = txHash !== undefined;
  const isBusy = isCloseDealBusy(phase);
  const isPendingEntriesUnknown =
    isLoadingOnChainDeal ||
    onChainDealError !== null ||
    pendingEntries === undefined;
  const hasPendingEntries =
    pendingEntries !== undefined && pendingEntries > BigInt(0);

  const syncClosedDeal = useCallback(async () => {
    setPhase("syncing");
    setError(null);

    try {
      await setStatusByOnChainId({ onChainDealId, status: "closed" });
      setPhase("done");
    } catch (err) {
      console.error("setStatusByOnChainId failed:", err);
      setPhase("error");
      setError(closeDealErrorMessage(err));
    }
  }, [onChainDealId, setStatusByOnChainId]);

  useEffect(() => {
    if (!isOnChainClosed || phase !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncClosedDeal();
  }, [isOnChainClosed, phase, syncClosedDeal]);

  async function handleClose() {
    if (isBusy || hasPendingEntries || isPendingEntriesUnknown) return;

    if (isOnChainClosed || hasConfirmedClose) {
      await syncClosedDeal();
      return;
    }

    setPhase("wallet");
    setError(null);

    try {
      const hash = await writeSponsoredContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "closeDeal",
        args: [BigInt(onChainDealId)],
        chainId: CONTRACTS_CHAIN_ID,
      });

      setPhase("confirming");

      const publicClient = makePublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("Close deal transaction reverted");
      }

      setTxHash(hash);
      await syncClosedDeal();
    } catch (err) {
      console.error("closeDeal failed:", err);
      setPhase("error");
      setError(closeDealErrorMessage(err));
    }
  }

  if (phase === "done") {
    return (
      <div className="border-t border-[var(--t-green)]/40 bg-[var(--t-green)]/5 px-3 py-2">
        <p className="text-[10px] text-[var(--t-green)]">
          DEAL CLOSED SUCCESSFULLY
        </p>
        {txHash && (
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
          >
            View TX
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--t-border)] px-3 py-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-[var(--t-muted)]">
          Withdraw remaining pot
          {pendingEntries !== undefined
            ? ` (${pendingEntries.toString()} pending ${pendingEntries === BigInt(1) ? "entry" : "entries"})`
            : " (checking pending entries...)"}
        </p>
        <button
          onClick={handleClose}
          disabled={
            isBusy ||
            (!isOnChainClosed &&
              !hasConfirmedClose &&
              (isPendingEntriesUnknown || hasPendingEntries))
          }
          className="min-h-10 border border-[var(--t-border)] px-3 py-1 text-[10px] text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] focus:border-[var(--t-red)] focus:outline-none disabled:opacity-50"
        >
          {closeDealButtonLabel(phase, isOnChainClosed || hasConfirmedClose)}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[10px] text-[var(--t-red)]">
          {error.slice(0, 150)}
        </p>
      )}
    </div>
  );
}
