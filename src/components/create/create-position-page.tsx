"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import { MAX_THESIS_BYTES, thesisByteLength } from "@margin-call/shared/thesis";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PositionArtwork } from "@/components/positions/position-artwork";
import { runManagedTx } from "@/components/protocol/run-managed-tx";
import { TxStatus } from "@/components/protocol/tx-status";
import { Button } from "@/components/ui/button";
import { positionArtworkPath } from "@/lib/positions/artwork";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
import { parseNetworkIdToChainId } from "@/lib/dynamic/resolve-wallet-client";
import {
  formatStockAmount,
  formatUsdcRaw,
  parseStockAmount,
} from "@/lib/protocol/amounts";
import {
  DEFAULT_LEVERAGE,
  OPENING_LEVERAGE_PRESETS,
  ORACLE_STATE,
  isFinancedLeverage,
} from "@/lib/protocol/constants";
import {
  baseDeployment,
  getAssetByName,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import { runOpenPositionFlow } from "@/lib/protocol/open-flow";
import { createBasePublicClient } from "@/lib/protocol/public-client";
import { openReadiness } from "@/lib/protocol/readiness";
import { loadOpenSnapshot, type OpenSnapshot } from "@/lib/protocol/reads";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";

/** Dedicated Open Position flow — create only; no repay/close. */
export function CreatePositionPage() {
  const session = useWalletSession();

  switch (session.kind) {
    case "unset":
      return (
        <PageFrame>
          <p className="text-sm leading-6 text-[var(--t-muted)]">
            Connect a wallet to open a Position NFT. Configure Dynamic to enable
            Connect.
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
            Connect a wallet to open a Position NFT.
          </p>
        </PageFrame>
      );
    case "connected":
      return <CreatePositionConnected address={session.address} />;
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

function CreatePositionConnected({ address }: { address: `0x${string}` }) {
  const { data: accounts = [] } = useGetWalletAccounts();
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;

  if (!evmAccount) {
    return (
      <PageFrame>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Connect an EVM wallet on Base to open a Position NFT.
        </p>
      </PageFrame>
    );
  }

  return <CreatePositionForm address={address} evmAccount={evmAccount} />;
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          Open Position
        </h1>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Choose stock, amount, and leverage — then mint a Position NFT on Base.
        </p>
      </header>
      {children}
    </div>
  );
}

function CreatePositionForm(props: {
  address: `0x${string}`;
  evmAccount: WalletAccount;
}) {
  const { address, evmAccount } = props;
  const router = useRouter();
  const { data: accounts = [] } = useGetWalletAccounts();
  const syncPositionTx = useSyncPositionTransaction();

  const networkQuery = useGetActiveNetworkId({
    walletAccount: evmAccount,
    queryParams: {
      refetchInterval: 4_000,
    },
  });
  const chainId = parseNetworkIdToChainId(networkQuery.data?.networkId);

  const [publicClient] = useState(() => createBasePublicClient());
  const [assetName, setAssetName] = useState<LaunchAssetName>("NVDAc");
  const [amountInput, setAmountInput] = useState("0.01");
  const [thesis, setThesis] = useState("");
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [snapshot, setSnapshot] = useState<OpenSnapshot | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const [readError, setReadError] = useState<string | null>(null);
  const snapshotGen = useRef(0);

  const asset = getAssetByName(assetName);
  const stockAmount = parseStockAmount(amountInput);
  const pending = isTxPending(txPhase);

  // The contract measures UTF-8 bytes, so emoji cost more than the count shows.
  const thesisBytes = thesisByteLength(thesis);
  const thesisTooLong = thesisBytes > MAX_THESIS_BYTES;

  const refreshSnapshot = useCallback(async () => {
    const gen = ++snapshotGen.current;
    setSnapshot(null);
    setReadError(null);
    try {
      const next = await loadOpenSnapshot(publicClient, {
        address,
        asset,
        leverage,
        stockAmount,
      });
      if (gen !== snapshotGen.current) return;
      setSnapshot(next);
    } catch (error) {
      if (gen !== snapshotGen.current) return;
      setSnapshot(null);
      setReadError(
        error instanceof Error ? error.message : "Failed to read Base state"
      );
    }
  }, [address, asset, leverage, publicClient, stockAmount]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const readiness = openReadiness({
    chainId,
    stockAmount: stockAmount ?? 0n,
    stockBalance: snapshot?.stockBalance ?? null,
    targetLeverage: leverage,
    oracleState: snapshot?.oracleState ?? null,
    availableCredit: snapshot?.availableCredit ?? null,
    estimatedPrincipal: snapshot?.estimatedPrincipal ?? null,
  });

  const leverageLabel =
    OPENING_LEVERAGE_PRESETS.find((preset) => preset.bps === leverage)?.label ??
    `${leverage / 10_000}x`;

  async function handleOpen() {
    if (stockAmount == null || stockAmount <= 0n) {
      setTxPhase({
        status: "error",
        label: "Open",
        message: "Enter a stock amount greater than zero.",
      });
      return;
    }

    // Guarded here too: the button is disabled, but the contract is the limit.
    if (thesisTooLong) {
      setTxPhase({
        status: "error",
        label: "Open",
        message: `Thesis is ${thesisBytes} bytes; the limit is ${MAX_THESIS_BYTES}.`,
      });
      return;
    }

    const opened = await runManagedTx({
      label: "Open",
      accounts,
      setTxPhase,
      run: (walletClient, onSubmitted) =>
        runOpenPositionFlow({
          walletClient,
          publicClient,
          address,
          asset,
          stockAmount,
          targetLeverage: leverage,
          thesis,
          chainId,
          onSubmitted,
        }),
    });

    if (!opened) {
      void refreshSnapshot();
      return;
    }

    // Best-effort index — Base success is independent of Convex sync.
    void syncPositionTx(opened.hash).catch(() => undefined);
    router.push(`/?opened=${opened.tokenId.toString()}`);
  }

  return (
    <PageFrame>
      <section className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Stock</span>
          <select
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            value={assetName}
            disabled={pending}
            onChange={(event) => {
              const name = event.target.value;
              const next = baseDeployment.assets.find(
                (entry) => entry.name === name
              );
              if (next) setAssetName(next.name);
            }}
          >
            {baseDeployment.assets.map((entry) => (
              <option key={entry.assetId} value={entry.name}>
                {entry.name} (assetId {entry.assetId})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Stock amount</span>
          <input
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            inputMode="decimal"
            value={amountInput}
            disabled={pending}
            onChange={(event) => setAmountInput(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Thesis (optional)</span>
          <textarea
            className="min-h-20 border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            rows={3}
            value={thesis}
            disabled={pending}
            placeholder="Why this position? Recorded on Base, forever."
            aria-describedby="thesis-budget"
            aria-invalid={thesisTooLong || undefined}
            onChange={(event) => setThesis(event.target.value)}
          />
          <span
            id="thesis-budget"
            className={
              thesisTooLong ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
            }
          >
            {thesisBytes}/{MAX_THESIS_BYTES} bytes
            {thesisTooLong ? " — too long to mint" : ""}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Leverage</span>
          <select
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            value={leverage}
            disabled={pending}
            onChange={(event) => setLeverage(Number(event.target.value))}
          >
            {OPENING_LEVERAGE_PRESETS.map((preset) => (
              <option key={preset.bps} value={preset.bps}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        {/* Every open mints healthy by construction: leverage checks pass first. */}
        <PositionArtwork
          src={positionArtworkPath(asset.assetId, "healthy")}
          alt={`${assetName} Position NFT preview`}
          className="max-w-[180px]"
          sizes="180px"
        />

        <div className="space-y-1 border border-[var(--t-border)] px-3 py-3 text-xs text-[var(--t-muted)]">
          <p>
            Preview: {assetName} ·{" "}
            {stockAmount != null ? formatStockAmount(stockAmount) : "—"} ·{" "}
            {leverageLabel}
          </p>
          <p>
            Balance:{" "}
            {snapshot == null ? "—" : formatStockAmount(snapshot.stockBalance)}{" "}
            {assetName}
          </p>
          <p>
            Allowance:{" "}
            {snapshot == null
              ? "—"
              : formatStockAmount(snapshot.stockAllowance)}
          </p>
          {isFinancedLeverage(leverage) ? (
            <>
              <p>
                Oracle:{" "}
                {snapshot?.oracleState == null
                  ? "—"
                  : snapshot.oracleState === ORACLE_STATE.LIVE
                    ? "LIVE"
                    : snapshot.oracleState === ORACLE_STATE.HELD
                      ? "HELD"
                      : "INVALID"}
              </p>
              <p>
                Est. principal:{" "}
                {snapshot?.estimatedPrincipal == null
                  ? "—"
                  : `${formatUsdcRaw(snapshot.estimatedPrincipal)} USDC`}
              </p>
              <p>
                Available credit:{" "}
                {snapshot == null
                  ? "—"
                  : `${formatUsdcRaw(snapshot.availableCredit)} USDC`}
              </p>
            </>
          ) : (
            <p>Spot open — no CreditPool draw.</p>
          )}
          <p>
            Readiness:{" "}
            {readiness.ok ? (
              <span className="text-[var(--t-green)]">ready</span>
            ) : (
              <span className="text-[var(--t-amber)]">{readiness.reason}</span>
            )}
          </p>
          {readError ? (
            <p className="text-[var(--t-red)]">{readError}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              pending ||
              !readiness.ok ||
              stockAmount == null ||
              stockAmount <= 0n ||
              thesisTooLong
            }
            onClick={() => void handleOpen()}
          >
            Open
          </Button>
        </div>

        <TxStatus phase={txPhase} />
      </section>
    </PageFrame>
  );
}
