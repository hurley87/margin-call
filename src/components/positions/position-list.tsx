"use client";

import { Component, type ReactNode } from "react";
import { DrawablyButton, DrawablyCard } from "drawably/react";
import { PositionCard } from "@/components/positions/position-card";
import { Button } from "@/components/ui/button";
import type { PositionListItem } from "@/lib/positions/types";
import { useGalleryHealth } from "@/lib/positions/use-gallery-health";

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
export function QueryUnavailable({
  onRetry,
  presentation = "list",
}: {
  onRetry?: () => void;
  presentation?: "list" | "gallery";
}) {
  if (presentation === "gallery") {
    return (
      <DrawablyCard
        stroke="var(--t-border)"
        className="explore-message"
        seed={31}
        roughness={0.6}
        boil={0}
      >
        <p role="alert">Couldn&apos;t load positions. Try again in a moment.</p>
        {onRetry ? (
          <DrawablyButton
            type="button"
            onClick={onRetry}
            seed={32}
            roughness={0.6}
            boil={0}
            tone="neutral"
          >
            Retry
          </DrawablyButton>
        ) : null}
      </DrawablyCard>
    );
  }
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
  presentation?: "list" | "gallery";
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
          presentation={this.props.presentation}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

type PositionListProps = {
  presentation?: "list" | "gallery";
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
    presentation = "list",
  } = props;

  const health = useGalleryHealth(results, presentation === "gallery");

  if (
    presentation === "gallery" &&
    (status === "LoadingFirstPage" || results.length === 0)
  ) {
    return (
      <DrawablyCard
        stroke="var(--t-border)"
        className="explore-message"
        seed={31}
        roughness={0.6}
        boil={0}
      >
        <p role="status">
          {status === "LoadingFirstPage" ? "Loading positions…" : emptyMessage}
        </p>
      </DrawablyCard>
    );
  }

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
    <div
      className={
        presentation === "gallery" ? "explore-results" : "flex flex-col gap-3"
      }
    >
      <ul
        className={
          presentation === "gallery" ? "explore-grid" : "flex flex-col gap-2"
        }
      >
        {results.map((position) => (
          <li key={position.tokenId}>
            <PositionCard
              position={position}
              presentation={presentation}
              health={health[position.tokenId]?.health}
              metadata={health[position.tokenId]?.metadata}
              showOwner={showOwner}
              highlighted={position.tokenId === highlightedTokenId}
            />
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        presentation === "gallery" ? (
          <DrawablyButton
            type="button"
            className="explore-load-more"
            seed={32}
            roughness={0.6}
            boil={0}
            tone="neutral"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
          >
            {status === "LoadingMore" ? "Loading…" : "Load more"}
          </DrawablyButton>
        ) : (
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
        )
      ) : null}
    </div>
  );
}

export { PAGE_SIZE };
