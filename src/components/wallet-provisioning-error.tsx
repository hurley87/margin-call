"use client";

import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { useConvexRetryWalletProvisioning } from "@/hooks/use-convex-traders";

const BOX_CLASSES =
  "border border-[var(--t-red)]/30 bg-[var(--t-red)]/[0.06] px-3 py-2";

export function WalletProvisioningError({
  traderId,
  walletError,
  className,
}: {
  traderId: Id<"traders">;
  walletError: string | null | undefined;
  /** Layout-only overrides (e.g. margins). Box styling is owned by this component. */
  className?: string;
}) {
  const retry = useConvexRetryWalletProvisioning();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | undefined>();

  async function handleRetry() {
    setRetryError(undefined);
    setIsRetrying(true);
    try {
      await retry({ traderId });
    } catch (err) {
      setRetryError(
        err instanceof Error ? err.message : "Retry wallet setup failed"
      );
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className={className ? `${className} ${BOX_CLASSES}` : BOX_CLASSES}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--t-red)]">
        Wallet setup failed
      </p>
      {walletError && (
        <p className="mt-1 text-xs text-[var(--t-red)]">
          {walletError.slice(0, 180)}
        </p>
      )}
      <button
        type="button"
        onClick={handleRetry}
        disabled={isRetrying}
        className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--t-amber)] underline transition-colors hover:text-[var(--t-text)] disabled:opacity-50"
      >
        {isRetrying ? "Retrying setup..." : "Retry wallet setup"}
      </button>
      {retryError && (
        <p className="mt-1 text-xs text-[var(--t-red)]">{retryError}</p>
      )}
    </div>
  );
}
