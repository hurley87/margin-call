"use client";

import type { ReactNode } from "react";
import { PositionCard } from "@/components/positions/position-card";
import { Button } from "@/components/ui/button";
import { ResettableErrorBoundary } from "@/components/ui/resettable-error-boundary";
import { PAGE_SIZE, type PositionListItem } from "@/lib/positions/types";

/** Missing NEXT_PUBLIC_CONVEX_URL — index never mounted. */
export function IndexUnavailable({ purpose }: { purpose: string }) {
  return (
    <p className="text-sm leading-6 text-[var(--t-red)]">
      Position index unavailable. Set{" "}
      <code className="text-[var(--t-text)]">NEXT_PUBLIC_CONVEX_URL</code>{" "}
      {purpose}.
    </p>
  );
}

/** Runtime Convex query failure — keep chrome, offer retry. */
export function QueryUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-[var(--t-red)]">
        Couldn&apos;t load positions from the index. Try again in a moment.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

/**
 * Catches Convex query throws so portfolio pages stay in-shell
 * instead of falling through to the global error boundary.
 */
export function PositionQueryBoundary({ children }: { children: ReactNode }) {
  return (
    <ResettableErrorBoundary
      fallback={(reset) => <QueryUnavailable onRetry={reset} />}
    >
      {children}
    </ResettableErrorBoundary>
  );
}

type PositionListProps = {
  results: PositionListItem[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
  emptyMessage: string;
  highlightedTokenId?: string;
};

/**
 * The portfolio's paginated Position NFT list — identity cards only.
 *
 * Deliberately offline: a card here shows indexed lifecycle and committed
 * artwork, never live health. Explore pays for live metadata per card, and
 * putting that fetch behind this component would hand the same per-card
 * fan-out to every portfolio render.
 */
export function PositionList(props: PositionListProps) {
  const { results, status, loadMore, emptyMessage, highlightedTokenId } = props;

  if (status === "LoadingFirstPage") {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Loading positions…
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">{emptyMessage}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {results.map((position) => (
          <li key={position.tokenId}>
            <PositionCard
              position={position}
              highlighted={position.tokenId === highlightedTokenId}
            />
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
