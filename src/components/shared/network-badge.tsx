"use client";

import {
  getNetwork,
  resolveActiveNetworkSlug,
  type NetworkSlug,
} from "@/lib/network";
import { cn } from "@/lib/utils";

type NetworkBadgeProps = {
  /** Defaults to the active MARGIN_CALL_NETWORK slug. */
  slug?: NetworkSlug;
  className?: string;
};

/**
 * Visible network badge so testnets are never confused with mainnet.
 */
export function NetworkBadge({ slug, className }: NetworkBadgeProps) {
  const resolved = slug ?? resolveActiveNetworkSlug();
  const network = getNetwork(resolved);
  return (
    <span
      className={cn(
        "inline-flex items-center border border-[var(--t-amber)]/50 bg-[var(--t-accent-soft)] px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-amber)]",
        className
      )}
      title={`${network.name} · chain ${network.chainId}${network.legacy ? " (legacy)" : ""}`}
    >
      {network.name}
      {network.legacy ? " · Legacy" : " · Testnet"}
    </span>
  );
}
