"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  IndexUnavailable,
  PAGE_SIZE,
  PositionList,
  PositionQueryBoundary,
} from "@/components/positions/position-list";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { buttonVariants } from "@/components/ui/button";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

type MyPositionsPageProps = {
  /** `?opened=` UX hint from a successful create — not authoritative state. */
  openedTokenId?: string;
};

/** Digits-only token ids; anything else is ignored. */
function parseOpenedTokenId(value: string | undefined): string | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  return value;
}

/** Homepage: positions owned by the connected wallet. */
export function MyPositionsPage({ openedTokenId }: MyPositionsPageProps) {
  const session = useWalletSession();

  switch (session.kind) {
    case "unset":
      return (
        <PageFrame>
          <p className="text-sm leading-6 text-[var(--t-muted)]">
            Connect a wallet to see your Position NFTs. Configure Dynamic to
            enable Connect.
          </p>
        </PageFrame>
      );
    case "hydrating":
      return (
        <PageFrame>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Connecting wallet…
          </p>
        </PageFrame>
      );
    case "failed":
      return (
        <PageFrame>
          <p className="text-sm leading-6 text-[var(--t-muted)]">
            {session.message}
          </p>
        </PageFrame>
      );
    case "disconnected":
      return (
        <PageFrame>
          <p className="text-sm leading-6 text-[var(--t-muted)]">
            Connect a wallet to see your Position NFTs.
          </p>
        </PageFrame>
      );
    case "connected":
      return (
        <MyPositionsList
          owner={session.address}
          openedTokenId={openedTokenId}
        />
      );
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

function MyPositionsList({
  owner,
  openedTokenId,
}: {
  owner: `0x${string}`;
  openedTokenId?: string;
}) {
  const convex = useOptionalConvexClient();

  if (!convex) {
    return (
      <PageFrame>
        <IndexUnavailable purpose="to load your portfolio." />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PositionQueryBoundary>
        <MyPositionsQuery owner={owner} openedTokenId={openedTokenId} />
      </PositionQueryBoundary>
    </PageFrame>
  );
}

function MyPositionsQuery({
  owner,
  openedTokenId: openedRaw,
}: {
  owner: `0x${string}`;
  openedTokenId?: string;
}) {
  const openedTokenId = parseOpenedTokenId(openedRaw);
  const { results, status, loadMore } = usePaginatedQuery(
    api.positions.positionsByOwner,
    { owner, status: "active" },
    { initialNumItems: PAGE_SIZE }
  );

  const openedIsPresent =
    openedTokenId != null &&
    results.some((position) => position.tokenId === openedTokenId);
  const isIndexing =
    openedTokenId != null && status !== "LoadingFirstPage" && !openedIsPresent;

  const list = (
    <PositionList
      results={results}
      status={status}
      loadMore={loadMore}
      emptyMessage="You don't have any positions yet."
      highlightedTokenId={
        openedIsPresent && openedTokenId ? openedTokenId : undefined
      }
    />
  );

  if (!isIndexing) {
    return list;
  }

  const indexingNote = (
    <p className="text-sm leading-6 text-[var(--t-muted)]">
      Indexing Position #{openedTokenId}…
    </p>
  );

  if (results.length === 0) {
    return indexingNote;
  }

  return (
    <div className="flex flex-col gap-3">
      {indexingNote}
      {list}
    </div>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          My Positions
        </h1>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Position NFTs currently owned by your connected wallet.
        </p>
      </header>
      <OpenPositionCta />
      {children}
    </div>
  );
}

function OpenPositionCta() {
  return (
    <Link
      href="/create"
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "w-fit"
      )}
    >
      + Open Position
    </Link>
  );
}
