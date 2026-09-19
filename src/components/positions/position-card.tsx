"use client";

import { DrawablyCard } from "drawably/react";
import Link from "next/link";
import { PositionArtwork } from "@/components/positions/position-artwork";
import {
  artworkPath,
  faceFromStatus,
  faceFromStage,
  STAGE_LABEL,
} from "@/lib/positions/artwork";
import {
  METADATA_ORIGIN,
  type NftMetadata,
} from "@/lib/positions/nft-metadata";
import type { GalleryHealth } from "@/lib/positions/use-gallery-health";
import type { PositionListItem } from "@/lib/positions/types";
import { STATUS_LABEL } from "@/lib/positions/types";
import { assetLabel } from "@/lib/protocol/deployment";
import { cn, formatShortAddress } from "@/lib/utils";

export type PositionCardProps = {
  position: PositionListItem;
  presentation?: "list" | "gallery";
  health?: GalleryHealth;
  metadata?: NftMetadata;
  /** When true, show truncated owner (All Positions). */
  showOwner?: boolean;
  /** Temporary post-open accent from `?opened=` — UX hint only. */
  highlighted?: boolean;
};

/** Portfolio uses lifecycle artwork; Explore may supply live health. */
export function PositionCard(props: PositionCardProps) {
  const {
    position,
    showOwner = false,
    highlighted = false,
    presentation = "list",
    health,
    metadata,
  } = props;
  const { tokenId, assetId, status, owner } = position;

  if (presentation === "gallery") {
    const stage =
      status === "active" &&
      health &&
      health !== "unavailable" &&
      health !== "ended"
        ? health
        : null;
    const face =
      status === "active" ? faceFromStage(stage) : faceFromStatus(status);
    const healthLabel =
      status !== "active"
        ? null
        : health === undefined
          ? "Checking health…"
          : health === "unavailable"
            ? "Health unavailable"
            : health === "ended"
              ? "Position ended"
              : STAGE_LABEL[health];
    // Metadata uses the canonical origin; serve the identical artwork locally.
    const src = metadata
      ? metadata.image.slice(METADATA_ORIGIN.length)
      : artworkPath(assetId, face);
    return (
      <Link
        href={`/position/${tokenId}`}
        className="explore-card-link"
        data-highlighted={highlighted ? "true" : undefined}
      >
        <DrawablyCard
          stroke="var(--t-border)"
          className="explore-card"
          seed={29}
          roughness={0.6}
          boil={0}
        >
          <div
            className={`explore-card-art ${face === "neutral" ? "explore-card-art-neutral" : ""}`}
          >
            {src ? (
              <PositionArtwork
                src={src}
                alt=""
                sizes={
                  face === "neutral"
                    ? "88px"
                    : "(max-width: 600px) 90vw, (max-width: 900px) 45vw, (max-width: 1200px) 30vw, 330px"
                }
              />
            ) : (
              <span className="explore-art-placeholder" aria-hidden="true">
                ?
              </span>
            )}
          </div>
          <div className="explore-card-identity">
            <h2>{assetLabel(assetId)}</h2>
            <span className="explore-card-status" data-status={status}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          {healthLabel ? (
            <p
              className="explore-card-health"
              data-stage={stage ?? "unavailable"}
              role="status"
            >
              {healthLabel}
            </p>
          ) : null}
          <p className="explore-card-token">Token #{tokenId}</p>
          {metadata ? (
            <p className="explore-card-description">{metadata.description}</p>
          ) : null}
          {showOwner ? (
            <p className="explore-card-owner">
              Owner {formatShortAddress(owner)}
            </p>
          ) : null}
        </DrawablyCard>
      </Link>
    );
  }

  return (
    <Link
      href={`/position/${tokenId}`}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "position-card block border px-4 py-3 transition-colors hover:border-[var(--t-accent)]",
        highlighted
          ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)]"
          : "border-[var(--t-border)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PositionArtwork
          src={artworkPath(assetId, faceFromStatus(status))}
          alt=""
          className="w-12 shrink-0"
          sizes="48px"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="position-card-title font-[family-name:var(--font-plex-sans)] text-base font-bold uppercase tracking-tight text-[var(--t-accent)]">
            {assetLabel(assetId)}
          </p>
          <p className="truncate text-xs text-[var(--t-muted)]">
            Token #{tokenId}
          </p>
          {showOwner ? (
            <p className="text-xs text-[var(--t-muted)]">
              Owner {formatShortAddress(owner)}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-muted)]">
          {STATUS_LABEL[status]}
        </span>
      </div>
    </Link>
  );
}
