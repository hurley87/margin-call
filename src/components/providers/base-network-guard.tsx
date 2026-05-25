"use client";

import { useBaseNetwork } from "@/hooks/use-base-network";
import { PAYMENT_CHAIN_NAME } from "@/lib/privy/config";

/**
 * Renders a persistent banner when the connected wallet is on the wrong network,
 * with a Privy-powered switch action and retry/error states.
 * Mount once inside the Privy provider (e.g. in PrivyProvider layout).
 */
export function BaseNetworkGuard() {
  const { isWrongNetwork, isSwitching, switchError, switchToBase } =
    useBaseNetwork();

  if (!isWrongNetwork) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-[var(--t-amber)]/45 bg-[#1a1208]/95 px-4 py-3 font-mono text-sm text-[var(--t-text)]"
    >
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--t-amber)]">
        Network mismatch: embedded desk wallet is off-floor. Switch to{" "}
        {PAYMENT_CHAIN_NAME} to use this app.
      </span>
      <button
        type="button"
        onClick={switchToBase}
        disabled={isSwitching}
        className="min-h-10 border border-[var(--t-amber)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--t-amber)] transition-colors hover:bg-[var(--t-amber)] hover:text-[var(--t-bg)] focus:bg-[var(--t-amber)] focus:text-[var(--t-bg)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSwitching ? "Switching..." : `Switch to ${PAYMENT_CHAIN_NAME}`}
      </button>
      {switchError && (
        <span className="w-full text-center text-xs uppercase tracking-[0.14em] text-[var(--t-red)]">
          {switchError} Try again or switch the embedded wallet network.
        </span>
      )}
    </div>
  );
}
