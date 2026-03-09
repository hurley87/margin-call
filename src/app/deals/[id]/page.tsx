"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useDeal } from "@/hooks/use-deals";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useDeal(id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-red-400">{error?.message ?? "Deal not found"}</p>
        <Link
          href="/deals"
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          Back to deals
        </Link>
      </div>
    );
  }

  const { deal, outcomes } = data;
  const { address } = useAccount();

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href="/deals"
          className="mb-6 inline-block text-sm text-zinc-400 transition-colors hover:text-zinc-300"
        >
          &larr; All Deals
        </Link>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400">
              {deal.status}
            </span>
            <span className="text-xs text-zinc-500">
              {new Date(deal.created_at).toLocaleDateString()}
            </span>
          </div>

          <p className="mb-6 text-lg text-zinc-50">{deal.prompt}</p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Pot</p>
              <p className="text-zinc-50">{deal.pot_usdc} USDC</p>
            </div>
            <div>
              <p className="text-zinc-500">Entry Cost</p>
              <p className="text-zinc-50">{deal.entry_cost_usdc} USDC</p>
            </div>
            {deal.fee_usdc !== undefined && deal.fee_usdc > 0 && (
              <div>
                <p className="text-zinc-500">Fee (5%)</p>
                <p className="text-zinc-50">{deal.fee_usdc} USDC</p>
              </div>
            )}
            <div>
              <p className="text-zinc-500">Entries</p>
              <p className="text-zinc-50">{deal.entry_count}</p>
            </div>
            <div>
              <p className="text-zinc-500">Wipeouts</p>
              <p className="text-zinc-50">{deal.wipeout_count}</p>
            </div>
            {deal.on_chain_deal_id !== undefined && (
              <div>
                <p className="text-zinc-500">On-chain ID</p>
                <p className="text-zinc-50">#{deal.on_chain_deal_id}</p>
              </div>
            )}
          </div>
          {deal.on_chain_tx_hash && (
            <a
              href={`https://sepolia.basescan.org/tx/${deal.on_chain_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-xs text-green-400 underline decoration-green-400/50 hover:text-green-300"
            >
              View creation tx on BaseScan
            </a>
          )}

          {deal.on_chain_deal_id !== undefined &&
            deal.status === "open" &&
            address &&
            deal.creator_address?.toLowerCase() === address.toLowerCase() && (
              <CloseDealButton onChainDealId={deal.on_chain_deal_id} />
            )}
        </div>

        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Outcomes</h2>
          {outcomes.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No outcomes yet. Outcomes will appear here as traders enter the
              deal.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className="rounded border border-zinc-700 bg-zinc-800 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        outcome.trader_pnl_usdc >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {outcome.trader_pnl_usdc >= 0 ? "+" : ""}
                      {outcome.trader_pnl_usdc} USDC
                    </span>
                    {outcome.trader_wiped_out && (
                      <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                        WIPED OUT
                        {outcome.wipeout_reason
                          ? ` — ${outcome.wipeout_reason.replace("_", " ")}`
                          : ""}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {outcome.narrative.map((event, i) => (
                      <div key={i}>
                        <p className="text-xs font-medium text-zinc-400">
                          {event.event}
                        </p>
                        <p className="text-sm text-zinc-300">
                          {event.description}
                        </p>
                      </div>
                    ))}
                  </div>

                  {outcome.assets_gained.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500">Assets gained:</p>
                      <p className="text-xs text-green-400">
                        {outcome.assets_gained
                          .map((a) => `${a.name} ($${a.value_usdc})`)
                          .join(", ")}
                      </p>
                    </div>
                  )}

                  {outcome.assets_lost.length > 0 && (
                    <div className="mt-1">
                      <p className="text-xs text-zinc-500">Assets lost:</p>
                      <p className="text-xs text-red-400">
                        {outcome.assets_lost.join(", ")}
                      </p>
                    </div>
                  )}

                  {outcome.rake_usdc > 0 && (
                    <p className="mt-2 text-xs text-zinc-600">
                      Rake: {outcome.rake_usdc} USDC
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <p className="text-xs text-zinc-600">
                      {new Date(outcome.created_at).toLocaleString()}
                    </p>
                    {outcome.on_chain_tx_hash && (
                      <a
                        href={`https://sepolia.basescan.org/tx/${outcome.on_chain_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-400 underline decoration-green-400/50 hover:text-green-300"
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

function CloseDealButton({ onChainDealId }: { onChainDealId: number }) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

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
        <p className="text-xs text-green-400">Deal closed successfully.</p>
        {txHash && (
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-400 underline decoration-green-400/50 hover:text-green-300"
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
        className="rounded bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {isPending
          ? "Confirm in wallet..."
          : isConfirming
            ? "Closing deal..."
            : "Close Deal"}
      </button>
      <p className="mt-1 text-xs text-zinc-500">
        Withdraw remaining pot. Requires 0 pending entries.
      </p>
      {error && (
        <p className="mt-1 text-xs text-red-400">
          {error.message.slice(0, 150)}
        </p>
      )}
    </div>
  );
}
