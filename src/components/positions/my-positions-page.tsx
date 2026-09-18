"use client";

import {
  useGetWalletAccounts,
  useInitStatus,
} from "@dynamic-labs-sdk/react-hooks";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { PositionCard } from "@/components/positions/position-card";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDynamicReady } from "@/components/wallet/wallet-providers";
import { getEvmWalletAddress } from "@/lib/dynamic/wallet";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const PAGE_SIZE = 20;

/** Homepage: positions owned by the connected wallet. */
export function MyPositionsPage() {
  const hasDynamic = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);
  const convex = useOptionalConvexClient();
  const dynamicReady = useDynamicReady();

  if (!hasDynamic) {
    return (
      <PageFrame>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Connect a wallet to see your Position NFTs. Configure Dynamic to
          enable Connect.
        </p>
      </PageFrame>
    );
  }

  if (!dynamicReady) {
    return (
      <PageFrame>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Connecting wallet…
        </p>
      </PageFrame>
    );
  }

  return <MyPositionsConnected convexReady={convex != null} />;
}

function MyPositionsConnected({ convexReady }: { convexReady: boolean }) {
  const { data: initStatus } = useInitStatus();
  const { data: accounts = [] } = useGetWalletAccounts();
  const address = getEvmWalletAddress(accounts);

  if (initStatus !== "finished") {
    return (
      <PageFrame>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Connecting wallet…
        </p>
      </PageFrame>
    );
  }

  if (!address) {
    return (
      <PageFrame>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Connect a wallet to see your Position NFTs.
        </p>
      </PageFrame>
    );
  }

  if (!convexReady) {
    return (
      <PageFrame cta>
        <p className="text-sm leading-6 text-[var(--t-red)]">
          Position index unavailable. Set{" "}
          <code className="text-[var(--t-text)]">NEXT_PUBLIC_CONVEX_URL</code>{" "}
          to load your portfolio.
        </p>
      </PageFrame>
    );
  }

  return <MyPositionsList owner={address} />;
}

function MyPositionsList({ owner }: { owner: `0x${string}` }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.positions.positionsByOwner,
    { owner, status: "active" },
    { initialNumItems: PAGE_SIZE }
  );

  if (status === "LoadingFirstPage") {
    return (
      <PageFrame cta>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Loading positions…
        </p>
      </PageFrame>
    );
  }

  if (results.length === 0) {
    return (
      <PageFrame cta>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          You don&apos;t have any positions yet.
        </p>
      </PageFrame>
    );
  }

  return (
    <PageFrame cta>
      <ul className="flex flex-col gap-2">
        {results.map((position) => (
          <li key={position.tokenId}>
            <PositionCard
              tokenId={position.tokenId}
              assetId={position.assetId}
              status={position.status}
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
    </PageFrame>
  );
}

function PageFrame({
  children,
  cta = false,
}: {
  children: React.ReactNode;
  cta?: boolean;
}) {
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
      {cta ? <OpenPositionCta /> : null}
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
