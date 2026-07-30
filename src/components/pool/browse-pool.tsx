"use client";

import { usePaginatedQuery, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { formatWadUsd } from "@/lib/pool/nav-distribution";

function formatBucketLabel(minUsd: number, maxUsd: number | null): string {
  if (maxUsd === null) return `$${minUsd}+`;
  return `$${minUsd}–$${maxUsd}`;
}

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function BrowsePool() {
  const stats = useQuery(api.pool.getPoolStatistics);
  const {
    results: packs,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.pool.listPacks,
    { status: "resting" },
    { initialNumItems: 20 }
  );

  if (stats === undefined) {
    return (
      <p className="mt-10 text-sm text-[var(--t-muted)]">
        Loading pool…<span className="cursor-blink">█</span>
      </p>
    );
  }

  const hm =
    stats.harmonicMeanNavWad !== null
      ? formatWadUsd(stats.harmonicMeanNavWad)
      : "—";
  const rip =
    stats.ripUnitPriceWad !== null ? formatWadUsd(stats.ripUnitPriceWad) : "—";

  return (
    <section className="mt-10 space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Pool Statistics
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              Eligible
            </dt>
            <dd className="mt-1 text-2xl font-black text-[var(--t-accent)]">
              {stats.eligibleCount}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              Resting
            </dt>
            <dd className="mt-1 text-2xl font-black text-[var(--t-text)]">
              {stats.restingCount}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              HM NAV
            </dt>
            <dd className="mt-1 text-2xl font-black text-[var(--t-text)]">
              {hm}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              Rip price
            </dt>
            <dd className="mt-1 text-2xl font-black text-[var(--t-accent)]">
              {rip}
            </dd>
          </div>
        </dl>

        {stats.navDistribution.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              NAV distribution
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--t-text)]/90">
              {stats.navDistribution
                .filter((b) => b.count > 0)
                .map((b) => (
                  <li
                    key={`${b.minUsd}-${b.maxUsd ?? "max"}`}
                    className="flex justify-between border-b border-[var(--t-divider)]/40 py-1.5"
                  >
                    <span>{formatBucketLabel(b.minUsd, b.maxUsd)}</span>
                    <span className="text-[var(--t-accent)]">{b.count}</span>
                  </li>
                ))}
              {stats.navDistribution.every((b) => b.count === 0) && (
                <li className="text-[var(--t-muted)]">No eligible Packs yet</li>
              )}
            </ul>
          </div>
        )}

        {stats.eligibleCount === 0 && (
          <p className="mt-4 text-sm text-[var(--t-muted)]">
            Pool is empty. Packs appear here once Makers or the House enter the
            pool.
          </p>
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Resting Packs
        </p>
        {packs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--t-muted)]">
            No resting Packs indexed.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--t-divider)]/40">
            {packs.map((pack) => {
              const tickers = pack.basket
                .map((b) => b.symbol ?? shortAddr(b.asset))
                .join(" · ");
              return (
                <li key={pack.tokenId} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold text-[var(--t-accent)]">
                      Pack #{pack.tokenId}
                    </span>
                    <span className="text-sm">
                      {pack.navUsdWad ? formatWadUsd(pack.navUsdWad) : "NAV —"}
                      {pack.eligible ? (
                        <span className="ml-2 text-[var(--t-green)]">
                          eligible
                        </span>
                      ) : (
                        <span className="ml-2 text-[var(--t-muted)]">
                          ineligible
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--t-muted)]">
                    {tickers || "Empty basket"} · maker {shortAddr(pack.maker)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {status === "CanLoadMore" && (
          <button
            type="button"
            onClick={() => loadMore(20)}
            className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] hover:underline"
          >
            [LOAD MORE]
          </button>
        )}
      </div>
    </section>
  );
}
