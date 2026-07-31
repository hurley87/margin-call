"use client";

import { usePaginatedQuery } from "convex/react";
import type { Address } from "viem";

import { api } from "../../../convex/_generated/api";
import { PackLifecycleActions } from "@/components/maker/pack-lifecycle-actions";
import { formatWadUsd } from "@/lib/pool/nav-distribution";
import { formatShortAddress } from "@/lib/utils";

type Props = {
  walletAddress: string | null;
};

function basketLabel(
  basket: Array<{ asset: string; symbol: string | null }>
): string {
  return (
    basket
      .map((entry) => entry.symbol ?? formatShortAddress(entry.asset))
      .join(" · ") || "Empty basket"
  );
}

function statusLabel(status: "resting" | "ripped" | "unlisted"): string {
  switch (status) {
    case "resting":
      return "Resting";
    case "ripped":
      return "Ripped";
    case "unlisted":
      return "Unlisted";
  }
}

export function MyPacksDashboard({ walletAddress }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.pool.listPacksByMaker,
    walletAddress ? { maker: walletAddress } : "skip",
    { initialNumItems: 20 }
  );

  const loadingFirstPage = status === "LoadingFirstPage";

  return (
    <section className="mt-10" aria-labelledby="my-packs-heading">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
        Maker
      </p>
      <h2
        id="my-packs-heading"
        className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase text-[var(--t-accent)]"
      >
        My Packs
      </h2>

      {!walletAddress ? (
        <p className="mt-3 text-sm text-[var(--t-muted)]">
          Waiting for connected wallet…
        </p>
      ) : loadingFirstPage ? (
        <p className="mt-3 text-sm text-[var(--t-muted)]">
          Loading your Packs…<span className="cursor-blink">█</span>
        </p>
      ) : results.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--t-muted)]">
          No Packs indexed for this wallet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--t-divider)]/40">
          {results.map((pack) => (
            <li key={pack.tokenId} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-[var(--t-accent)]">
                  Pack #{pack.tokenId}
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-text)]">
                  {statusLabel(pack.status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--t-text)]/90">
                {basketLabel(pack.basket)}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--t-muted)]">
                <span>
                  Indexed NAV{" "}
                  {pack.navUsdWad ? formatWadUsd(pack.navUsdWad) : "—"}
                </span>
                <span
                  className={
                    pack.eligible
                      ? "text-[var(--t-green)]"
                      : "text-[var(--t-muted)]"
                  }
                >
                  {pack.eligible ? "Eligible" : "Ineligible"}
                </span>
              </p>
              <PackLifecycleActions
                tokenId={pack.tokenId}
                walletAddress={walletAddress as Address}
              />
            </li>
          ))}
        </ul>
      )}

      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(20)}
          className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] hover:underline"
        >
          [LOAD MORE PACKS]
        </button>
      )}
      {status === "LoadingMore" && (
        <p className="mt-4 text-xs text-[var(--t-muted)]">Loading more…</p>
      )}
    </section>
  );
}
