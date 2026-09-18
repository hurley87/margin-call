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
import { PositionArtwork } from "@/components/positions/position-artwork";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { runManagedTx } from "@/components/protocol/run-managed-tx";
import { TxStatus } from "@/components/protocol/tx-status";
import { Button } from "@/components/ui/button";
import { FlashValue } from "@/components/ui/flash-value";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
import { parseNetworkIdToChainId } from "@/lib/dynamic/resolve-wallet-client";
import {
  STAGE_LABEL,
  artworkPath,
  faceFromStage,
  faceFromStatus,
  resolvePositionStage,
  type PositionStage,
} from "@/lib/positions/artwork";
import { STATUS_LABEL, type PositionListItem } from "@/lib/positions/types";
import { formatStockAmount, formatUsdcRaw } from "@/lib/protocol/amounts";
import {
  isPositionManager,
  isPositionOwner,
} from "@/lib/protocol/authorization";
import { assetLabel } from "@/lib/protocol/deployment";
import { exposureLabel, liveExposure } from "@/lib/protocol/exposure";
import { basescanTxUrl, parseTxHash } from "@/lib/protocol/explorer";
import {
  runClosePositionFlow,
  runRepayAllFlow,
} from "@/lib/protocol/manage-flow";
import {
  createBasePublicClient,
  type BasePublicClient,
} from "@/lib/protocol/public-client";
import { closeReadiness, repayReadiness } from "@/lib/protocol/readiness";
import {
  loadPosition,
  type OpenPosition,
  type PositionView,
} from "@/lib/protocol/reads";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";
import { formatShortAddress } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

function parseTokenId(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
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
  /** Free text: a burned-but-unindexed token has no `PositionStatus` yet. */
  statusLabel: string;
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
        {props.statusLabel}
      </p>
    </header>
  );
}

/** Shared frame so every state renders the NFT at the same size. */
function NftSlot(props: { src: string | null; alt: string }) {
  return (
    <PositionArtwork
      src={props.src}
      alt={props.alt}
      className="max-w-[220px]"
      sizes="220px"
    />
  );
}

/**
 * The one artwork answer for a live Position: a stage the page has not read
 * yet is neutral, and only a named stage earns a stage-suffixed label.
 */
function liveArtwork(assetId: number, stage: PositionStage | null) {
  const label = assetLabel(assetId);
  return {
    src: artworkPath(assetId, faceFromStage(stage)),
    alt:
      stage === null
        ? `${label} Position NFT`
        : `${label} Position NFT — ${STAGE_LABEL[stage]}`,
  };
}

/** The owner's immutable opening note — the same text the NFT description shows. */
function Thesis({ thesis }: { thesis: string }) {
  if (thesis.trim().length === 0) return null;

  return (
    <section className="space-y-1 border-t border-[var(--t-border)] pt-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Thesis
      </h2>
      <p className="whitespace-pre-wrap text-sm leading-6">{thesis}</p>
    </section>
  );
}

function TerminalPosition({ position }: { position: PositionListItem }) {
  const terminalTxHash = parseTxHash(position.terminalTxHash);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        assetId={position.assetId}
        tokenId={position.tokenId}
        statusLabel={STATUS_LABEL[position.status]}
      />
      <NftSlot
        src={artworkPath(position.assetId, faceFromStatus(position.status))}
        alt={`${assetLabel(position.assetId)} Position NFT — ${STATUS_LABEL[position.status]}`}
      />
      <dl className="grid gap-3 border-t border-[var(--t-border)] pt-4 text-sm">
        <Fact label="Owner">{formatShortAddress(position.owner)}</Fact>
      </dl>
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        {position.status === "liquidated"
          ? "This Position NFT was liquidated."
          : "This Position NFT is closed. Stock was returned to the owner."}{" "}
        Live financial state is not available after the token is burned.
      </p>
      {terminalTxHash ? (
        <a
          className="w-fit text-xs text-[var(--t-accent)] underline"
          href={basescanTxUrl(terminalTxHash)}
          target="_blank"
          rel="noreferrer"
        >
          {formatShortAddress(terminalTxHash)}
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

/**
 * Terminal on Base with no indexed reason yet. `closePosition` and `liquidate`
 * both burn the NFT, so claiming either one here would be a guess — the reason
 * arrives from Convex lifecycle events, and until then we only report the end.
 */
function PendingTerminalPosition(props: { assetId: number; tokenId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        assetId={props.assetId}
        tokenId={props.tokenId}
        statusLabel="Position ended"
      />
      {/* Burned, but the reason is not indexed yet, so do not claim liquidated art. */}
      <NftSlot
        src={artworkPath(props.assetId, "neutral")}
        alt={`${assetLabel(props.assetId)} Position NFT`}
      />
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        This Position no longer exists on Base. Waiting for lifecycle indexing…
      </p>
      <Link
        href="/"
        className="w-fit text-xs font-bold uppercase tracking-[0.16em] text-[var(--t-accent)]"
      >
        My Positions
      </Link>
    </div>
  );
}

/** Owner and closing tx from this session's own close receipt. */
type JustClosed = { owner: string; hash: `0x${string}` };

function ActivePosition({ indexed }: { indexed: PositionListItem }) {
  const tokenId = parseTokenId(indexed.tokenId);
  const [publicClient] = useState(() => createBasePublicClient());
  const [view, setView] = useState<PositionView | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [justClosed, setJustClosed] = useState<JustClosed | null>(null);

  useEffect(() => {
    if (tokenId == null) return;
    let cancelled = false;
    void loadPosition(publicClient, tokenId)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setReadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView(null);
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

  // We closed it ourselves, so the reason is known from the receipt, not guessed.
  if (justClosed) {
    return (
      <TerminalPosition
        position={{
          ...indexed,
          owner: justClosed.owner,
          status: "closed",
          terminalTxHash: justClosed.hash,
        }}
      />
    );
  }

  // Burned by someone else while the index lags: terminal, but reason unknown.
  if (view?.status === "burned") {
    return (
      <PendingTerminalPosition
        assetId={indexed.assetId}
        tokenId={indexed.tokenId}
      />
    );
  }

  const live = view?.status === "open" ? view : null;
  const loadError = tokenId == null ? "Not a valid token id." : readError;
  const assetId = live?.assetId ?? indexed.assetId;

  // Live stage artwork needs canonical Base state, which this page already
  // reads for repay/close. Until it arrives, stay neutral rather than guess.
  const stage = live ? resolvePositionStage(live) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        assetId={assetId}
        tokenId={indexed.tokenId}
        statusLabel={STATUS_LABEL.active}
      />
      <NftSlot {...liveArtwork(assetId, stage)} />
      {live ? <Thesis thesis={live.thesis} /> : null}
      {live ? (
        <LiveFacts position={live} />
      ) : loadError ? (
        <p className="text-sm leading-6 text-[var(--t-red)]">
          Couldn&apos;t read live Base state. The index may still show this
          Position as active. {loadError}
        </p>
      ) : (
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Reading Base…
        </p>
      )}
      {live ? (
        <ManageBar
          publicClient={publicClient}
          live={live}
          onClosed={(owner, hash) => setJustClosed({ owner, hash })}
          onRepaid={setView}
        />
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
  const leverage = exposureLabel(
    liveExposure({ nav: position.nav, currentDebt: position.currentDebt })
  );

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
      {leverage ? <Fact label="Leverage">{leverage}</Fact> : null}
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

type ManageProps = {
  publicClient: BasePublicClient;
  live: OpenPosition;
  onClosed: (owner: string, hash: `0x${string}`) => void;
  onRepaid: (next: OpenPosition) => void;
};

/**
 * Decides whether this visitor gets repay/close controls at all.
 * Owner-vs-executor authority stays in the readiness gates.
 */
function ManageBar(props: ManageProps) {
  const session = useWalletSession();
  const { data: accounts = [] } = useGetWalletAccounts();

  if (session.kind !== "connected") {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Connect a wallet to repay or close this Position.
      </p>
    );
  }

  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;
  if (!evmAccount) {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Connect an EVM wallet on Base to manage this Position.
      </p>
    );
  }

  if (
    !isPositionManager(session.address, props.live.owner, props.live.executor)
  ) {
    return (
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Connected wallet is not the owner or executor.
      </p>
    );
  }

  return (
    <ManageActions
      {...props}
      address={session.address}
      accounts={accounts}
      evmAccount={evmAccount}
    />
  );
}

function ManageActions(
  props: ManageProps & {
    address: `0x${string}`;
    accounts: readonly WalletAccount[];
    /** Chain reads are per-account, so this component owns them post-narrowing. */
    evmAccount: WalletAccount;
  }
) {
  const { address, accounts, evmAccount, publicClient, live } = props;
  const syncPositionTx = useSyncPositionTransaction();
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const pending = isTxPending(txPhase);

  const networkQuery = useGetActiveNetworkId({
    walletAccount: evmAccount,
    queryParams: {
      refetchInterval: 4_000,
    },
  });
  const chainId = parseNetworkIdToChainId(networkQuery.data?.networkId);

  const repayGate = repayReadiness({
    chainId,
    currentDebt: live.currentDebt,
    isManager: isPositionManager(address, live.owner, live.executor),
  });
  const closeGate = closeReadiness({
    chainId,
    currentDebt: live.currentDebt,
    isOwner: isPositionOwner(address, live.owner),
  });

  async function handleRepay() {
    const repaid = await runManagedTx({
      label: "Repay all",
      accounts,
      setTxPhase,
      run: (walletClient, onSubmitted) =>
        runRepayAllFlow({
          walletClient,
          publicClient,
          wallet: address,
          tokenId: live.tokenId,
          chainId,
          onSubmitted,
        }),
    });

    // Repayment does not change indexed lifecycle — no Convex sync.
    if (repaid) props.onRepaid(repaid.position);
  }

  async function handleClose() {
    const closed = await runManagedTx({
      label: "Close",
      accounts,
      setTxPhase,
      run: (walletClient, onSubmitted) =>
        runClosePositionFlow({
          walletClient,
          publicClient,
          wallet: address,
          tokenId: live.tokenId,
          chainId,
          onSubmitted,
        }),
    });

    if (!closed) return;
    // Best-effort index — the burn is terminal on Base regardless of Convex.
    void syncPositionTx(closed.hash).catch(() => undefined);
    props.onClosed(live.owner, closed.hash);
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
