"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import { useQuery } from "convex/react";
import { DrawablyButton, DrawablyCard } from "drawably/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PositionArtwork } from "@/components/positions/position-artwork";
import {
  IndexUnavailable,
  PositionQueryBoundary,
} from "@/components/positions/position-gallery";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { runManagedTx } from "@/components/protocol/run-managed-tx";
import { TxStatus } from "@/components/protocol/tx-status";
import { FlashValue } from "@/components/ui/flash-value";
import { SKETCH, SURFACE_SKETCH } from "@/components/ui/sketch";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
import { parseNetworkIdToChainId } from "@/lib/dynamic/resolve-wallet-client";
import {
  STAGE_LABEL,
  artworkPath,
  faceFromStatus,
  marketplaceFace,
  resolvePositionStage,
  type ArtworkFace,
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
  return (
    <div className="position-detail">
      <Link href="/" className="position-back">
        ← Back to portfolio
      </Link>
      <PositionDetailContent tokenId={tokenId} />
    </div>
  );
}

/** Paper frame for the page's one-line states: loading, unindexed, unavailable. */
function NoticeCard({ children }: { children: ReactNode }) {
  return (
    <DrawablyCard className="position-notice" seed={31} {...SURFACE_SKETCH}>
      {children}
    </DrawablyCard>
  );
}

/** The right-hand column: facts, manage controls, and the thesis. */
function InformationCard({ children }: { children: ReactNode }) {
  return (
    <DrawablyCard
      className="position-information"
      seed={31}
      {...SURFACE_SKETCH}
    >
      {children}
    </DrawablyCard>
  );
}

function PositionDetailContent({ tokenId }: { tokenId: string }) {
  const convex = useOptionalConvexClient();

  if (!convex) {
    return <IndexUnavailable purpose="to load this Position." />;
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
      <NoticeCard>
        <p role="status">Loading position…</p>
      </NoticeCard>
    );
  }

  if (position === null) {
    return (
      <NoticeCard>
        <h1 className="position-title">Position</h1>
        <p className="position-muted">
          Token #{tokenId} is not in the index yet. If you just opened it, wait
          for receipt sync.
        </p>
      </NoticeCard>
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
  stage?: PositionStage | null;
}) {
  return (
    <header className="position-heading">
      <p className="position-label">Position</p>
      <h1 className="position-title">{assetLabel(props.assetId)}</h1>
      <div className="position-identity-meta">
        <p className="position-label">Token #{props.tokenId}</p>
        <span className="position-status">{props.statusLabel}</span>
        {props.stage ? (
          <span className="stage-chip" data-health={props.stage}>
            {STAGE_LABEL[props.stage]}
          </span>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Shared frame so every state renders the NFT at the same size.
 *
 * `face` is the published file, so the ticker logo gets the small centered
 * slot and any dog fills the tile.
 */
function NftSlot(props: {
  src: string | null;
  alt: string;
  face: ArtworkFace;
}) {
  return (
    <DrawablyCard className="position-art-card" seed={29} {...SURFACE_SKETCH}>
      <div
        className={`position-art${props.face === "neutral" ? " position-art-neutral" : ""}`}
      >
        <PositionArtwork
          src={props.src}
          alt={props.alt}
          sizes="(max-width: 800px) 90vw, 460px"
        />
      </div>
    </DrawablyCard>
  );
}

/**
 * The one artwork answer for a live Position: a stage the page has not read
 * yet is neutral, and only a named stage earns a stage-suffixed label.
 */
function liveArtwork(assetId: number, stage: PositionStage | null) {
  const label = assetLabel(assetId);
  const face: ArtworkFace = stage === null ? "neutral" : marketplaceFace(stage);
  return {
    src: artworkPath(assetId, face),
    alt:
      stage === null
        ? `${label} Position NFT`
        : `${label} Position NFT — ${STAGE_LABEL[stage]}`,
    face,
  };
}

/** The owner's immutable opening note — the same text the NFT description shows. */
function Thesis({ thesis }: { thesis: string }) {
  if (thesis.trim().length === 0) return null;

  return (
    <section className="position-thesis">
      <h2 className="position-label">Thesis</h2>
      <p className="position-thesis-body">{thesis}</p>
    </section>
  );
}

function TerminalPosition({ position }: { position: PositionListItem }) {
  const terminalTxHash = parseTxHash(position.terminalTxHash);
  const face = faceFromStatus(position.status);

  return (
    <div className="position-layout">
      <PageHeader
        assetId={position.assetId}
        tokenId={position.tokenId}
        statusLabel={STATUS_LABEL[position.status]}
      />
      <NftSlot
        src={artworkPath(position.assetId, face)}
        alt={`${assetLabel(position.assetId)} Position NFT — ${STATUS_LABEL[position.status]}`}
        face={face}
      />
      <InformationCard>
        <dl>
          <Fact label="Owner">{formatShortAddress(position.owner)}</Fact>
        </dl>
        <p className="position-muted">
          {position.status === "liquidated"
            ? "This Position NFT was liquidated."
            : "This Position NFT is closed. Stock was returned to the owner."}{" "}
          Live financial state is not available after the token is burned.
        </p>
        {terminalTxHash ? (
          <a
            className="position-link"
            href={basescanTxUrl(terminalTxHash)}
            target="_blank"
            rel="noreferrer"
          >
            {formatShortAddress(terminalTxHash)}
          </a>
        ) : null}
        <Link href="/" className="position-link">
          My Positions
        </Link>
      </InformationCard>
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
    <div className="position-layout">
      <PageHeader
        assetId={props.assetId}
        tokenId={props.tokenId}
        statusLabel="Position ended"
      />
      {/* Burned, but the reason is not indexed yet, so do not claim liquidated art. */}
      <NftSlot
        src={artworkPath(props.assetId, "neutral")}
        alt={`${assetLabel(props.assetId)} Position NFT`}
        face="neutral"
      />
      <InformationCard>
        <p className="position-muted">
          This Position no longer exists on Base. Waiting for lifecycle
          indexing…
        </p>
        <Link href="/" className="position-link">
          My Positions
        </Link>
      </InformationCard>
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
    <div className="position-layout">
      <PageHeader
        assetId={assetId}
        tokenId={indexed.tokenId}
        statusLabel={STATUS_LABEL.active}
        stage={stage}
      />
      <NftSlot {...liveArtwork(assetId, stage)} />
      <InformationCard>
        {live ? (
          <LiveFacts position={live} />
        ) : loadError ? (
          <p className="position-alert">
            Couldn&apos;t read live Base state. The index may still show this
            Position as active. {loadError}
          </p>
        ) : (
          <p className="position-muted">Reading Base…</p>
        )}
        {live ? (
          <ManageBar
            publicClient={publicClient}
            live={live}
            onClosed={(owner, hash) => setJustClosed({ owner, hash })}
            onRepaid={setView}
          />
        ) : null}
        {live ? <Thesis thesis={live.thesis} /> : null}
      </InformationCard>
    </div>
  );
}

function Fact(props: { label: string; children: ReactNode }) {
  return (
    <div className="position-fact">
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function LiveFacts({ position }: { position: OpenPosition }) {
  const leverage = exposureLabel(
    liveExposure({ nav: position.nav, currentDebt: position.currentDebt })
  );

  return (
    <dl>
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
      <p className="position-muted">
        Connect a wallet to repay or close this Position.
      </p>
    );
  }

  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;
  if (!evmAccount) {
    return (
      <p className="position-muted">
        Connect an EVM wallet on Base to manage this Position.
      </p>
    );
  }

  if (
    !isPositionManager(session.address, props.live.owner, props.live.executor)
  ) {
    return (
      <p className="position-muted">
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
    <section className="position-manage">
      <div className="position-actions">
        <DrawablyButton
          variant="solid"
          type="button"
          {...SKETCH}
          seed={32}
          disabled={pending || !repayGate.ok}
          onClick={() => void handleRepay()}
        >
          Repay all
        </DrawablyButton>
        <DrawablyButton
          variant="solid"
          type="button"
          {...SKETCH}
          seed={32}
          disabled={pending || !closeGate.ok}
          onClick={() => void handleClose()}
        >
          Close
        </DrawablyButton>
      </div>
      {!repayGate.ok ? (
        <p className="position-muted">{repayGate.reason}</p>
      ) : null}
      {!closeGate.ok &&
      (repayGate.ok || closeGate.reason !== repayGate.reason) ? (
        <p className="position-muted">{closeGate.reason}</p>
      ) : null}
      <div aria-live="polite">
        <TxStatus phase={txPhase} />
      </div>
    </section>
  );
}
