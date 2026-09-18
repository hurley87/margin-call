"use client";

import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import {
  IndexUnavailable,
  PAGE_SIZE,
  PositionList,
  PositionQueryBoundary,
} from "@/components/positions/position-list";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import type { AllPositionsFilter, PositionStatus } from "@/lib/positions/types";
import { baseDeployment } from "@/lib/protocol/deployment";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

/** Public protocol explorer backed by the Convex Position read model. */
export function AllPositionsPage() {
  const convex = useOptionalConvexClient();
  const [filter, setFilter] = useState<AllPositionsFilter>({});

  if (!convex) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader />
        <IndexUnavailable purpose="to browse protocol positions." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <Filters filter={filter} onChange={setFilter} />
      <PositionQueryBoundary>
        <AllPositionsList queryArgs={filter} />
      </PositionQueryBoundary>
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
    <PositionList
      results={results}
      status={status}
      loadMore={loadMore}
      showOwner
      emptyMessage="No positions match these filters."
    />
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
    <div className="flex flex-col gap-4 border-t border-[var(--t-border)] pt-4">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Status
        </p>
        <div className="flex flex-wrap gap-1">
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
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Asset
        </p>
        <div className="flex flex-wrap gap-1">
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
          <p className="text-xs text-[var(--t-muted)]">
            Choose a status to filter by asset.
          </p>
        ) : null}
      </div>
    </div>
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]",
        disabled
          ? "cursor-not-allowed border border-transparent text-[var(--t-muted)] opacity-40"
          : selected
            ? "border border-[var(--t-accent)] text-[var(--t-accent)]"
            : "border border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]"
      )}
    >
      {label}
    </button>
  );
}
