"use client";

import { DrawablyButton, DrawablyCard } from "drawably/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PositionArtwork } from "@/components/positions/position-artwork";
import { ResettableErrorBoundary } from "@/components/ui/resettable-error-boundary";
import { SURFACE_SKETCH } from "@/components/ui/sketch";
import {
  toExploreCardView,
  type ExploreCardView,
} from "@/lib/positions/explore-card-view";
import { PAGE_SIZE, type PositionListItem } from "@/lib/positions/types";
import { useGalleryHealth } from "@/lib/positions/use-gallery-health";

/** The ticker logo is a small centered mark; stage artwork fills the tile. */
const ART_SIZES = {
  neutral: "88px",
  stage:
    "(max-width: 600px) 90vw, (max-width: 900px) 45vw, (max-width: 1200px) 30vw, 330px",
} as const;

/** Card-shaped notice so loading, empty, and unavailable share the gallery frame. */
export function ExploreMessage({ children }: { children: ReactNode }) {
  return (
    <DrawablyCard className="explore-message" seed={31} {...SURFACE_SKETCH}>
      <p role="status">{children}</p>
    </DrawablyCard>
  );
}

/** Missing NEXT_PUBLIC_CONVEX_URL — index never mounted. */
export function IndexUnavailable({ purpose }: { purpose: string }) {
  return (
    <ExploreMessage>
      Position index unavailable. Please try again later {purpose}
    </ExploreMessage>
  );
}

/** Fallback for a Convex query that threw — keeps the page in-shell. */
export function ExploreQueryFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <DrawablyCard className="explore-message" seed={31} {...SURFACE_SKETCH}>
      <p role="alert">Couldn&apos;t load positions. Try again in a moment.</p>
      <DrawablyButton
        type="button"
        onClick={onRetry}
        seed={32}
        {...SURFACE_SKETCH}
      >
        Retry
      </DrawablyButton>
    </DrawablyCard>
  );
}

/**
 * Catches Convex query throws so position pages stay in-shell
 * instead of falling through to the global error boundary.
 */
export function PositionQueryBoundary({ children }: { children: ReactNode }) {
  return (
    <ResettableErrorBoundary
      fallback={(reset) => <ExploreQueryFailed onRetry={reset} />}
    >
      {children}
    </ResettableErrorBoundary>
  );
}

export type PositionGalleryProps = {
  results: PositionListItem[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
  emptyMessage: string;
  showOwner?: boolean;
  highlightedTokenId?: string;
};

/** Shared metadata-backed gallery for Explore and owned positions. */
export function PositionGallery(props: PositionGalleryProps) {
  const {
    results,
    status,
    loadMore,
    emptyMessage,
    showOwner = true,
    highlightedTokenId,
  } = props;
  const health = useGalleryHealth(results);

  if (status === "LoadingFirstPage") {
    return <ExploreMessage>Loading positions…</ExploreMessage>;
  }

  if (results.length === 0) {
    return <ExploreMessage>{emptyMessage}</ExploreMessage>;
  }

  return (
    <div className="position-gallery">
      <ul className="explore-grid">
        {results.map((position) => (
          <li key={position.tokenId}>
            <ExploreCard
              view={toExploreCardView(position, health[position.tokenId])}
              showOwner={showOwner}
              highlighted={position.tokenId === highlightedTokenId}
            />
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <DrawablyButton
          type="button"
          className="explore-load-more"
          seed={32}
          {...SURFACE_SKETCH}
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </DrawablyButton>
      ) : null}
    </div>
  );
}

function ExploreCard({
  view,
  showOwner,
  highlighted,
}: {
  view: ExploreCardView;
  showOwner: boolean;
  highlighted: boolean;
}) {
  // `face` is the published file, so unpriced cards fill the tile with the
  // healthy dog the metadata route declared instead of shrinking into the
  // ticker slot.
  const isNeutral = view.face === "neutral";

  return (
    <Link
      href={view.href}
      className="explore-card-link"
      data-highlighted={highlighted ? "true" : undefined}
    >
      <DrawablyCard className="explore-card" seed={29} {...SURFACE_SKETCH}>
        <div
          className={`explore-card-art${isNeutral ? " explore-card-art-neutral" : ""}`}
        >
          {view.imageSrc ? (
            <PositionArtwork
              src={view.imageSrc}
              alt=""
              sizes={isNeutral ? ART_SIZES.neutral : ART_SIZES.stage}
            />
          ) : (
            <span className="explore-art-placeholder" aria-hidden="true">
              ?
            </span>
          )}
        </div>
        <div className="explore-card-identity">
          <h2>{view.assetLabel}</h2>
          {view.statusLabel ? (
            <span className="explore-card-status" data-status={view.statusKind}>
              {view.statusLabel}
            </span>
          ) : null}
        </div>
        {view.healthLabel ? (
          <p className="stage-chip" data-health={view.healthKind} role="status">
            {view.healthLabel}
          </p>
        ) : null}
        <p className="explore-card-token">{view.tokenLabel}</p>
        {view.description ? (
          <p className="explore-card-description">{view.description}</p>
        ) : null}
        {showOwner ? (
          <p className="explore-card-owner">{view.ownerLabel}</p>
        ) : null}
      </DrawablyCard>
    </Link>
  );
}
