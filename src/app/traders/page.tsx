"use client";

import Link from "next/link";
import { useTraders } from "@/hooks/use-traders";
import { Nav } from "@/components/nav";

export default function TradersPage() {
  const { data: traders, isLoading, error } = useTraders();

  return (
    <div className="min-h-screen bg-[var(--t-bg)]">
      <Nav />
      <div className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-1.5 text-xs">
          <span className="text-[var(--t-text)]">MY TRADERS</span>
          <Link
            href="/traders/new"
            className="text-[var(--t-accent)] transition-colors hover:text-[var(--t-text)]"
          >
            [+ NEW]
          </Link>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        {isLoading ? (
          <p className="text-[var(--t-muted)]">Loading traders...</p>
        ) : error ? (
          <p className="text-[var(--t-red)]">Failed to load traders.</p>
        ) : !traders || traders.length === 0 ? (
          <p className="text-[var(--t-muted)]">
            No traders yet. Mint your first trader NFT to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
            {traders.map((trader) => (
              <Link
                key={trader.id}
                href={`/traders/${trader.id}`}
                className="bg-[var(--t-bg)] p-5 transition-colors hover:bg-[var(--t-surface)]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-lg font-medium text-[var(--t-text)]">
                    {trader.name}
                  </p>
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      trader.status === "active"
                        ? "text-[var(--t-green)]"
                        : trader.status === "paused"
                          ? "text-[var(--t-amber)]"
                          : "text-[var(--t-red)]"
                    }`}
                  >
                    [
                    {trader.status === "wiped_out"
                      ? "WIPED"
                      : trader.status.toUpperCase()}
                    ]
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-sm text-[var(--t-muted)]">
                  <span>Token ID: #{trader.token_id}</span>
                  {trader.tba_address && (
                    <span className="font-mono text-xs">
                      Wallet: {trader.tba_address.slice(0, 6)}...
                      {trader.tba_address.slice(-4)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
