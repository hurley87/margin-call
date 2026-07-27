"use client";

import { cn } from "@/lib/utils";

type TestAssetLabelProps = {
  assetId: string;
  /** @deprecated Ignored — network registry removed. */
  slug?: string;
  className?: string;
  /** When false, always renders. When true (default), renders nothing without a registry. */
  onlyIfTestAsset?: boolean;
};

/**
 * Visible Margin Call Test Asset label.
 * Post-teardown: registry is gone, so this is a no-op unless forced.
 */
export function TestAssetLabel({
  assetId,
  className,
  onlyIfTestAsset = true,
}: TestAssetLabelProps) {
  if (onlyIfTestAsset) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center border border-[var(--t-amber)]/40 bg-[#1a1208] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--t-amber)]",
        className
      )}
      title={assetId}
    >
      {assetId}
    </span>
  );
}
