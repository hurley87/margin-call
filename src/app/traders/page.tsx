"use client";

import Link from "next/link";
import { useConvexTraders } from "@/hooks/use-convex-traders";
import { Nav } from "@/components/nav";

const WALLET_STATUS_LABEL: Record<string, string> = {
  pending: "[WALLET PENDING]",
  creating: "[WALLET CREATING]",
  ready: "",
  error: "[WALLET ERROR]",
};

const WALLET_STATUS_COLOR: Record<string, string> = {
  pending: "text-[var(--t-muted)]",
  creating: "text-[var(--t-amber)]",
  ready: "",
  error: "text-[var(--t-red)]",
};

export default function TradersPage() {
  const traders = useConvexTraders();
  const isLoading = traders === undefined;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />
      <div className="sticky top-[37px] z-20 border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-1.5 text-xs">
          <span className="text-[var(--t-text)]">MY TRADERS</span>
          <Link
            href="/traders/new"
            className="border border-[var(--t-border)] px-2 py-0.5 text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
          >
            [+ NEW]
          </Link>
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        {isLoading ? (
          <p className="text-[var(--t-muted)]">Loading traders...</p>
        ) : !traders || traders.length === 0 ? (
          <p className="text-[var(--t-muted)]">
            No traders yet. Create your first trader to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
            {traders.map((trader) => (
              <Link
                key={trader._id}
                href={`/traders/${trader._id}`}
                className="bg-[var(--t-bg)] p-5 transition-colors hover:bg-[var(--t-surface)]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-lg font-medium text-[var(--t-text)]">
                    {trader.name}
                  </p>
                  <div className="flex items-center gap-2">
                    {trader.walletStatus !== "ready" && (
                      <span
                        className={`text-[10px] font-bold uppercase ${WALLET_STATUS_COLOR[trader.walletStatus]}`}
                      >
                        {WALLET_STATUS_LABEL[trader.walletStatus]}
                      </span>
                    )}
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
                </div>
                <div className="flex flex-col gap-1 text-sm text-[var(--t-muted)]">
                  {trader.tokenId && <span>Token ID: #{trader.tokenId}</span>}
                  {trader.cdpWalletAddress && (
                    <span className="font-mono text-xs">
                      Wallet: {trader.cdpWalletAddress.slice(0, 6)}...
                      {trader.cdpWalletAddress.slice(-4)}
                    </span>
                  )}
                  {trader.walletError && (
                    <span className="text-xs text-[var(--t-red)]">
                      {trader.walletError}
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
