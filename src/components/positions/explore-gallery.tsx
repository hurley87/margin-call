"use client";

import { DrawablyButton, DrawablyCard } from "drawably/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PositionArtwork } from "@/components/positions/position-artwork";
import {
  toExploreCardView,
  type ExploreCardView,
} from "@/lib/positions/explore-card-view";
import { PAGE_SIZE, type PositionListItem } from "@/lib/positions/types";
import { useGalleryHealth } from "@/lib/positions/use-gallery-health";

/** Shared sketch knobs so every Explore surface strokes the same way. */
const SKETCH = { roughness: 0.6, boil: 0, stroke: "var(--t-border)" } as const;

/** The ticker logo is a small centered mark; stage artwork fills the tile. */
const ART_SIZES = {
  neutral: "88px",
  stage:
    "(max-width: 600px) 90vw, (max-width: 900px) 45vw, (max-width: 1200px) 30vw, 330px",
} as const;

/** Card-shaped notice so loading, empty, and unavailable share the Explore frame. */
export function ExploreMessage({ children }: { children: ReactNode }) {
  return (
    <DrawablyCard className="explore-message" seed={31} {...SKETCH}>
      <p role="status">{children}</p>
    </DrawablyCard>
  );
}

/** Explore fallback for a Convex query that threw — keeps the page in-shell. */
export function ExploreQueryFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <DrawablyCard className="explore-message" seed={31} {...SKETCH}>
      <p role="alert">Couldn&apos;t load positions. Try again in a moment.</p>
      <DrawablyButton type="button" onClick={onRetry} seed={32} {...SKETCH}>
        Retry
      </DrawablyButton>
    </DrawablyCard>
  );
}

type ExploreGalleryProps = {
  results: PositionListItem[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
  emptyMessage: string;
};

/**
 * Public Position NFT gallery.
 *
 * Unlike the portfolio list, Explore reads live metadata: it fetches the same
 * `GET /api/nft/[tokenId]` payload marketplaces cache, so a browsing visitor
 * sees the dog the token actually shows. That fetch stays owned here — the
 * portfolio list must not grow a way to make it.
 */
export function ExploreGallery(props: ExploreGalleryProps) {
  const { results, status, loadMore, emptyMessage } = props;
  const health = useGalleryHealth(results);

  if (status === "LoadingFirstPage") {
    return <ExploreMessage>Loading positions…</ExploreMessage>;
  }

  if (results.length === 0) {
    return <ExploreMessage>{emptyMessage}</ExploreMessage>;
  }

  return (
    <div>
      <ul className="explore-grid">
        {results.map((position) => (
          <li key={position.tokenId}>
            <ExploreCard
              view={toExploreCardView(position, health[position.tokenId])}
            />
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <DrawablyButton
          type="button"
          className="explore-load-more"
          seed={32}
          {...SKETCH}
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </DrawablyButton>
      ) : null}
    </div>
  );
}

function ExploreCard({ view }: { view: ExploreCardView }) {
  // Layout follows the file, not the Stage face: unpriced metadata still
  // publishes the healthy dog, and shrinking that into the ticker slot would
  // make Explore disagree with the NFT image it just unwrapped.
  const isNeutral = view.imageSrc?.startsWith("/logos/") ?? true;

  return (
    <Link href={view.href} className="explore-card-link">
      <DrawablyCard className="explore-card" seed={29} {...SKETCH}>
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
          <p
            className="explore-card-health"
            data-health={view.healthKind}
            role="status"
          >
            {view.healthLabel}
          </p>
        ) : null}
        <p className="explore-card-token">{view.tokenLabel}</p>
        {view.description ? (
          <p className="explore-card-description">{view.description}</p>
        ) : null}
        <p className="explore-card-owner">{view.ownerLabel}</p>
      </DrawablyCard>
    </Link>
  );
}
