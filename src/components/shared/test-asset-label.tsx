"use client";

import {
  assetLabel,
  isTestAsset,
  type NetworkSlug,
  ROBINHOOD_TESTNET_SLUG,
} from "@/lib/network";
import { cn } from "@/lib/utils";

type TestAssetLabelProps = {
  assetId: string;
  /** Defaults to robinhood-testnet (Floor Test Assets). */
  slug?: NetworkSlug;
  className?: string;
  /** When false, only renders for test-asset-fallback entries. */
  onlyIfTestAsset?: boolean;
};

/**
 * Visible Margin Call Test Asset label. Canonical assets render without the badge.
 */
export function TestAssetLabel({
  assetId,
  slug = ROBINHOOD_TESTNET_SLUG,
  className,
  onlyIfTestAsset = true,
}: TestAssetLabelProps) {
  if (onlyIfTestAsset && !isTestAsset(slug, assetId)) {
    return null;
  }
  const label = assetLabel(slug, assetId);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center border border-[var(--t-amber)]/40 bg-[#1a1208] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--t-amber)]",
        className
      )}
      title={label}
    >
      {label}
    </span>
  );
}
