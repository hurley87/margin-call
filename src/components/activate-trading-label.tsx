"use client";

/** Inline label for activate-trading affordances (creation flow + trader detail). */
export function ActivateTradingLabel({
  isActivating,
  isSyncingDeposit,
  idleLabel = "ACTIVATE TRADING",
}: {
  isActivating: boolean;
  isSyncingDeposit: boolean;
  idleLabel?: string;
}) {
  if (isActivating) {
    return <>ACTIVATING...</>;
  }

  if (isSyncingDeposit) {
    return (
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
          aria-hidden
        />
        Syncing deposit…
      </span>
    );
  }

  return <>{idleLabel}</>;
}
