import Link from "next/link";
import { PositionArtwork } from "@/components/positions/position-artwork";
import { indexedArtworkPath } from "@/lib/positions/artwork";
import type { PositionListItem } from "@/lib/positions/types";
import { STATUS_LABEL } from "@/lib/positions/types";
import { assetLabel } from "@/lib/protocol/deployment";
import { cn, formatShortAddress } from "@/lib/utils";

export type PositionCardProps = {
  position: PositionListItem;
  /** When true, show truncated owner (All Positions). */
  showOwner?: boolean;
  /** Temporary post-open accent from `?opened=` — UX hint only. */
  highlighted?: boolean;
};

/**
 * Browseable Position NFT row — identity only, no live financial state.
 *
 * The thumbnail is deliberately lifecycle-driven: rendering live health here
 * would mean one Base read per card. Live stage artwork lives on the detail
 * page, which already reads canonical state.
 */
export function PositionCard(props: PositionCardProps) {
  const { position, showOwner = false, highlighted = false } = props;
  const { tokenId, assetId, status, owner } = position;

  return (
    <Link
      href={`/position/${tokenId}`}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "block border px-4 py-3 transition-colors hover:border-[var(--t-accent)]",
        highlighted
          ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)]"
          : "border-[var(--t-border)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PositionArtwork
          src={indexedArtworkPath(assetId, status)}
          alt=""
          className="w-12 shrink-0"
          sizes="48px"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-[family-name:var(--font-plex-sans)] text-base font-bold uppercase tracking-tight text-[var(--t-accent)]">
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
