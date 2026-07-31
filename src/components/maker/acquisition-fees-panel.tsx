"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  PAYMENT_CHAIN,
  createRobinhoodPublicClient,
  ripEngineAbi,
  txExplorerUrl,
} from "@margin-call/shared";
import {
  createWalletClient,
  custom,
  formatUnits,
  type Address,
  type Hash,
} from "viem";

import { GameButton } from "@/components/ui/game-button";
import { getContractAddresses } from "@/lib/contracts/addresses";
import {
  claimAcquisitionFees,
  claimPhaseMessage,
  readAcquisitionFeeSnapshot,
  type AcquisitionFeeSnapshot,
  type ClaimPhase,
} from "@/lib/maker/acquisition-fees";

type ViewProps = {
  snapshot: AcquisitionFeeSnapshot | null;
  phase: ClaimPhase;
  isReading: boolean;
  isBusy: boolean;
  configured: boolean;
  readError?: string;
  onClaim: () => void;
  onRefresh: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/reject|denied|declined/i.test(error.message)) {
    return `Transaction rejected: ${error.message}`;
  }
  return error.message;
}

function formatStablecoin(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return `${compactFraction ? `${whole}.${compactFraction}` : whole} MockUSD`;
}

export function AcquisitionFeesView({
  snapshot,
  phase,
  isReading,
  isBusy,
  configured,
  readError,
  onClaim,
  onRefresh,
}: ViewProps) {
  const hash = phase.kind === "pending" ? phase.hash : null;
  const decimals = snapshot?.stablecoinDecimals ?? 0;
  const claimDisabled =
    !configured || isBusy || isReading || !snapshot || snapshot.total === 0n;

  return (
    <div className="mt-5 border border-[var(--t-divider)]/60 bg-[var(--t-panel)]/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
          Acquisition Fees
        </h3>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
          Live RipEngine accounting
        </span>
      </div>

      {!configured ? (
        <p role="alert" className="mt-3 text-xs text-[var(--t-red)]">
          Robinhood testnet contract addresses are not configured.
        </p>
      ) : snapshot ? (
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-[var(--t-muted)]">Already crystallized</dt>
            <dd className="mt-1 font-bold text-[var(--t-text)]">
              {formatStablecoin(snapshot.crystallized, decimals)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--t-muted)]">
              Pending across {snapshot.restingMakerTokenIds.length} resting Pack
              {snapshot.restingMakerTokenIds.length === 1 ? "" : "s"}
            </dt>
            <dd className="mt-1 font-bold text-[var(--t-text)]">
              {formatStablecoin(snapshot.pending, decimals)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--t-muted)]">Total claimable</dt>
            <dd className="mt-1 font-bold text-[var(--t-green)]">
              {formatStablecoin(snapshot.total, decimals)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--t-muted)]">Current wallet balance</dt>
            <dd className="mt-1 font-bold text-[var(--t-text)]">
              {formatStablecoin(snapshot.mockUsdBalance, decimals)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-xs text-[var(--t-muted)]">
          Reading live fee and MockUSD balances…
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <GameButton onClick={onClaim} disabled={claimDisabled} size="sm">
          {isBusy ? "[CLAIM IN PROGRESS]" : "[CLAIM ACQUISITION FEES]"}
        </GameButton>
        <GameButton
          onClick={onRefresh}
          disabled={!configured || isBusy || isReading}
          variant="secondary"
          size="sm"
        >
          [REFRESH FEES]
        </GameButton>
      </div>
      {snapshot?.total === 0n && !isReading && (
        <p className="mt-2 text-xs text-[var(--t-muted)]">
          No Acquisition Fees are currently claimable.
        </p>
      )}
      <p
        role={phase.kind === "error" ? "alert" : "status"}
        className={`mt-2 text-xs ${
          phase.kind === "error" || phase.kind === "refresh-error"
            ? "text-[var(--t-red)]"
            : phase.kind === "complete"
              ? "text-[var(--t-green)]"
              : "text-[var(--t-muted)]"
        }`}
      >
        {claimPhaseMessage(phase)}
      </p>
      {hash && (
        <a
          className="text-xs text-[var(--t-accent)] underline underline-offset-4"
          href={txExplorerUrl(hash)}
          target="_blank"
          rel="noreferrer"
        >
          View pending transaction
        </a>
      )}
      {isReading && (
        <p className="mt-2 text-xs text-[var(--t-muted)]">
          Refreshing the complete live resting set and MockUSD balance…
        </p>
      )}
      {readError && (
        <p role="alert" className="mt-2 text-xs text-[var(--t-red)]">
          Live fee reads unavailable: {readError}
        </p>
      )}
    </div>
  );
}

export function AcquisitionFeesPanel({
  walletAddress,
}: {
  walletAddress: Address;
}) {
  const { wallets } = useWallets();
  const publicClient = useMemo(() => createRobinhoodPublicClient(), []);
  const addresses = useMemo(() => {
    try {
      return getContractAddresses();
    } catch {
      return null;
    }
  }, []);
  const [snapshot, setSnapshot] = useState<AcquisitionFeeSnapshot | null>(null);
  const [phase, setPhase] = useState<ClaimPhase>({ kind: "idle" });
  const [readError, setReadError] = useState<string>();
  const [isReading, setIsReading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const readSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!addresses) return null;
    const sequence = ++readSequence.current;
    setIsReading(true);
    setReadError(undefined);
    try {
      const next = await readAcquisitionFeeSnapshot(
        publicClient,
        addresses,
        walletAddress
      );
      if (sequence === readSequence.current) setSnapshot(next);
      return next;
    } catch (error) {
      if (sequence === readSequence.current) {
        setReadError(errorMessage(error, "Chain reads unavailable"));
      }
      throw error;
    } finally {
      if (sequence === readSequence.current) setIsReading(false);
    }
  }, [addresses, publicClient, walletAddress]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  async function onClaim() {
    if (!addresses || isBusy) return;
    setIsBusy(true);
    setPhase({ kind: "idle" });
    try {
      const freshSnapshot = await refresh();
      if (!freshSnapshot || freshSnapshot.total === 0n) {
        throw new Error("No Acquisition Fees are currently claimable");
      }
      const wallet = wallets.find(
        (candidate) =>
          candidate.address.toLowerCase() === walletAddress.toLowerCase()
      );
      if (!wallet) throw new Error("Connected Privy EVM wallet is unavailable");
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        transport: custom(provider),
      });

      await claimAcquisitionFees(
        freshSnapshot.restingMakerTokenIds,
        {
          claim: (tokenIds) =>
            walletClient.writeContract({
              account: walletAddress,
              chain: PAYMENT_CHAIN,
              address: addresses.ripEngine,
              abi: ripEngineAbi,
              functionName: "claim",
              args: [tokenIds],
            }),
          waitForReceipt: (hash: Hash) =>
            publicClient.waitForTransactionReceipt({ hash }),
        },
        setPhase,
        async () => {
          await refresh();
        }
      );
    } catch (error) {
      setPhase({
        kind: "error",
        message: errorMessage(error, "Acquisition Fee claim failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <AcquisitionFeesView
      snapshot={snapshot}
      phase={phase}
      isReading={isReading}
      isBusy={isBusy}
      configured={Boolean(addresses)}
      readError={readError}
      onClaim={() => void onClaim()}
      onRefresh={() => void refresh().catch(() => undefined)}
    />
  );
}
