"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Deal {
  id: string;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  max_extraction_percentage: number;
  status: string;
  entry_count: number;
  wipeout_count: number;
  created_at: string;
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeal() {
      try {
        const res = await fetch(`/api/deal/${id}`);
        if (!res.ok) {
          setError("Deal not found");
          return;
        }
        const data = await res.json();
        setDeal(data.deal);
      } catch {
        setError("Failed to load deal");
      } finally {
        setLoading(false);
      }
    }
    fetchDeal();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-red-400">{error ?? "Deal not found"}</p>
        <Link
          href="/deals"
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          Back to deals
        </Link>
      </div>
    );
  }

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
            <div>
              <p className="text-zinc-500">Entries</p>
              <p className="text-zinc-50">{deal.entry_count}</p>
            </div>
            <div>
              <p className="text-zinc-500">Wipeouts</p>
              <p className="text-zinc-50">{deal.wipeout_count}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Outcomes</h2>
          <p className="text-sm text-zinc-500">
            No outcomes yet. Outcomes will appear here as traders enter the
            deal.
          </p>
        </div>
      </div>
    </div>
  );
}
