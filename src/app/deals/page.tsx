"use client";

import Link from "next/link";
import { useDeals } from "@/hooks/use-deals";
import { useDealsRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";

export default function DealsPage() {
  useDealsRealtime();
  const { data: deals, isLoading, error } = useDeals();

  return (
    <div className="min-h-screen bg-[var(--t-bg)]">
      <Nav />
      <div className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-1.5 text-xs">
          <span className="text-[var(--t-text)]">OPEN DEALS</span>
          <Link
            href="/deals/create"
            className="text-[var(--t-accent)] transition-colors hover:text-[var(--t-text)]"
          >
            [+ NEW]
          </Link>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        {isLoading ? (
          <p className="text-[var(--t-muted)]">Loading deals...</p>
        ) : error ? (
          <p className="text-[var(--t-red)]">Failed to load deals.</p>
        ) : !deals || deals.length === 0 ? (
          <p className="text-[var(--t-muted)]">No open deals yet.</p>
        ) : (
          <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
            {deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="bg-[var(--t-bg)] p-5 transition-colors hover:bg-[var(--t-surface)]"
              >
                <p className="mb-3 text-[var(--t-text)]">
                  {deal.prompt.length > 120
                    ? deal.prompt.slice(0, 120) + "..."
                    : deal.prompt}
                </p>
                <div className="flex gap-6 text-sm text-[var(--t-muted)]">
                  <span>
                    Pot:{" "}
                    <span className="text-[var(--t-accent)]">
                      {deal.pot_usdc}
                    </span>{" "}
                    USDC
                  </span>
                  <span>
                    Entry:{" "}
                    <span className="text-[var(--t-accent)]">
                      {deal.entry_cost_usdc}
                    </span>{" "}
                    USDC
                  </span>
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
