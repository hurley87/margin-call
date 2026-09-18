"use client";

import { PositionCard } from "@/components/positions/position-card";
import { Button } from "@/components/ui/button";
import type { PositionListItem } from "@/lib/positions/types";

const PAGE_SIZE = 20;

export function IndexUnavailable({ purpose }: { purpose: string }) {
  return (
    <p className="text-sm leading-6 text-[var(--t-red)]">
      Position index unavailable. Set{" "}
      <code className="text-[var(--t-text)]">NEXT_PUBLIC_CONVEX_URL</code>{" "}
      {purpose}.
    </p>
  );
}

type PositionListProps = {
  results: PositionListItem[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
  showOwner?: boolean;
  emptyMessage: string;
};

/** Shared paginated Position NFT list — identity cards only. */
export function PositionList(props: PositionListProps) {
  const { results, status, loadMore, showOwner = false, emptyMessage } = props;

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
            <PositionCard position={position} showOwner={showOwner} />
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
