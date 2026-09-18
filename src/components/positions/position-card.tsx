import Link from "next/link";
import type { PositionListItem } from "@/lib/positions/types";
import { STATUS_LABEL } from "@/lib/positions/types";
import { assetLabel } from "@/lib/protocol/deployment";
import { formatShortAddress } from "@/lib/utils";

export type PositionCardProps = {
  position: PositionListItem;
  /** When true, show truncated owner (All Positions). */
  showOwner?: boolean;
};

/** Browseable Position NFT row — identity only, no live financial state. */
export function PositionCard(props: PositionCardProps) {
  const { position, showOwner = false } = props;
  const { tokenId, assetId, status, owner } = position;

  return (
    <Link
      href={`/position/${tokenId}`}
      className="block border border-[var(--t-border)] px-4 py-3 transition-colors hover:border-[var(--t-accent)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
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
