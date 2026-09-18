"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";
import { WalletNetworkControls } from "@/components/wallet/wallet-network-controls";
import {
  assertWalletOnBase,
  parseNetworkIdToChainId,
  resolveBaseWalletClient,
} from "@/lib/dynamic/resolve-wallet-client";
import { getEvmWalletAddress } from "@/lib/dynamic/wallet";
import {
  formatStockAmount,
  formatUsdcRaw,
  parseStockAmount,
} from "@/lib/protocol/amounts";
import {
  DEFAULT_LEVERAGE,
  OPENING_LEVERAGE_PRESETS,
} from "@/lib/protocol/constants";
import {
  baseDeployment,
  getAssetById,
  getAssetByName,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import { basescanTxUrl } from "@/lib/protocol/explorer";
import { createBasePublicClient } from "@/lib/protocol/public-client";
import {
  assertBaseChain,
  closeReadiness,
  openReadiness,
} from "@/lib/protocol/readiness";
import {
  loadOpenSnapshot,
  loadPosition,
  type OpenSnapshot,
  type PositionView,
} from "@/lib/protocol/reads";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";
import {
  ProtocolTxError,
  approveUnlimited,
  closePosition,
  openPosition,
  repayAll,
} from "@/lib/protocol/writes";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
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

/**
 * Minimal Base Position lifecycle workspace.
 * Connect → choose asset → open → inspect → repay → close.
 */
export function PositionWorkspace() {
  const { data: accounts = [] } = useGetWalletAccounts();
  const address = getEvmWalletAddress(accounts);
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-10 font-mono text-[var(--t-text)]">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Margin Call
        </p>
        <h1 className="font-[family-name:var(--font-plex-sans)] text-3xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          Base workspace
        </h1>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          Minimal Position lifecycle against the canonical Base deployment.
          Connect → open → repay → close.
        </p>
      </header>

      <section className="space-y-3 border-t border-[var(--t-border)] pt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Wallet / network
        </h2>
        <WalletConnectUi />
        {evmAccount ? <WalletNetworkControls evmAccount={evmAccount} /> : null}
      </section>

      {address && evmAccount ? (
        <ConnectedWorkspace address={address} evmAccount={evmAccount} />
      ) : null}
    </div>
  );
}

function ConnectedWorkspace(props: {
  address: `0x${string}`;
  evmAccount: WalletAccount;
}) {
  const { address, evmAccount } = props;
  const { data: accounts = [] } = useGetWalletAccounts();

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
  const [position, setPosition] = useState<PositionView | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const [readError, setReadError] = useState<string | null>(null);
  const [indexNote, setIndexNote] = useState<string | null>(null);
  const snapshotGen = useRef(0);
  const syncPositionTx = useSyncPositionTransaction();

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

  const openPos = position?.status === "open" ? position : null;
  const formLocked = openPos != null || pending;

  const readiness = openReadiness({
    chainId,
    stockAmount: stockAmount ?? 0n,
    stockBalance: snapshot?.stockBalance ?? null,
    targetLeverage: leverage,
    oracleState: snapshot?.oracleState ?? null,
    availableCredit: snapshot?.availableCredit ?? null,
    estimatedPrincipal: snapshot?.estimatedPrincipal ?? null,
  });

  const closeGate = closeReadiness({
    chainId,
    currentDebt: openPos?.currentDebt ?? null,
    positionExists: openPos != null,
  });
  const chainGate = assertBaseChain(chainId);

  async function runTx(
    label: string,
    fn: (args: {
      walletClient: NonNullable<ReturnType<typeof resolveBaseWalletClient>>;
      onSubmitted: (hash: `0x${string}`) => void;
    }) => Promise<void>
  ) {
    const walletClient = resolveBaseWalletClient(accounts);
    if (!walletClient) {
      setTxPhase({
        status: "error",
        label,
        message: "No Base wallet client. Reconnect an EVM wallet.",
      });
      return;
    }

    let submittedHash: `0x${string}` | undefined;
    try {
      await assertWalletOnBase(walletClient);
      setTxPhase({ status: "awaiting-signature", label });
      await fn({
        walletClient,
        onSubmitted: (hash) => {
          submittedHash = hash;
          setTxPhase({ status: "submitted", label, hash });
        },
      });
      setTxPhase((prev) => {
        if (prev.status === "submitted") {
          return {
            status: "confirmed",
            label: prev.label,
            hash: prev.hash,
          };
        }
        if (prev.status === "awaiting-signature") {
          return { status: "idle" };
        }
        return prev;
      });
      if (submittedHash) {
        const syncStatus = await syncPositionTx(submittedHash);
        setIndexNote(
          syncStatus === "pending"
            ? "Position indexed pending — reconciliation will catch up shortly."
            : null
        );
      }
    } catch (error) {
      const hash =
        error instanceof ProtocolTxError ? error.hash : submittedHash;
      setTxPhase({
        status: "error",
        label,
        message: error instanceof Error ? error.message : `${label} failed`,
        ...(hash ? { hash } : {}),
      });
    }
  }

  const needsStockApproval =
    stockAmount != null &&
    snapshot != null &&
    snapshot.stockAllowance < stockAmount;

  const assetLabel =
    openPos != null
      ? (getAssetById(openPos.assetId)?.name ?? `asset ${openPos.assetId}`)
      : "?";

  return (
    <>
      <section className="space-y-4 border-t border-[var(--t-border)] pt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Open position
        </h2>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Asset</span>
          <select
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            value={assetName}
            disabled={formLocked}
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
            disabled={formLocked}
            onChange={(event) => setAmountInput(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Leverage</span>
          <select
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            value={leverage}
            disabled={formLocked}
            onChange={(event) => setLeverage(Number(event.target.value))}
          >
            {OPENING_LEVERAGE_PRESETS.map((preset) => (
              <option key={preset.bps} value={preset.bps}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-xs text-[var(--t-muted)]">
          <p>
            Balance:{" "}
            {snapshot == null ? "—" : formatStockAmount(snapshot.stockBalance)}{" "}
            {assetName}
          </p>
          <p>
            Readiness:{" "}
            {readiness.ok ? (
              <span className="text-[var(--t-green)]">ready</span>
            ) : (
              <span className="text-[var(--t-amber)]">{readiness.reason}</span>
            )}
          </p>
          {openPos != null ? (
            <p>Close the current position before opening another.</p>
          ) : null}
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
              formLocked ||
              !chainGate.ok ||
              !needsStockApproval ||
              stockAmount == null ||
              stockAmount <= 0n
            }
            onClick={() =>
              void runTx(
                "Approve stock",
                async ({ walletClient, onSubmitted }) => {
                  await approveUnlimited({
                    walletClient,
                    publicClient,
                    token: asset.stock,
                    spender: baseDeployment.marginCall,
                    onSubmitted,
                  });
                  await refreshSnapshot();
                }
              )
            }
          >
            Approve stock
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              formLocked ||
              !readiness.ok ||
              needsStockApproval ||
              stockAmount == null
            }
            onClick={() =>
              void runTx(
                "Open position",
                async ({ walletClient, onSubmitted }) => {
                  if (openPos != null) {
                    throw new Error(
                      "Close the current position before opening another."
                    );
                  }
                  if (stockAmount == null) {
                    throw new Error("Enter a stock amount greater than zero.");
                  }

                  const fresh = await loadOpenSnapshot(publicClient, {
                    address,
                    asset,
                    leverage,
                    stockAmount,
                  });
                  setSnapshot(fresh);

                  const freshGate = openReadiness({
                    chainId,
                    stockAmount,
                    stockBalance: fresh.stockBalance,
                    targetLeverage: leverage,
                    oracleState: fresh.oracleState,
                    availableCredit: fresh.availableCredit,
                    estimatedPrincipal: fresh.estimatedPrincipal,
                  });
                  if (!freshGate.ok) {
                    throw new Error(freshGate.reason);
                  }
                  if (fresh.stockAllowance < stockAmount) {
                    throw new Error("Stock approval required before open.");
                  }

                  const { tokenId } = await openPosition({
                    walletClient,
                    publicClient,
                    assetId: BigInt(asset.assetId),
                    stockAmount,
                    targetLeverage: BigInt(leverage),
                    onSubmitted,
                  });
                  setPosition(await loadPosition(publicClient, tokenId));
                  await refreshSnapshot();
                }
              )
            }
          >
            Open position
          </Button>
        </div>
      </section>

      {position ? (
        <section className="space-y-4 border-t border-[var(--t-border)] pt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Position
          </h2>
          {position.status === "closed" ? (
            <p className="text-sm text-[var(--t-green)]">
              Position #{position.tokenId.toString()} closed. NFT burned; stock
              returned to owner.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-[var(--t-muted)]">Asset</dt>
                <dd>{assetLabel}</dd>
                <dt className="text-[var(--t-muted)]">Token ID</dt>
                <dd>{position.tokenId.toString()}</dd>
                <dt className="text-[var(--t-muted)]">Stock</dt>
                <dd>{formatStockAmount(position.stockAmount)}</dd>
                <dt className="text-[var(--t-muted)]">Current debt</dt>
                <dd>{formatUsdcRaw(position.currentDebt)} USDC</dd>
                <dt className="text-[var(--t-muted)]">NAV</dt>
                <dd>
                  {position.nav == null
                    ? "unavailable (oracle not LIVE)"
                    : `${formatUsdcRaw(position.nav)} USDC`}
                </dd>
                <dt className="text-[var(--t-muted)]">Liquidatable</dt>
                <dd>
                  {position.liquidatable == null
                    ? "—"
                    : position.liquidatable
                      ? "yes"
                      : "no"}
                </dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    pending || !chainGate.ok || position.currentDebt === 0n
                  }
                  onClick={() =>
                    void runTx("Repay all", async ({ walletClient }) => {
                      await repayAll({
                        walletClient,
                        publicClient,
                        owner: address,
                        tokenId: position.tokenId,
                        onSubmitted: (hash, phaseLabel) => {
                          setTxPhase({
                            status: "submitted",
                            label: phaseLabel,
                            hash,
                          });
                        },
                      });
                      setPosition(
                        await loadPosition(publicClient, position.tokenId)
                      );
                    })
                  }
                >
                  Repay all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || !closeGate.ok}
                  onClick={() =>
                    void runTx(
                      "Close position",
                      async ({ walletClient, onSubmitted }) => {
                        const { tokenId } = await closePosition({
                          walletClient,
                          publicClient,
                          tokenId: position.tokenId,
                          onSubmitted,
                        });
                        setPosition({ status: "closed", tokenId });
                        await refreshSnapshot();
                      }
                    )
                  }
                >
                  Close position
                </Button>
              </div>
              {!closeGate.ok && position.currentDebt !== 0n ? (
                <p className="text-xs text-[var(--t-muted)]">
                  {closeGate.reason}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section className="border-t border-[var(--t-border)] pt-4">
        <TxStatus phase={txPhase} />
        {indexNote ? (
          <p className="mt-2 text-xs text-[var(--t-muted)]">{indexNote}</p>
        ) : null}
      </section>
    </>
  );
}
