"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { useTrader } from "@/hooks/use-traders";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";

export default function TraderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: trader, isLoading, error } = useTrader(id);

  const { data: escrowBalance } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: trader ? [BigInt(trader.token_id)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: !!trader,
      refetchInterval: 15_000,
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-red-400">{error?.message ?? "Trader not found"}</p>
        <Link
          href="/traders"
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          Back to traders
        </Link>
      </div>
    );
  }

  const balanceUsdc =
    escrowBalance !== undefined ? Number(escrowBalance) / 1_000_000 : null;

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href="/traders"
          className="mb-6 inline-block text-sm text-zinc-400 transition-colors hover:text-zinc-300"
        >
          &larr; All Traders
        </Link>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-zinc-50">
              {trader.name}
            </h1>
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                trader.status === "active"
                  ? "bg-green-500/10 text-green-400"
                  : trader.status === "paused"
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "bg-red-500/10 text-red-400"
              }`}
            >
              {trader.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Token ID</p>
              <p className="text-zinc-50">#{trader.token_id}</p>
            </div>
            <div>
              <p className="text-zinc-500">Escrow Balance</p>
              <p className="text-zinc-50">
                {balanceUsdc !== null ? `${balanceUsdc} USDC` : "..."}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-zinc-500">Wallet (TBA)</p>
              <p className="font-mono text-xs text-zinc-50">
                {trader.tba_address ?? "Not derived"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-zinc-500">Owner</p>
              <p className="font-mono text-xs text-zinc-50">
                {trader.owner_address}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Mandate</h2>
          {Object.keys(trader.mandate).length === 0 ? (
            <p className="text-sm text-zinc-500">
              No mandate configured yet. Configure risk tolerance and deal
              filters to control how this trader enters deals.
            </p>
          ) : (
            <pre className="text-xs text-zinc-300">
              {JSON.stringify(trader.mandate, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
