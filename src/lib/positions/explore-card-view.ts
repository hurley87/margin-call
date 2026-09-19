import {
  STAGE_LABEL,
  artworkPath,
  faceFromStage,
  faceFromStatus,
  type ArtworkFace,
  type PositionStage,
} from "@/lib/positions/artwork";
import { localArtworkPathFromMetadata } from "@/lib/positions/nft-metadata";
import type { GalleryNft } from "@/lib/positions/use-gallery-health";
import {
  STATUS_LABEL,
  type PositionListItem,
  type PositionStatus,
} from "@/lib/positions/types";
import { assetLabel } from "@/lib/protocol/deployment";
import { formatShortAddress } from "@/lib/utils";

/**
 * Every health answer an Explore card can render, including the ones that are
 * not a risk stage: a terminal position has no health, a request can still be
 * in flight, and the metadata route can decline or report a burned token.
 */
export type ExploreHealthKind =
  PositionStage | "idle" | "loading" | "unavailable" | "ended";

const HEALTH_LABEL: Record<ExploreHealthKind, string | null> = {
  ...STAGE_LABEL,
  idle: null,
  loading: "Checking health…",
  unavailable: "Health unavailable",
  ended: "Position ended",
};

export type ExploreCardView = {
  href: string;
  assetLabel: string;
  tokenLabel: string;
  ownerLabel: string;
  /** Null once the metadata route reports a burn the index has not caught. */
  statusLabel: string | null;
  statusKind: PositionStatus;
  healthKind: ExploreHealthKind;
  healthLabel: string | null;
  face: ArtworkFace;
  /**
   * Local committed artwork — never the absolute URL from metadata.
   *
   * Active cards with a usable payload take this from `metadata.image`. Stage
   * still drives `healthKind` / `healthLabel`, so Pricing unavailable can sit
   * on the healthy dog the route published.
   */
  imageSrc: string | null;
  description: string | null;
};

function healthKindFor(
  position: PositionListItem,
  snapshot: GalleryNft | undefined
): ExploreHealthKind {
  // Closed and liquidated are settled: live health would be a read with no
  // question behind it.
  if (position.status !== "active") return "idle";
  return snapshot?.health ?? "loading";
}

function faceFor(
  status: PositionListItem["status"],
  healthKind: ExploreHealthKind
): ArtworkFace {
  switch (healthKind) {
    case "healthy":
    case "warning":
    case "danger":
    case "pricing_unavailable":
      return faceFromStage(healthKind);
    case "loading":
    case "unavailable":
    case "ended":
      return "neutral";
    case "idle":
      return faceFromStatus(status);
    default: {
      const _exhaustive: never = healthKind;
      return _exhaustive;
    }
  }
}

/**
 * The one place Explore turns an indexed position plus a metadata fetch into
 * something renderable.
 *
 * Keeping it pure and total is the point: the card never sees the fetch union,
 * so loading, a declined read, and a burned token cannot drift into separate
 * predicates for the artwork, the health copy, and the status chip.
 */
export function toExploreCardView(
  position: PositionListItem,
  snapshot: GalleryNft | undefined
): ExploreCardView {
  const { tokenId, assetId, status, owner } = position;
  const healthKind = healthKindFor(position, snapshot);
  const face = faceFor(status, healthKind);
  // Terminal Convex rows never fetch metadata. Active cards with a usable
  // payload show the image the route declared rather than recomputing it
  // from Stage — `faceFromStage("pricing_unavailable")` is the ticker logo.
  const metadataPath =
    status === "active" && snapshot?.metadata
      ? localArtworkPathFromMetadata(snapshot.metadata)
      : null;

  return {
    href: `/position/${tokenId}`,
    assetLabel: assetLabel(assetId),
    tokenLabel: `Token #${tokenId}`,
    ownerLabel: `Owner ${formatShortAddress(owner)}`,
    // The index still says active while the token is burned on Base. Showing
    // both would tell two stories, so the live read wins.
    statusLabel: healthKind === "ended" ? null : STATUS_LABEL[status],
    statusKind: status,
    healthKind,
    healthLabel: HEALTH_LABEL[healthKind],
    face,
    imageSrc: metadataPath ?? artworkPath(assetId, face),
    description: snapshot?.metadata?.description ?? null,
  };
}
