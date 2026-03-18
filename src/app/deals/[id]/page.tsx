"use client";

import { useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useDeal } from "@/hooks/use-deals";
import { useDealRealtime } from "@/hooks/use-realtime";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import { Nav } from "@/components/nav";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDealRealtime(id);
  const { data, isLoading, error } = useDeal(id);
  const { user } = usePrivy();
  const walletAddress = user?.wallet?.address;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] font-mono">
        <p className="text-[var(--t-muted)]">
          LOADING...<span className="cursor-blink">█</span>
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="crt-scanlines flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--t-bg)] font-mono">
        <p className="text-sm text-[var(--t-red)]">
          ERR: {error?.message ?? "DEAL NOT FOUND"}
        </p>
        <Link
          href="/wire"
          className="text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
        >
          {"<"} BACK TO NEWSWIRE
        </Link>
      </div>
    );
  }

  const { deal, outcomes } = data;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="border-x border-b border-[var(--t-border)]">
          {/* Sub-header */}
          <div className="sticky top-[37px] z-20 border-b border-[var(--t-border)] bg-[var(--t-bg)]">
            <div className="flex items-center justify-between px-4 py-1.5">
              <div className="flex items-center gap-3">
                <Link
                  href="/wire"
                  className="text-xs uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
                >
                  {"<"} NEWSWIRE
                </Link>
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
            {/* Deal Info */}
            <div className="border border-[var(--t-border)]">
              <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                SCENARIO
              </div>
              <div className="px-3 py-3">
                <p className="text-xs leading-relaxed text-[var(--t-text)]">
                  {deal.prompt}
                </p>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-0 border-t border-[var(--t-border)] text-xs">
                <div className="flex-1 border-r border-[var(--t-border)] px-3 py-2.5">
                  <p className="text-[10px] text-[var(--t-muted)]">POT</p>
                  <p className="text-[var(--t-green)]">${deal.pot_usdc}</p>
                </div>
                <div className="flex-1 border-r border-[var(--t-border)] px-3 py-2.5">
                  <p className="text-[10px] text-[var(--t-muted)]">ENTRY</p>
                  <p className="text-[var(--t-accent)]">
                    ${deal.entry_cost_usdc}
                  </p>
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
                      deal.wipeout_count > 0
                        ? "text-[var(--t-red)]"
                        : "text-[var(--t-text)]"
                    }
                  >
                    {deal.wipeout_count}
                  </p>
                </div>
              </div>

              {/* Links + Actions */}
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
                walletAddress &&
                deal.creator_address?.toLowerCase() ===
                  walletAddress.toLowerCase() &&
                (deal.status === "open" ? (
                  <CloseDealButton
                    dealId={deal.id}
                    onChainDealId={deal.on_chain_deal_id}
                  />
                ) : deal.status === "closed" ? (
                  <div className="border border-green-500/30 bg-green-500/10 px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-green-400">
                    DEAL CLOSED — pot withdrawn
                  </div>
                ) : null)}
            </div>

            {/* Outcomes */}
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
                      className={`border-b border-[var(--t-border)] last:border-b-0 px-3 py-3 ${
                        outcome.trader_wiped_out
                          ? "bg-[#D48787]/5"
                          : "bg-[var(--t-bg)]"
                      }`}
                    >
                      {/* P&L Header */}
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
                            {outcome.trader_pnl_usdc >= 0 ? "+" : ""}$
                            {Math.abs(outcome.trader_pnl_usdc).toFixed(2)}
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

                      {/* Narrative */}
                      <p className="mt-2 text-xs leading-relaxed text-[var(--t-text)]">
                        {outcome.narrative}
                      </p>

                      {/* Assets */}
                      {(outcome.assets_gained.length > 0 ||
                        outcome.assets_lost.length > 0) && (
                        <div className="mt-2 flex items-center gap-3 text-[10px]">
                          {outcome.assets_gained.length > 0 && (
                            <span className="text-[var(--t-green)]">
                              +{" "}
                              {outcome.assets_gained
                                .map((a) => `${a.name} ($${a.value_usdc})`)
                                .join(", ")}
                            </span>
                          )}
                          {outcome.assets_lost.length > 0 && (
                            <span className="text-[var(--t-red)]">
                              - {outcome.assets_lost.join(", ")}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--t-muted)]">
                        <span>
                          {new Date(outcome.created_at).toLocaleString()}
                        </span>
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseDealButton({
  dealId,
  onChainDealId,
}: {
  dealId: string;
  onChainDealId: number;
}) {
  const queryClient = useQueryClient();
  const syncedRef = useRef(false);
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // After close confirms, sync deal status from chain and refetch (once)
  useEffect(() => {
    if (!isSuccess || !txHash || syncedRef.current) return;
    syncedRef.current = true;
    fetch("/api/deal/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on_chain_deal_id: onChainDealId, txHash }),
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      })
      .catch((err) => console.error("Deal sync after close failed:", err));
  }, [isSuccess, txHash, onChainDealId, dealId, queryClient]);

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
          Withdraw remaining pot (requires 0 pending entries)
        </p>
        <button
          onClick={handleClose}
          disabled={isPending || isConfirming}
          className="border border-[var(--t-border)] px-3 py-1 text-[10px] text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] disabled:opacity-50"
        >
          {isPending
            ? "CONFIRM IN WALLET..."
            : isConfirming
              ? "CLOSING..."
              : "CLOSE DEAL"}
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
