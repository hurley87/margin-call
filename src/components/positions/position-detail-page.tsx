"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  IndexUnavailable,
  PositionQueryBoundary,
} from "@/components/positions/position-list";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { Button } from "@/components/ui/button";
import { FlashValue } from "@/components/ui/flash-value";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
import {
  parseNetworkIdToChainId,
  resolveBaseWalletClient,
} from "@/lib/dynamic/resolve-wallet-client";
import { STATUS_LABEL, type PositionStatus } from "@/lib/positions/types";
import { formatStockAmount, formatUsdcRaw } from "@/lib/protocol/amounts";
import {
  isPositionManager,
  isPositionOwner,
} from "@/lib/protocol/authorization";
import { assetLabel } from "@/lib/protocol/deployment";
import { liveExposure } from "@/lib/protocol/exposure";
import { basescanTxUrl } from "@/lib/protocol/explorer";
import {
  runClosePositionFlow,
  runRepayAllFlow,
} from "@/lib/protocol/manage-flow";
import { createBasePublicClient } from "@/lib/protocol/public-client";
import { closeReadiness, repayReadiness } from "@/lib/protocol/readiness";
import { loadPosition, type OpenPosition } from "@/lib/protocol/reads";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";
import { ProtocolTxError } from "@/lib/protocol/writes";
import { formatShortAddress } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

type IndexedPosition = {
  tokenId: string;
  assetId: number;
  owner: string;
  status: PositionStatus;
  terminalTxHash?: string;
};

function parseTokenId(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function TxStatus({ phase }: { phase: TxPhase }) {
  switch (phase.status) {
    case "idle":
      return null;
    case "awaiting-signature":
      return (
        <p className="text-xs text-[var(--t-muted)]">
          Awaiting wallet signature… ({phase.label})
        </p>
      );
    case "submitted":
    case "confirmed":
      return (
        <p className="text-xs text-[var(--t-muted)]">
          {phase.status === "submitted" ? "Submitted" : "Confirmed"}:{" "}
          <a
            className="text-[var(--t-accent)] underline"
            href={basescanTxUrl(phase.hash)}
            target="_blank"
            rel="noreferrer"
          >
            {formatShortAddress(phase.hash)}
          </a>{" "}
          ({phase.label})
        </p>
      );
    case "error":
      return (
        <p className="text-xs text-[var(--t-red)]">
          {phase.label}: {phase.message}
          {phase.hash ? (
            <>
              {" "}
              <a
                className="underline"
                href={basescanTxUrl(phase.hash)}
                target="_blank"
                rel="noreferrer"
              >
                {formatShortAddress(phase.hash)}
              </a>
            </>
          ) : null}
        </p>
      );
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

/** Canonical Position NFT management surface — live Base state + repay/close. */
export function PositionDetailPage({ tokenId }: { tokenId: string }) {
  const convex = useOptionalConvexClient();

  if (!convex) {
    return (
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          Position
        </h1>
        <IndexUnavailable purpose="to load this Position." />
      </div>
    );
  }

  return (
    <PositionQueryBoundary>
      <PositionDetailBody tokenId={tokenId} />
    </PositionQueryBoundary>
  );
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
          Position
        </h1>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Token #{tokenId} is not in the index yet. If you just opened it, wait
          for receipt sync.
        </p>
      </div>
    );
  }

  if (position.status === "closed" || position.status === "liquidated") {
    return <TerminalPosition position={position} />;
  }

  return <ActivePosition indexed={position} />;
}

function PageHeader(props: {
  assetId: number;
  tokenId: string;
  status: PositionStatus;
}) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Position
      </p>
      <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
        {assetLabel(props.assetId)}
      </h1>
      <p className="text-sm text-[var(--t-muted)]">Token #{props.tokenId}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-muted)]">
        {STATUS_LABEL[props.status]}
      </p>
    </header>
  );
}

function NftSlot() {
  return (
    <div
      aria-hidden
      className="aspect-square w-full max-w-[220px] border border-dashed border-[var(--t-border)]"
    />
  );
}

function TerminalPosition({ position }: { position: IndexedPosition }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        assetId={position.assetId}
        tokenId={position.tokenId}
        status={position.status}
      />
      <NftSlot />
      <dl className="grid gap-3 border-t border-[var(--t-border)] pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--t-muted)]">Owner</dt>
          <dd className="font-mono">{formatShortAddress(position.owner)}</dd>
        </div>
      </dl>
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        {position.status === "closed"
          ? "This Position NFT is closed. Stock was returned to the owner."
          : "This Position NFT was liquidated."}{" "}
        Live financial state is not available after the token is burned.
      </p>
      {position.terminalTxHash ? (
        <a
          className="w-fit text-xs text-[var(--t-accent)] underline"
          href={basescanTxUrl(position.terminalTxHash as `0x${string}`)}
          target="_blank"
          rel="noreferrer"
        >
          {formatShortAddress(position.terminalTxHash)}
        </a>
      ) : null}
      <Link
        href="/"
        className="w-fit text-xs font-bold uppercase tracking-[0.16em] text-[var(--t-accent)]"
      >
        My Positions
      </Link>
    </div>
  );
}

function ActivePosition({ indexed }: { indexed: IndexedPosition }) {
  const [locallyClosed, setLocallyClosed] = useState(false);
  const [closedOwner, setClosedOwner] = useState(indexed.owner);
  const [closedTxHash, setClosedTxHash] = useState<string | undefined>(
    indexed.terminalTxHash
  );

  if (locallyClosed) {
    return (
      <TerminalPosition
        position={{
          ...indexed,
          owner: closedOwner,
          status: "closed",
          terminalTxHash: closedTxHash,
        }}
      />
    );
  }

  return (
    <ActivePositionLive
      indexed={indexed}
      onClosed={(owner, hash) => {
        setClosedOwner(owner);
        setClosedTxHash(hash);
        setLocallyClosed(true);
      }}
    />
  );
}

function ActivePositionLive(props: {
  indexed: IndexedPosition;
  onClosed: (owner: string, hash: `0x${string}`) => void;
}) {
  const { indexed, onClosed } = props;
  const tokenId = parseTokenId(indexed.tokenId);
  const [publicClient] = useState(() => createBasePublicClient());
  const [live, setLive] = useState<OpenPosition | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenId == null) return;
    let cancelled = false;
    void loadPosition(publicClient, tokenId)
      .then((next) => {
        if (cancelled) return;
        setLive(next);
        setReadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLive(null);
        setReadError(
          error instanceof Error
            ? error.message
            : "Couldn't read live Base state."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, tokenId]);

  const assetId = live?.assetId ?? indexed.assetId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader assetId={assetId} tokenId={indexed.tokenId} status="active" />
      <NftSlot />
      {live ? (
        <LiveFacts position={live} />
      ) : readError ? (
        <p className="text-sm leading-6 text-[var(--t-red)]">
          Couldn&apos;t read live Base state. The index may still show this
          Position as active. {readError}
        </p>
      ) : (
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Reading Base…
        </p>
      )}
      {live ? (
        <ManageBar live={live} onClosed={onClosed} onRepaid={setLive} />
      ) : null}
    </div>
  );
}

function Fact(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--t-muted)]">{props.label}</dt>
      <dd className="font-mono">{props.children}</dd>
    </div>
  );
}

function LiveFacts({ position }: { position: OpenPosition }) {
  const exposure = liveExposure({
    nav: position.nav,
    currentDebt: position.currentDebt,
  });

  return (
    <dl className="grid gap-3 border-t border-[var(--t-border)] pt-4 text-sm">
      <Fact label="Owner">{formatShortAddress(position.owner)}</Fact>
      <Fact label="Stock">{formatStockAmount(position.stockAmount)}</Fact>
      <Fact label="Current debt">
        <FlashValue value={position.currentDebt}>
          {formatUsdcRaw(position.currentDebt)} USDC
        </FlashValue>
      </Fact>
      <Fact label="Recorded principal">
        {formatUsdcRaw(position.principal)} USDC
      </Fact>
      {exposure.kind === "unlevered" || exposure.kind === "levered" ? (
        <Fact label="Leverage">{exposure.label}</Fact>
      ) : exposure.kind === "equity-exhausted" ? (
        <Fact label="Leverage">Equity exhausted</Fact>
      ) : null}
      <Fact label="NAV">
        {position.nav == null
          ? "Pricing unavailable"
          : `${formatUsdcRaw(position.nav)} USDC`}
      </Fact>
      {position.liquidatable == null ? null : (
        <Fact label="Liquidatable">{position.liquidatable ? "Yes" : "No"}</Fact>
      )}
    </dl>
  );
}

function ManageBar(props: {
  live: OpenPosition;
  onClosed: (owner: string, hash: `0x${string}`) => void;
  onRepaid: (next: OpenPosition) => void;
}) {
  const session = useWalletSession();

  switch (session.kind) {
    case "connected":
      return (
        <ManageConnected
          address={session.address}
          live={props.live}
          onClosed={props.onClosed}
          onRepaid={props.onRepaid}
        />
      );
    case "disconnected":
    case "unset":
    case "hydrating":
    case "failed":
      return (
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Connect a wallet to repay or close this Position.
        </p>
      );
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

function ManageConnected(props: {
  address: `0x${string}`;
  live: OpenPosition;
  onClosed: (owner: string, hash: `0x${string}`) => void;
  onRepaid: (next: OpenPosition) => void;
}) {
  const { data: accounts = [] } = useGetWalletAccounts();
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;

  if (!evmAccount) {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Connect an EVM wallet on Base to manage this Position.
      </p>
    );
  }

  const isManager = isPositionManager(
    props.address,
    props.live.owner,
    props.live.executor
  );
  const isOwner = isPositionOwner(props.address, props.live.owner);

  if (!isManager && !isOwner) {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Connected wallet is not the owner or executor.
      </p>
    );
  }

  return (
    <ManageActions
      address={props.address}
      evmAccount={evmAccount}
      live={props.live}
      onClosed={props.onClosed}
      onRepaid={props.onRepaid}
    />
  );
}

function ManageActions(props: {
  address: `0x${string}`;
  evmAccount: WalletAccount;
  live: OpenPosition;
  onClosed: (owner: string, hash: `0x${string}`) => void;
  onRepaid: (next: OpenPosition) => void;
}) {
  const { address, evmAccount, live, onClosed, onRepaid } = props;
  const { data: accounts = [] } = useGetWalletAccounts();
  const syncPositionTx = useSyncPositionTransaction();
  const [publicClient] = useState(() => createBasePublicClient());
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const pending = isTxPending(txPhase);

  const networkQuery = useGetActiveNetworkId({
    walletAccount: evmAccount,
    queryParams: {
      refetchInterval: 4_000,
    },
  });
  const chainId = parseNetworkIdToChainId(networkQuery.data?.networkId);

  const isManager = isPositionManager(address, live.owner, live.executor);
  const isOwner = isPositionOwner(address, live.owner);
  const repayGate = repayReadiness({
    chainId,
    currentDebt: live.currentDebt,
    positionExists: true,
    isManager,
  });
  const closeGate = closeReadiness({
    chainId,
    currentDebt: live.currentDebt,
    positionExists: true,
    isOwner,
  });

  async function handleRepay() {
    const walletClient = resolveBaseWalletClient(accounts);
    if (!walletClient) {
      setTxPhase({
        status: "error",
        label: "Repay all",
        message: "No Base wallet client. Reconnect an EVM wallet.",
      });
      return;
    }

    let submittedHash: `0x${string}` | undefined;
    try {
      setTxPhase({ status: "awaiting-signature", label: "Repay all" });
      const next = await runRepayAllFlow({
        walletClient,
        publicClient,
        wallet: address,
        tokenId: live.tokenId,
        chainId,
        onSubmitted: (hash, label) => {
          submittedHash = hash;
          setTxPhase({ status: "submitted", label, hash });
        },
      });
      if (submittedHash) {
        setTxPhase({
          status: "confirmed",
          label: "Repay all",
          hash: submittedHash,
        });
      } else {
        setTxPhase({ status: "idle" });
      }
      onRepaid(next);
    } catch (error) {
      const hash =
        error instanceof ProtocolTxError ? error.hash : submittedHash;
      setTxPhase({
        status: "error",
        label: "Repay all",
        message: error instanceof Error ? error.message : "Repay failed",
        ...(hash ? { hash } : {}),
      });
    }
  }

  async function handleClose() {
    const walletClient = resolveBaseWalletClient(accounts);
    if (!walletClient) {
      setTxPhase({
        status: "error",
        label: "Close",
        message: "No Base wallet client. Reconnect an EVM wallet.",
      });
      return;
    }

    let submittedHash: `0x${string}` | undefined;
    try {
      setTxPhase({ status: "awaiting-signature", label: "Close" });
      const closed = await runClosePositionFlow({
        walletClient,
        publicClient,
        wallet: address,
        tokenId: live.tokenId,
        chainId,
        onSubmitted: (hash, label) => {
          submittedHash = hash;
          setTxPhase({ status: "submitted", label, hash });
        },
      });
      setTxPhase({
        status: "confirmed",
        label: "Close position",
        hash: closed.hash,
      });
      void syncPositionTx(closed.hash).catch(() => undefined);
      onClosed(live.owner, closed.hash);
    } catch (error) {
      const hash =
        error instanceof ProtocolTxError ? error.hash : submittedHash;
      setTxPhase({
        status: "error",
        label: "Close",
        message: error instanceof Error ? error.message : "Close failed",
        ...(hash ? { hash } : {}),
      });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !repayGate.ok}
          onClick={() => void handleRepay()}
        >
          Repay all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !closeGate.ok}
          onClick={() => void handleClose()}
        >
          Close
        </Button>
      </div>
      {!repayGate.ok ? (
        <p className="text-xs text-[var(--t-muted)]">{repayGate.reason}</p>
      ) : null}
      {!closeGate.ok ? (
        <p className="text-xs text-[var(--t-muted)]">{closeGate.reason}</p>
      ) : null}
      <TxStatus phase={txPhase} />
    </section>
  );
}
