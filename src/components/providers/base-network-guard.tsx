"use client";

import { useBaseNetwork } from "@/hooks/use-base-network";

/**
 * Renders a persistent banner when the connected wallet is on the wrong network,
 * with a Privy-powered "Switch to Base" action and retry/error states.
 * Mount once inside the Privy provider (e.g. in PrivyProvider layout).
 */
export function BaseNetworkGuard() {
  const { isWrongNetwork, isSwitching, switchError, switchToBase } =
    useBaseNetwork();

  if (!isWrongNetwork) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-950/80 px-4 py-3 text-sm text-amber-100"
    >
      <span>
        Your wallet is on a different network. Switch to Base to use this app.
      </span>
      <button
        type="button"
        onClick={switchToBase}
        disabled={isSwitching}
        className="rounded-full bg-amber-500 px-4 py-2 font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {isSwitching ? "Switching…" : "Switch to Base"}
      </button>
      {switchError && (
        <span className="w-full text-center text-amber-200/90">
          {switchError} Try again or switch the network in your wallet.
        </span>
      )}
    </div>
  );
}
