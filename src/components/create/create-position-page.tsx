"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
import {
  parseNetworkIdToChainId,
  resolveBaseWalletClient,
} from "@/lib/dynamic/resolve-wallet-client";
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
import { basescanTxUrl } from "@/lib/protocol/explorer";
import { runOpenPositionFlow } from "@/lib/protocol/open-flow";
import { createBasePublicClient } from "@/lib/protocol/public-client";
import { openReadiness } from "@/lib/protocol/readiness";
import { loadOpenSnapshot, type OpenSnapshot } from "@/lib/protocol/reads";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";
import { ProtocolTxError } from "@/lib/protocol/writes";
import { formatShortAddress } from "@/lib/utils";

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
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [snapshot, setSnapshot] = useState<OpenSnapshot | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const [readError, setReadError] = useState<string | null>(null);
  const snapshotGen = useRef(0);

  const asset = getAssetByName(assetName);
  const stockAmount = parseStockAmount(amountInput);
  const pending = isTxPending(txPhase);

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

    const walletClient = resolveBaseWalletClient(accounts);
    if (!walletClient) {
      setTxPhase({
        status: "error",
        label: "Open",
        message: "No Base wallet client. Reconnect an EVM wallet.",
      });
      return;
    }

    let submittedHash: `0x${string}` | undefined;
    try {
      setTxPhase({ status: "awaiting-signature", label: "Open" });
      const opened = await runOpenPositionFlow({
        walletClient,
        publicClient,
        address,
        asset,
        stockAmount,
        targetLeverage: leverage,
        chainId,
        onSubmitted: (txHash, phaseLabel) => {
          submittedHash = txHash;
          setTxPhase({
            status: "submitted",
            label: phaseLabel,
            hash: txHash,
          });
        },
      });

      setTxPhase({
        status: "confirmed",
        label: "Open position",
        hash: opened.hash,
      });

      // Best-effort index — Base success is independent of Convex sync.
      void syncPositionTx(opened.hash).catch(() => undefined);
      router.push(`/?opened=${opened.tokenId.toString()}`);
    } catch (error) {
      const hash =
        error instanceof ProtocolTxError ? error.hash : submittedHash;
      setTxPhase({
        status: "error",
        label: "Open",
        message: error instanceof Error ? error.message : "Open failed",
        ...(hash ? { hash } : {}),
      });
      void refreshSnapshot();
    }
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
              stockAmount <= 0n
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
