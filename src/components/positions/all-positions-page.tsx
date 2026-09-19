"use client";

import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { DrawablyButton, DrawablyCard, DrawablyDivider } from "drawably/react";
import {
  ExploreMessage,
  ExploreQueryFailed,
  PositionGallery,
} from "@/components/positions/position-gallery";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { ResettableErrorBoundary } from "@/components/ui/resettable-error-boundary";
import {
  PAGE_SIZE,
  type AllPositionsFilter,
  type PositionStatus,
} from "@/lib/positions/types";
import { baseDeployment } from "@/lib/protocol/deployment";
import { api } from "../../../convex/_generated/api";

/** Public protocol explorer backed by the Convex Position read model. */
export function AllPositionsPage() {
  const convex = useOptionalConvexClient();
  const [filter, setFilter] = useState<AllPositionsFilter>({});

  if (!convex) {
    return (
      <div className="explore-page">
        <PageHeader />
        <ExploreMessage>
          Positions are temporarily unavailable. Please try again later.
        </ExploreMessage>
      </div>
    );
  }

  return (
    <div className="explore-page">
      <PageHeader />
      <Filters filter={filter} onChange={setFilter} />
      <ResettableErrorBoundary
        fallback={(reset) => <ExploreQueryFailed onRetry={reset} />}
      >
        <AllPositionsList queryArgs={filter} />
      </ResettableErrorBoundary>
    </div>
  );
}

function AllPositionsList({ queryArgs }: { queryArgs: AllPositionsFilter }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.positions.allPositions,
    queryArgs,
    { initialNumItems: PAGE_SIZE }
  );

  return (
    <PositionGallery
      results={results}
      status={status}
      loadMore={loadMore}
      emptyMessage="No positions match these filters."
    />
  );
}

function PageHeader() {
  return (
    <header className="explore-heading">
      <h1>Explore</h1>
      <p>Discover onchain stock positions. Every position has a story.</p>
    </header>
  );
}

const STATUS_OPTIONS: { value: PositionStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

function Filters(props: {
  filter: AllPositionsFilter;
  onChange: (next: AllPositionsFilter) => void;
}) {
  const { filter, onChange } = props;
  const hasAsset = filter.assetId != null;
  const selectedStatus = filter.status;
  const canFilterByAsset = selectedStatus != null;

  function selectStatusAll() {
    onChange({});
  }

  function selectStatus(status: PositionStatus) {
    if (hasAsset) {
      onChange({ status, assetId: filter.assetId });
      return;
    }
    onChange({ status });
  }

  function selectAssetAll() {
    if (selectedStatus) {
      onChange({ status: selectedStatus });
      return;
    }
    onChange({});
  }

  function selectAsset(assetId: number) {
    // Convex requires status with assetId — only callable when status is set.
    if (selectedStatus == null) return;
    onChange({ status: selectedStatus, assetId });
  }

  return (
    <DrawablyCard
      stroke="var(--t-border)"
      className="explore-filters"
      seed={17}
      roughness={0.6}
      boil={0}
    >
      <div className="explore-filter-group" role="group" aria-label="Status">
        <p className="explore-filter-label">Status</p>
        <div className="explore-filter-options">
          {!hasAsset ? (
            <Chip
              label="All"
              selected={selectedStatus == null}
              onClick={selectStatusAll}
            />
          ) : null}
          {STATUS_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={selectedStatus === option.value}
              onClick={() => selectStatus(option.value)}
            />
          ))}
        </div>
      </div>
      <DrawablyDivider
        seed={18}
        roughness={0.5}
        boil={0}
        stroke="var(--t-border)"
      />
      <div className="explore-filter-group" role="group" aria-label="Asset">
        <p className="explore-filter-label">Asset</p>
        <div className="explore-filter-options">
          <Chip label="All" selected={!hasAsset} onClick={selectAssetAll} />
          {baseDeployment.assets.map((asset) => (
            <Chip
              key={asset.assetId}
              label={asset.name}
              selected={filter.assetId === asset.assetId}
              disabled={!canFilterByAsset}
              onClick={() => selectAsset(asset.assetId)}
            />
          ))}
        </div>
        {!canFilterByAsset ? (
          <p className="explore-filter-hint">
            Choose a status to filter by asset.
          </p>
        ) : null}
      </div>
    </DrawablyCard>
  );
}

function Chip(props: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { label, selected, onClick, disabled = false } = props;
  return (
    <DrawablyButton
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className="explore-filter-button"
      variant="outline"
      tone="neutral"
      seed={19}
      roughness={0.6}
      boil={0}
    >
      {label}
    </DrawablyButton>
  );
}
