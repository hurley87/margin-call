"use client";

import Link from "next/link";
import { useDeals } from "@/hooks/use-deals";
import { useDealsRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";

export default function DealsPage() {
  useDealsRealtime();
  const { data: deals, isLoading, error } = useDeals();

  const totalPot = deals?.reduce((sum, d) => sum + d.pot_usdc, 0) ?? 0;
  const totalEntries = deals?.reduce((sum, d) => sum + d.entry_count, 0) ?? 0;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      {/* Sub-header */}
      <div className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-1.5 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              OPEN DEALS
            </span>
            {deals && deals.length > 0 && (
              <>
                <span className="text-[var(--t-muted)]">
                  POT{" "}
                  <span className="text-[var(--t-green)]">
                    ${totalPot.toFixed(2)}
                  </span>
                </span>
                <span className="text-[var(--t-muted)]">
                  ENTRIES{" "}
                  <span className="text-[var(--t-text)]">{totalEntries}</span>
                </span>
              </>
            )}
          </div>
          <Link
            href="/deals/create"
            className="border border-[var(--t-border)] px-2.5 py-1 text-[10px] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
          >
            [+ NEW DEAL]
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        {isLoading ? (
          <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
            <p className="text-sm text-[var(--t-muted)]">
              LOADING DEALS...<span className="cursor-blink">█</span>
            </p>
          </div>
        ) : error ? (
          <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
            <p className="text-sm text-[var(--t-red)]">
              ERR: FAILED TO LOAD DEALS
            </p>
          </div>
        ) : !deals || deals.length === 0 ? (
          <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
            <p className="text-sm text-[var(--t-muted)]">NO OPEN DEALS</p>
            <Link
              href="/deals/create"
              className="mt-3 inline-block text-xs text-[var(--t-accent)] transition-colors hover:text-[var(--t-text)]"
            >
              {">"} CREATE THE FIRST DEAL
            </Link>
          </div>
        ) : (
          <div className="border border-[var(--t-border)]">
            {/* Table Header */}
            <div className="flex items-center justify-between border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              <span>Scenario</span>
              <div className="flex items-center gap-4">
                <span className="w-16 text-right">Pot</span>
                <span className="w-16 text-right">Entry</span>
                <span className="w-10 text-right">Qty</span>
              </div>
            </div>

            {deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-start justify-between gap-4 border-b border-[var(--t-border)] last:border-b-0 bg-[var(--t-bg)] px-3 py-3 transition-colors hover:bg-[var(--t-surface)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-[var(--t-text)]">
                    {deal.prompt.length > 140
                      ? deal.prompt.slice(0, 140) + "..."
                      : deal.prompt}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                    <span className="text-[var(--t-green)]">
                      [{deal.status.toUpperCase()}]
                    </span>
                    {deal.on_chain_deal_id !== undefined && (
                      <span className="text-[var(--t-muted)]">
                        #{deal.on_chain_deal_id}
                      </span>
                    )}
                    <span className="text-[var(--t-muted)]">
                      {new Date(deal.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 pt-0.5 text-xs">
                  <span className="w-16 text-right text-[var(--t-green)]">
                    ${deal.pot_usdc.toFixed(2)}
                  </span>
                  <span className="w-16 text-right text-[var(--t-accent)]">
                    ${deal.entry_cost_usdc.toFixed(2)}
                  </span>
                  <span className="w-10 text-right text-[var(--t-muted)]">
                    {deal.entry_count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
