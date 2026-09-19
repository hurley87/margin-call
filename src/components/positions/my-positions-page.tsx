"use client";

import { usePaginatedQuery } from "convex/react";
import type { ReactNode } from "react";
import {
  IndexUnavailable,
  PositionGallery,
  PositionQueryBoundary,
} from "@/components/positions/position-gallery";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import {
  PortfolioActions,
  PortfolioWelcome,
} from "@/components/positions/portfolio-welcome";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { PAGE_SIZE } from "@/lib/positions/types";
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
      return <PortfolioWelcome />;
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
    <PositionQueryBoundary key={owner}>
      <MyPositionsQuery owner={owner} openedTokenId={openedTokenId} />
    </PositionQueryBoundary>
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

  if (status === "Exhausted" && results.length === 0 && !isIndexing) {
    return <PortfolioWelcome empty />;
  }

  return (
    <PageFrame>
      {isIndexing ? (
        <p role="status" className="text-[var(--t-muted)]">
          Indexing Position #{openedTokenId}…
        </p>
      ) : null}
      {!(isIndexing && results.length === 0) ? (
        <PositionGallery
          results={results}
          status={status}
          loadMore={loadMore}
          emptyMessage="Loading your portfolio…"
          showOwner={false}
          highlightedTokenId={
            openedIsPresent && openedTokenId ? openedTokenId : undefined
          }
        />
      ) : null}
    </PageFrame>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="portfolio-content">
      <header className="portfolio-content-heading">
        <div>
          <h1>Your portfolio</h1>
          <p>Position NFTs currently owned by your connected wallet.</p>
        </div>
        <PortfolioActions />
      </header>
      {children}
    </div>
  );
}
