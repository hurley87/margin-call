"use client";

import { PAYMENT_CHAIN_ID, PAYMENT_CHAIN_NAME } from "@/lib/privy/config";
import { cn } from "@/lib/utils";

type NetworkBadgeProps = {
  className?: string;
  /** @deprecated Ignored — payment chain is fixed post-teardown. */
  slug?: string;
};

/**
 * Visible network badge so testnets are never confused with mainnet.
 */
export function NetworkBadge({ className }: NetworkBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-[var(--t-amber)]/50 bg-[var(--t-accent-soft)] px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-amber)]",
        className
      )}
      title={`${PAYMENT_CHAIN_NAME} · chain ${PAYMENT_CHAIN_ID}`}
    >
      {PAYMENT_CHAIN_NAME} · Testnet
    </span>
  );
}
