"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation } from "convex/react";
import { formatUnits } from "viem";
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { api } from "../../convex/_generated/api";
import { NarrativeRenderer } from "@/components/narrative-renderer";
import { shortAssetLabel } from "@/lib/format-asset-label";
import {
  CONTRACTS_CHAIN_ID,
  ESCROW_ADDRESS,
  escrowAbi,
} from "@/lib/contracts/escrow";
import { useDeal, type DealOutcome } from "@/hooks/use-deals";
import { useDeskManager } from "@/hooks/use-desk";

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
          className="text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
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
  const linkedWalletAddress = user?.linkedAccounts?.find(
    (account) => account.type === "wallet" && "address" in account
  ) as { address?: unknown } | undefined;
  const walletAddress =
    user?.wallet?.address ??
    (typeof linkedWalletAddress?.address === "string"
      ? linkedWalletAddress.address
      : undefined);

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
        className={`sticky z-20 border-b border-[var(--t-border)] bg-[var(--t-bg)] ${
          compact ? "top-0" : "top-[37px]"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-3">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="text-xs uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
              >
                [CLOSE]
              </button>
            ) : (
              <Link
                href="/"
                className="text-xs uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
              >
                {"<"} DESK
              </Link>
            )}
            <span className="text-[10px] text-[var(--t-border)]">/</span>
            {deal.on_chain_deal_id !== undefined && (
              <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
                #{deal.on_chain_deal_id}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-bold ${
              deal.status === "open"
                ? "text-[var(--t-green)]"
                : "text-[var(--t-muted)]"
            }`}
          >
            [{deal.status.toUpperCase()}]
          </span>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="border border-[var(--t-border)]">
          <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            SCENARIO
          </div>
          <div className="px-3 py-3">
            <p className="text-xs leading-relaxed text-[var(--t-text)]">
              {deal.prompt}
            </p>
          </div>

          <div className="flex items-center gap-0 border-t border-[var(--t-border)] text-xs">
            <div className="flex-1 border-r border-[var(--t-border)] px-3 py-2.5">
              <p className="text-[10px] text-[var(--t-muted)]">POT</p>
              <p className="text-[var(--t-green)]">${displayPotLabel}</p>
            </div>
            <div className="flex-1 border-r border-[var(--t-border)] px-3 py-2.5">
              <p className="text-[10px] text-[var(--t-muted)]">ENTRY</p>
              <p className="text-[var(--t-accent)]">${deal.entry_cost_usdc}</p>
            </div>
            {deal.fee_usdc !== undefined && deal.fee_usdc > 0 && (
              <div className="flex-1 border-r border-[var(--t-border)] px-3 py-2.5">
                <p className="text-[10px] text-[var(--t-muted)]">FEE</p>
                <p className="text-[var(--t-text)]">${deal.fee_usdc}</p>
              </div>
            )}
            <div className="flex-1 border-r border-[var(--t-border)] px-3 py-2.5">
              <p className="text-[10px] text-[var(--t-muted)]">ENTRIES</p>
              <p className="text-[var(--t-text)]">{deal.entry_count}</p>
            </div>
            <div className="flex-1 px-3 py-2.5">
              <p className="text-[10px] text-[var(--t-muted)]">WIPEOUTS</p>
              <p
                className={
                  wipeoutCount > 0
                    ? "text-[var(--t-red)]"
                    : "text-[var(--t-text)]"
                }
              >
                {wipeoutCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-[var(--t-border)] px-3 py-2">
            <span className="text-[10px] text-[var(--t-muted)]">
              {new Date(deal.created_at).toLocaleDateString()}
            </span>
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

        <div className="mt-4 border border-[var(--t-border)]">
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-2">
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
                    <div className="mt-2 flex items-center gap-3 text-[10px]">
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

                  <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--t-muted)]">
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
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[94vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          <Dialog.Title className="sr-only">Deal detail</Dialog.Title>
          <div className="max-h-[88vh] overflow-y-auto">
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

function closeDealButtonLabel(isPending: boolean, isConfirming: boolean) {
  if (isPending) return "CONFIRM IN WALLET...";
  if (isConfirming) return "CLOSING...";
  return "CLOSE DEAL";
}

function CloseDealButton({ onChainDealId }: { onChainDealId: number }) {
  const syncedRef = useRef(false);
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
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
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const setStatusByOnChainId = useMutation(api.deals.setStatusByOnChainId);
  const pendingEntries = onChainDeal?.pendingEntries;
  const isPendingEntriesUnknown =
    isLoadingOnChainDeal ||
    onChainDealError !== null ||
    pendingEntries === undefined;
  const hasPendingEntries =
    pendingEntries !== undefined && pendingEntries > BigInt(0);

  useEffect(() => {
    if (!isSuccess || !txHash || syncedRef.current) return;
    syncedRef.current = true;
    void setStatusByOnChainId({ onChainDealId, status: "closed" }).catch(
      (err) => {
        console.error("setStatusByOnChainId failed:", err);
        syncedRef.current = false;
      }
    );
  }, [isSuccess, txHash, onChainDealId, setStatusByOnChainId]);

  function handleClose() {
    writeContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "closeDeal",
      args: [BigInt(onChainDealId)],
      chainId: CONTRACTS_CHAIN_ID,
    });
  }

  if (isSuccess) {
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
            isPending ||
            isConfirming ||
            isPendingEntriesUnknown ||
            hasPendingEntries
          }
          className="border border-[var(--t-border)] px-3 py-1 text-[10px] text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] disabled:opacity-50"
        >
          {closeDealButtonLabel(isPending, isConfirming)}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[10px] text-[var(--t-red)]">
          {error.message.slice(0, 150)}
        </p>
      )}
    </div>
  );
}
