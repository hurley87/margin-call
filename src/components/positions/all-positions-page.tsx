"use client";

import { usePaginatedQuery } from "convex/react";
import { useMemo, useState } from "react";
import { PositionCard } from "@/components/positions/position-card";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { Button } from "@/components/ui/button";
import type { PositionStatus } from "@/lib/positions/types";
import { baseDeployment } from "@/lib/protocol/deployment";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const PAGE_SIZE = 20;

type LifecycleFilter = "all" | PositionStatus;

/** Public protocol explorer backed by the Convex Position read model. */
export function AllPositionsPage() {
  const convex = useOptionalConvexClient();
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all");
  const [assetId, setAssetId] = useState<number | null>(null);

  const queryArgs = useMemo(() => {
    // assetId requires status on the Convex query.
    if (assetId != null) {
      const status: PositionStatus = lifecycle === "all" ? "active" : lifecycle;
      return { status, assetId };
    }
    if (lifecycle === "all") {
      return {};
    }
    return { status: lifecycle };
  }, [assetId, lifecycle]);

  if (!convex) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader />
        <p className="text-sm leading-6 text-[var(--t-red)]">
          Position index unavailable. Set{" "}
          <code className="text-[var(--t-text)]">NEXT_PUBLIC_CONVEX_URL</code>{" "}
          to browse protocol positions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <Filters
        lifecycle={lifecycle}
        assetId={assetId}
        onLifecycleChange={(next) => {
          setLifecycle(next);
        }}
        onAssetChange={setAssetId}
      />
      <AllPositionsList queryArgs={queryArgs} />
    </div>
  );
}

function AllPositionsList({
  queryArgs,
}: {
  queryArgs: { status?: PositionStatus; assetId?: number };
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.positions.allPositions,
    queryArgs,
    { initialNumItems: PAGE_SIZE }
  );

  if (status === "LoadingFirstPage") {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Loading positions…
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        No positions match these filters.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {results.map((position) => (
          <li key={position.tokenId}>
            <PositionCard
              tokenId={position.tokenId}
              assetId={position.assetId}
              status={position.status}
              owner={position.owner}
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

function PageHeader() {
  return (
    <header className="space-y-2">
      <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
        All Positions
      </h1>
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Protocol-wide Position NFTs from the indexed read model.
      </p>
    </header>
  );
}

function Filters(props: {
  lifecycle: LifecycleFilter;
  assetId: number | null;
  onLifecycleChange: (value: LifecycleFilter) => void;
  onAssetChange: (value: number | null) => void;
}) {
  const { lifecycle, assetId, onLifecycleChange, onAssetChange } = props;

  const lifecycleOptions: { value: LifecycleFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "closed", label: "Closed" },
    { value: "liquidated", label: "Liquidated" },
  ];

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--t-border)] pt-4">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Status
        </p>
        <div className="flex flex-wrap gap-1">
          {lifecycleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onLifecycleChange(option.value)}
              className={cn(
                "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]",
                lifecycle === option.value
                  ? "border border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Asset
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onAssetChange(null)}
            className={cn(
              "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]",
              assetId == null
                ? "border border-[var(--t-accent)] text-[var(--t-accent)]"
                : "border border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]"
            )}
          >
            All
          </button>
          {baseDeployment.assets.map((asset) => (
            <button
              key={asset.assetId}
              type="button"
              onClick={() => onAssetChange(asset.assetId)}
              className={cn(
                "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]",
                assetId === asset.assetId
                  ? "border border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]"
              )}
            >
              {asset.name}
            </button>
          ))}
        </div>
        {assetId != null && lifecycle === "all" ? (
          <p className="text-xs text-[var(--t-muted)]">
            Asset filter uses Active status (index requires a lifecycle).
          </p>
        ) : null}
      </div>
    </div>
  );
}
