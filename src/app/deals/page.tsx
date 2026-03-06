"use client";

import Link from "next/link";
import { useDeals } from "@/hooks/use-deals";

export default function DealsPage() {
  const { data: deals, isLoading, error } = useDeals();

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-50">Open Deals</h1>
          <Link
            href="/deals/create"
            className="rounded-full bg-green-500 px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400"
          >
            Create Deal
          </Link>
        </div>

        {isLoading ? (
          <p className="text-zinc-400">Loading deals...</p>
        ) : error ? (
          <p className="text-red-400">Failed to load deals.</p>
        ) : !deals || deals.length === 0 ? (
          <p className="text-zinc-400">No open deals yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700"
              >
                <p className="mb-3 text-zinc-50">
                  {deal.prompt.length > 120
                    ? deal.prompt.slice(0, 120) + "..."
                    : deal.prompt}
                </p>
                <div className="flex gap-6 text-sm text-zinc-400">
                  <span>Pot: {deal.pot_usdc} USDC</span>
                  <span>Entry: {deal.entry_cost_usdc} USDC</span>
                  <span>Entries: {deal.entry_count}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
