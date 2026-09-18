"use client";

import { Component, type ReactNode } from "react";
import { PositionCard } from "@/components/positions/position-card";
import { Button } from "@/components/ui/button";
import type { PositionListItem } from "@/lib/positions/types";

const PAGE_SIZE = 20;

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
export function QueryUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-[var(--t-red)]">
        Couldn&apos;t load positions from the index. Try again in a moment.
      </p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={onRetry}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}

type BoundaryProps = {
  children: ReactNode;
};

type BoundaryState = {
  error: Error | null;
};

/**
 * Catches Convex query throws so portfolio pages stay in-shell
 * instead of falling through to the global error boundary.
 */
export class PositionQueryBoundary extends Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <QueryUnavailable
          onRetry={() => {
            this.setState({ error: null });
          }}
        />
      );
    }
    return this.props.children;
  }
}

type PositionListProps = {
  results: PositionListItem[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
  showOwner?: boolean;
  emptyMessage: string;
  highlightedTokenId?: string;
};

/** Shared paginated Position NFT list — identity cards only. */
export function PositionList(props: PositionListProps) {
  const {
    results,
    status,
    loadMore,
    showOwner = false,
    emptyMessage,
    highlightedTokenId,
  } = props;

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
              showOwner={showOwner}
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

export { PAGE_SIZE };
