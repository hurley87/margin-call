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
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)]">
        <p className="text-[var(--t-muted)]">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--t-bg)]">
        <p className="text-[var(--t-red)]">
          {error?.message ?? "Deal not found"}
        </p>
        <Link
          href="/deals"
          className="text-sm text-[var(--t-muted)] hover:text-[var(--t-text)]"
        >
          Back to deals
        </Link>
      </div>
    );
  }

  const { deal, outcomes } = data;

  return (
    <div className="min-h-screen bg-[var(--t-bg)]">
      <Nav />
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-[var(--t-green)]">
              [{deal.status.toUpperCase()}]
            </span>
            <span className="text-xs text-[var(--t-muted)]">
              {new Date(deal.created_at).toLocaleDateString()}
            </span>
          </div>

          <p className="mb-6 text-lg text-[var(--t-text)]">{deal.prompt}</p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--t-muted)]">Pot</p>
              <p className="text-[var(--t-text)]">{deal.pot_usdc} USDC</p>
            </div>
            <div>
              <p className="text-xs text-[var(--t-muted)]">Entry Cost</p>
              <p className="text-[var(--t-text)]">
                {deal.entry_cost_usdc} USDC
              </p>
            </div>
            {deal.fee_usdc !== undefined && deal.fee_usdc > 0 && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Fee (5%)</p>
                <p className="text-[var(--t-text)]">{deal.fee_usdc} USDC</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--t-muted)]">Entries</p>
              <p className="text-[var(--t-accent)]">{deal.entry_count}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--t-muted)]">Wipeouts</p>
              <p className="text-[var(--t-text)]">{deal.wipeout_count}</p>
            </div>
            {deal.on_chain_deal_id !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">On-chain ID</p>
                <p className="text-[var(--t-text)]">#{deal.on_chain_deal_id}</p>
              </div>
            )}
          </div>
          {deal.on_chain_tx_hash && (
            <a
              href={`https://sepolia.basescan.org/tx/${deal.on_chain_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-xs text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
            >
              View creation tx on BaseScan
            </a>
          )}

          {deal.on_chain_deal_id !== undefined &&
            deal.status === "open" &&
            walletAddress &&
            deal.creator_address?.toLowerCase() ===
              walletAddress.toLowerCase() && (
              <CloseDealButton
                dealId={deal.id}
                onChainDealId={deal.on_chain_deal_id}
              />
            )}
        </div>

        <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
          <h2 className="mb-3 text-sm font-medium text-[var(--t-muted)]">
            Outcomes
          </h2>
          {outcomes.length === 0 ? (
            <p className="text-sm text-[var(--t-muted)]">
              No outcomes yet. Outcomes will appear here as traders enter the
              deal.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className="border border-[var(--t-border)] bg-[var(--t-bg)] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        outcome.trader_pnl_usdc >= 0
                          ? "text-[var(--t-green)]"
                          : "text-[var(--t-red)]"
                      }`}
                    >
                      {outcome.trader_pnl_usdc >= 0 ? "+" : ""}
                      {outcome.trader_pnl_usdc} USDC
                    </span>
                    {outcome.trader_wiped_out && (
                      <span className="text-[10px] font-bold text-[var(--t-red)]">
                        [WIPED OUT
                        {outcome.wipeout_reason
                          ? ` — ${outcome.wipeout_reason.replace("_", " ")}`
                          : ""}
                        ]
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {outcome.narrative.map((event, i) => (
                      <div key={i}>
                        <p className="text-xs font-medium uppercase text-[var(--t-muted)]">
                          {event.event}
                        </p>
                        <p className="text-sm text-[var(--t-text)]">
                          {event.description}
                        </p>
                      </div>
                    ))}
                  </div>

                  {outcome.assets_gained.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-[var(--t-muted)]">
                        Assets gained:
                      </p>
                      <p className="text-xs text-[var(--t-green)]">
                        {outcome.assets_gained
                          .map((a) => `${a.name} ($${a.value_usdc})`)
                          .join(", ")}
                      </p>
                    </div>
                  )}

                  {outcome.assets_lost.length > 0 && (
                    <div className="mt-1">
                      <p className="text-xs text-[var(--t-muted)]">
                        Assets lost:
                      </p>
                      <p className="text-xs text-[var(--t-red)]">
                        {outcome.assets_lost.join(", ")}
                      </p>
                    </div>
                  )}

                  {outcome.rake_usdc > 0 && (
                    <p className="mt-2 text-xs text-[var(--t-muted)]">
                      Rake: {outcome.rake_usdc} USDC
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <p className="text-xs text-[var(--t-muted)]">
                      {new Date(outcome.created_at).toLocaleString()}
                    </p>
                    {outcome.on_chain_tx_hash && (
                      <a
                        href={`https://sepolia.basescan.org/tx/${outcome.on_chain_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
                      >
                        Settlement tx
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
      body: JSON.stringify({ on_chain_deal_id: onChainDealId }),
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
      <div className="mt-4">
        <p className="text-xs text-[var(--t-green)]">
          Deal closed successfully.
        </p>
        {txHash && (
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
          >
            View tx on BaseScan
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={handleClose}
        disabled={isPending || isConfirming}
        className="border border-[var(--t-border)] px-4 py-2 text-sm text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] disabled:opacity-50"
      >
        {isPending
          ? "Confirm in wallet..."
          : isConfirming
            ? "Closing deal..."
            : "Close Deal"}
      </button>
      <p className="mt-1 text-xs text-[var(--t-muted)]">
        Withdraw remaining pot. Requires 0 pending entries.
      </p>
      {error && (
        <p className="mt-1 text-xs text-[var(--t-red)]">
          {error.message.slice(0, 150)}
        </p>
      )}
    </div>
  );
}
