import Link from "next/link";
import { PositionArtwork } from "@/components/positions/position-artwork";
import { artworkPath, faceFromStatus } from "@/lib/positions/artwork";
import { STATUS_LABEL, type PositionListItem } from "@/lib/positions/types";
import { assetLabel } from "@/lib/protocol/deployment";
import { cn } from "@/lib/utils";

export type PositionCardProps = {
  position: PositionListItem;
  /** Temporary post-open accent from `?opened=` — UX hint only. */
  highlighted?: boolean;
};

/**
 * Browseable Position NFT row — identity only, no live financial state.
 *
 * The thumbnail is deliberately lifecycle-driven: rendering live health here
 * would mean one metadata read per card. Live stage artwork lives on the
 * detail page and on Explore, which each pay for that read on purpose.
 */
export function PositionCard(props: PositionCardProps) {
  const { position, highlighted = false } = props;
  const { tokenId, assetId, status } = position;

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
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-muted)]">
          {STATUS_LABEL[status]}
        </span>
      </div>
    </Link>
  );
}
