"use client";

import { useQuery } from "convex/react";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { getAssetById } from "@/lib/protocol/deployment";
import { formatShortAddress } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const STATUS_LABEL = {
  active: "Active",
  closed: "Closed",
  liquidated: "Liquidated",
} as const;

/** Identity stub for /position/[tokenId]. Live state + actions land in #459. */
export function PositionDetailStub({ tokenId }: { tokenId: string }) {
  const convex = useOptionalConvexClient();

  if (!convex) {
    return (
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          Position
        </h1>
        <p className="text-sm leading-6 text-[var(--t-red)]">
          Position index unavailable. Set{" "}
          <code className="text-[var(--t-text)]">NEXT_PUBLIC_CONVEX_URL</code>.
        </p>
      </div>
    );
  }

  return <PositionDetailBody tokenId={tokenId} />;
}

function PositionDetailBody({ tokenId }: { tokenId: string }) {
  const position = useQuery(api.positions.positionByTokenId, { tokenId });

  if (position === undefined) {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Loading position…
      </p>
    );
  }

  if (position === null) {
    return (
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          Position not found
        </h1>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          No indexed Position NFT for token #{tokenId}.
        </p>
      </div>
    );
  }

  const asset = getAssetById(position.assetId);
  const assetLabel = asset?.name ?? `asset ${position.assetId}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Position
        </p>
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          {assetLabel}
        </h1>
        <p className="text-sm text-[var(--t-muted)]">
          Token #{position.tokenId}
        </p>
      </header>
      <dl className="grid gap-3 border-t border-[var(--t-border)] pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--t-muted)]">Status</dt>
          <dd>{STATUS_LABEL[position.status]}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--t-muted)]">Owner</dt>
          <dd className="font-mono">{formatShortAddress(position.owner)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--t-muted)]">Asset ID</dt>
          <dd>{position.assetId}</dd>
        </div>
      </dl>
      <p className="text-xs leading-5 text-[var(--t-muted)]">
        Live debt, risk, and repay/close actions arrive on this page in a later
        slice. Indexed identity only for now.
      </p>
    </div>
  );
}
