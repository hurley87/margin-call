"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isProgrammaticNetworkSwitchAvailable } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
  useSwitchActiveNetwork,
} from "@dynamic-labs-sdk/react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type TransactionReceipt, maxUint256 } from "viem";
import { base } from "viem/chains";
import { Button } from "@/components/ui/button";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";
import {
  BASE_NETWORK_ID,
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
  BASE_CHAIN_ID,
  DEFAULT_LEVERAGE,
  OPENING_LEVERAGE_PRESETS,
  ORACLE_STATE,
  SPOT_LEVERAGE,
  isFinancedLeverage,
  type OracleState,
} from "@/lib/protocol/constants";
import {
  creditPoolAbi,
  erc20Abi,
  marginCallAbi,
  oracleAdapterAbi,
} from "@/lib/protocol/abi";
import { decodePositionOpenedTokenId } from "@/lib/protocol/decode";
import {
  assetIdForName,
  baseDeployment,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import {
  encodeApprove,
  encodeClosePosition,
  encodeOpenPosition,
  encodeRepay,
} from "@/lib/protocol/encode";
import { basescanTxUrl } from "@/lib/protocol/explorer";
import {
  createBasePublicClient,
  type BasePublicClient,
} from "@/lib/protocol/public-client";
import {
  assertBaseChain,
  closeReadiness,
  openReadiness,
} from "@/lib/protocol/readiness";
import { repayCeiling, sizePrincipal } from "@/lib/protocol/repay";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";
import { formatShortAddress } from "@/lib/utils";

type PositionView = {
  tokenId: bigint;
  assetId: number;
  stockAmount: bigint;
  currentDebt: bigint;
  nav: bigint | null;
  liquidatable: boolean | null;
  closed: boolean;
};

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

async function sendContractTx(args: {
  publicClient: BasePublicClient;
  accounts: readonly WalletAccount[];
  to: `0x${string}`;
  data: `0x${string}`;
  label: string;
  setPhase: (phase: TxPhase) => void;
}): Promise<TransactionReceipt> {
  const walletClient = resolveBaseWalletClient(args.accounts);
  if (!walletClient) {
    throw new Error("No Base wallet client. Reconnect an EVM wallet.");
  }
  await assertWalletOnBase(walletClient);

  args.setPhase({ status: "awaiting-signature", label: args.label });
  const hash = await walletClient.sendTransaction({
    account: walletClient.account,
    chain: base,
    to: args.to,
    data: args.data,
  });
  args.setPhase({ status: "submitted", label: args.label, hash });
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    args.setPhase({
      status: "error",
      label: args.label,
      message: "Transaction reverted",
      hash,
    });
    throw new Error(`${args.label} reverted`);
  }
  args.setPhase({ status: "confirmed", label: args.label, hash });
  return receipt;
}

/**
 * Minimal Base Position lifecycle workspace.
 * Connect → choose asset → open → inspect → repay → close.
 */
export function PositionWorkspace() {
  const { data: accounts = [] } = useGetWalletAccounts();
  const address = getEvmWalletAddress(accounts);
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;

  const networkQuery = useGetActiveNetworkId({
    walletAccount: (evmAccount ?? {
      id: "pending",
      address: "0x0000000000000000000000000000000000000000",
      chain: "EVM",
      lastSelectedAt: null,
      verifiedCredentialId: null,
      walletProviderKey: "metamaskevm",
    }) as WalletAccount,
    queryParams: {
      enabled: Boolean(evmAccount),
      refetchInterval: 4_000,
    },
  });

  const chainId = parseNetworkIdToChainId(networkQuery.data?.networkId);
  const { mutate: switchNetwork, isPending: isSwitching } =
    useSwitchActiveNetwork();

  const canSwitch =
    evmAccount != null &&
    isProgrammaticNetworkSwitchAvailable({ walletAccount: evmAccount });

  const [publicClient] = useState(() => createBasePublicClient());
  const [assetName, setAssetName] = useState<LaunchAssetName>("NVDAc");
  const [amountInput, setAmountInput] = useState("0.01");
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [stockBalance, setStockBalance] = useState<bigint | null>(null);
  const [stockAllowance, setStockAllowance] = useState<bigint | null>(null);
  const [oracleState, setOracleState] = useState<OracleState | null>(null);
  const [availableCredit, setAvailableCredit] = useState<bigint | null>(null);
  const [estimatedPrincipal, setEstimatedPrincipal] = useState<bigint | null>(
    null
  );
  const [position, setPosition] = useState<PositionView | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const [readError, setReadError] = useState<string | null>(null);

  const asset = useMemo(() => {
    const id = assetIdForName(assetName);
    const found = baseDeployment.assets.find((entry) => entry.assetId === id);
    if (!found) throw new Error(`Missing asset ${assetName}`);
    return found;
  }, [assetName]);

  const stockAmount = parseStockAmount(amountInput);
  const pending = isTxPending(txPhase);

  const refreshReadiness = useCallback(async () => {
    if (!address) {
      setStockBalance(null);
      setStockAllowance(null);
      setOracleState(null);
      setAvailableCredit(null);
      setEstimatedPrincipal(null);
      return;
    }
    try {
      setReadError(null);
      const [balance, allowance, credit] = await Promise.all([
        publicClient.readContract({
          address: asset.stock,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: asset.stock,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, baseDeployment.marginCall],
        }),
        publicClient.readContract({
          address: baseDeployment.creditPool,
          abi: creditPoolAbi,
          functionName: "availableCredit",
        }),
      ]);
      setStockBalance(balance);
      setStockAllowance(allowance);
      setAvailableCredit(credit);

      if (isFinancedLeverage(leverage) && stockAmount && stockAmount > 0n) {
        const observation = await publicClient.readContract({
          address: asset.oracleAdapter,
          abi: oracleAdapterAbi,
          functionName: "latestObservation",
        });
        const state = observation.state as OracleState;
        setOracleState(state);
        if (state === ORACLE_STATE.LIVE) {
          const contributionValue = await publicClient.readContract({
            address: asset.oracleAdapter,
            abi: oracleAdapterAbi,
            functionName: "valueUsdc",
            args: [stockAmount, observation.price],
          });
          setEstimatedPrincipal(sizePrincipal(contributionValue, leverage));
        } else {
          setEstimatedPrincipal(null);
        }
      } else {
        setOracleState(null);
        setEstimatedPrincipal(0n);
      }
    } catch (error) {
      setReadError(
        error instanceof Error ? error.message : "Failed to read Base state"
      );
    }
  }, [address, asset, leverage, publicClient, stockAmount]);

  const refreshPosition = useCallback(
    async (tokenId: bigint) => {
      try {
        const [pos, debt] = await Promise.all([
          publicClient.readContract({
            address: baseDeployment.marginCall,
            abi: marginCallAbi,
            functionName: "positions",
            args: [tokenId],
          }),
          publicClient.readContract({
            address: baseDeployment.marginCall,
            abi: marginCallAbi,
            functionName: "currentDebt",
            args: [tokenId],
          }),
        ]);

        let nav: bigint | null = null;
        let liquidatable: boolean | null = null;
        try {
          const snap = await publicClient.readContract({
            address: baseDeployment.marginCall,
            abi: marginCallAbi,
            functionName: "riskSnapshot",
            args: [tokenId],
          });
          nav = snap.nav;
          liquidatable = snap.liquidatable;
        } catch {
          // LIVE-only — omit health when HELD/INVALID rather than showing stale NAV.
        }

        setPosition({
          tokenId,
          assetId: Number(pos.assetId),
          stockAmount: pos.stockAmount,
          currentDebt: debt,
          nav,
          liquidatable,
          closed: false,
        });
      } catch (error) {
        setReadError(
          error instanceof Error ? error.message : "Failed to read position"
        );
      }
    },
    [publicClient]
  );

  useEffect(() => {
    void refreshReadiness();
  }, [refreshReadiness]);

  const readiness = openReadiness({
    chainId,
    stockAmount: stockAmount ?? 0n,
    stockBalance: stockBalance ?? 0n,
    targetLeverage: leverage,
    oracleState,
    availableCredit,
    estimatedPrincipal: leverage === SPOT_LEVERAGE ? 0n : estimatedPrincipal,
  });

  const closeGate = closeReadiness({
    chainId,
    currentDebt: position?.currentDebt ?? null,
    positionExists: Boolean(position && !position.closed),
  });

  const chainGate = assertBaseChain(chainId);

  async function onApproveStock() {
    if (!address || stockAmount == null) return;
    try {
      await sendContractTx({
        publicClient,
        accounts,
        to: asset.stock,
        data: encodeApprove({
          spender: baseDeployment.marginCall,
          amount: maxUint256,
        }),
        label: "Approve stock",
        setPhase: setTxPhase,
      });
      await refreshReadiness();
    } catch (error) {
      setTxPhase({
        status: "error",
        label: "Approve stock",
        message: error instanceof Error ? error.message : "Approve failed",
      });
    }
  }

  async function onOpen() {
    if (!readiness.ok || stockAmount == null) return;
    try {
      const receipt = await sendContractTx({
        publicClient,
        accounts,
        to: baseDeployment.marginCall,
        data: encodeOpenPosition({
          assetId: BigInt(asset.assetId),
          stockAmount,
          targetLeverage: BigInt(leverage),
        }),
        label: "Open position",
        setPhase: setTxPhase,
      });
      const tokenId = decodePositionOpenedTokenId(receipt.logs);
      await refreshPosition(tokenId);
      await refreshReadiness();
    } catch (error) {
      setTxPhase({
        status: "error",
        label: "Open position",
        message: error instanceof Error ? error.message : "Open failed",
      });
    }
  }

  async function onRepayAll() {
    if (!position || !address) return;
    try {
      const remaining = await publicClient.readContract({
        address: baseDeployment.marginCall,
        abi: marginCallAbi,
        functionName: "currentDebt",
        args: [position.tokenId],
      });
      if (remaining === 0n) {
        await refreshPosition(position.tokenId);
        return;
      }
      const ceiling = repayCeiling(remaining);
      const allowance = await publicClient.readContract({
        address: baseDeployment.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, baseDeployment.marginCall],
      });
      if (allowance < ceiling) {
        await sendContractTx({
          publicClient,
          accounts,
          to: baseDeployment.usdc,
          data: encodeApprove({
            spender: baseDeployment.marginCall,
            amount: ceiling,
          }),
          label: "Approve USDC",
          setPhase: setTxPhase,
        });
      }
      await sendContractTx({
        publicClient,
        accounts,
        to: baseDeployment.marginCall,
        data: encodeRepay({ tokenId: position.tokenId, amount: ceiling }),
        label: "Repay all",
        setPhase: setTxPhase,
      });
      // Re-read debt before enabling Close.
      await refreshPosition(position.tokenId);
    } catch (error) {
      setTxPhase({
        status: "error",
        label: "Repay all",
        message: error instanceof Error ? error.message : "Repay failed",
      });
    }
  }

  async function onClose() {
    if (!position || !closeGate.ok) return;
    try {
      const receipt = await sendContractTx({
        publicClient,
        accounts,
        to: baseDeployment.marginCall,
        data: encodeClosePosition(position.tokenId),
        label: "Close position",
        setPhase: setTxPhase,
      });
      let burned = false;
      try {
        await publicClient.readContract({
          address: baseDeployment.marginCall,
          abi: marginCallAbi,
          functionName: "ownerOf",
          args: [position.tokenId],
        });
      } catch {
        burned = true;
      }
      if (!burned) {
        throw new Error("Position NFT still exists after close");
      }
      setPosition({
        ...position,
        closed: true,
        currentDebt: 0n,
        stockAmount: 0n,
      });
      setTxPhase({
        status: "confirmed",
        label: "Close position",
        hash: receipt.transactionHash,
      });
    } catch (error) {
      setTxPhase({
        status: "error",
        label: "Close position",
        message: error instanceof Error ? error.message : "Close failed",
      });
    }
  }

  const needsStockApproval =
    stockAmount != null &&
    stockAllowance != null &&
    stockAllowance < stockAmount;

  const assetLabel =
    baseDeployment.assets.find((entry) => entry.assetId === position?.assetId)
      ?.name ?? `asset ${position?.assetId ?? "?"}`;

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
        {address ? (
          <div className="space-y-2 text-xs text-[var(--t-muted)]">
            <p>
              Chain:{" "}
              {chainId === BASE_CHAIN_ID ? (
                <span className="text-[var(--t-green)]">Base (8453)</span>
              ) : (
                <span className="text-[var(--t-amber)]">
                  {chainId == null ? "unknown" : `chain ${chainId}`}
                </span>
              )}
            </p>
            {!chainGate.ok ? (
              <div className="flex flex-col gap-2">
                <p>{chainGate.reason}</p>
                {canSwitch && evmAccount ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSwitching || pending}
                    onClick={() =>
                      switchNetwork({
                        networkId: BASE_NETWORK_ID,
                        walletAccount: evmAccount,
                      })
                    }
                  >
                    Switch to Base
                  </Button>
                ) : (
                  <p>Switch the wallet to Base mainnet (8453) to continue.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-[var(--t-border)] pt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Open position
        </h2>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--t-muted)]">Asset</span>
          <select
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)]"
            value={assetName}
            disabled={pending}
            onChange={(event) =>
              setAssetName(event.target.value as LaunchAssetName)
            }
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
        <div className="space-y-1 text-xs text-[var(--t-muted)]">
          <p>
            Balance:{" "}
            {stockBalance == null ? "—" : formatStockAmount(stockBalance)}{" "}
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
              !address ||
              !chainGate.ok ||
              !needsStockApproval ||
              stockAmount == null ||
              stockAmount <= 0n
            }
            onClick={() => void onApproveStock()}
          >
            Approve stock
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              pending ||
              !address ||
              !readiness.ok ||
              needsStockApproval ||
              stockAmount == null
            }
            onClick={() => void onOpen()}
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
          {position.closed ? (
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
                  onClick={() => void onRepayAll()}
                >
                  Repay all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || !closeGate.ok}
                  onClick={() => void onClose()}
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
      </section>
    </div>
  );
}
