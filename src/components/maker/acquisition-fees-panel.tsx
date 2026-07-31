"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PAYMENT_CHAIN,
  createRobinhoodPublicClient,
  ripEngineAbi,
  txExplorerUrl,
} from "@margin-call/shared";
import { formatUnits, type Address } from "viem";

import { GameButton } from "@/components/ui/game-button";
import { useMakerTransactionClient } from "@/hooks/use-maker-transaction-client";
import { getContractAddresses } from "@/lib/contracts/addresses";
import {
  claimAcquisitionFees,
  claimPhaseMessage,
  readAcquisitionFeeSnapshot,
  type AcquisitionFeeSnapshot,
  type ClaimPhase,
} from "@/lib/maker/acquisition-fees";
import {
  PendingTransactionError,
  createBrowserJournalStorage,
  ensureWorkflow,
  listWorkflows,
  requestFingerprint,
} from "@/lib/maker/transaction-journal";

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
  const hash =
    phase.kind === "pending"
      ? phase.hash
      : phase.kind === "error"
        ? (phase.hash ?? null)
        : null;
  const decimals = snapshot?.stablecoinDecimals ?? 0;
  const claimDisabled =
    !configured ||
    isBusy ||
    isReading ||
    !snapshot ||
    (snapshot.visibilityComplete
      ? snapshot.total === 0n
      : snapshot.crystallized === 0n);

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
          {snapshot.visibilityComplete ? (
            <div>
              <dt className="text-[var(--t-muted)]">
                Pending across {snapshot.restingMakerTokenIds.length} resting
                Pack
                {snapshot.restingMakerTokenIds.length === 1 ? "" : "s"}
              </dt>
              <dd className="mt-1 font-bold text-[var(--t-text)]">
                {formatStablecoin(snapshot.pending!, decimals)}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-[var(--t-muted)]">Pending visibility</dt>
              <dd className="mt-1 font-bold text-[var(--t-amber)]">Unknown</dd>
            </div>
          )}
          {snapshot.visibilityComplete ? (
            <div>
              <dt className="text-[var(--t-muted)]">Total claimable</dt>
              <dd className="mt-1 font-bold text-[var(--t-green)]">
                {formatStablecoin(snapshot.total!, decimals)}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-[var(--t-muted)]">Known claimable</dt>
              <dd className="mt-1 font-bold text-[var(--t-amber)]">
                {formatStablecoin(snapshot.crystallized, decimals)} plus unknown
                pending
              </dd>
            </div>
          )}
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

      {snapshot && !snapshot.visibilityComplete && (
        <p
          role="alert"
          className="mt-3 text-xs leading-5 text-[var(--t-amber)]"
        >
          Pending fees are not shown: the deployed RipEngine only exposes one
          unpaged restingPackIds() array, and the live set has{" "}
          {snapshot.restingCount.toString()} Packs, above this client&apos;s
          explicit {snapshot.visibilityLimit}-Pack safety cap. Claiming is
          limited to already crystallized fees; no partial pending total is
          reported.
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
      {snapshot?.visibilityComplete && snapshot.total === 0n && !isReading && (
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
          Refreshing bounded live fee visibility and MockUSD balance…
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
  const publicClient = useMemo(() => createRobinhoodPublicClient(), []);
  const { walletReady, getWalletClient, waitForReceipt } =
    useMakerTransactionClient(walletAddress, publicClient);
  const journalStorage = useMemo(() => createBrowserJournalStorage(), []);
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
  const recoveryStarted = useRef(false);

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

  async function claimWithWorkflow(tokenIds: bigint[], workflowKey: string) {
    if (!addresses) throw new Error("Contract addresses are not configured");
    const walletClient = await getWalletClient();
    await claimAcquisitionFees(
      tokenIds,
      {
        claim: (ids) =>
          walletClient.writeContract({
            account: walletAddress,
            chain: PAYMENT_CHAIN,
            address: addresses.ripEngine,
            abi: ripEngineAbi,
            functionName: "claim",
            args: [ids],
          }),
        waitForReceipt,
        hasClaimable: async (ids) => {
          const blockNumber = await publicClient.getBlockNumber();
          const [crystallized, pending] = await Promise.all([
            publicClient.readContract({
              address: addresses.ripEngine,
              abi: ripEngineAbi,
              functionName: "claimableFees",
              args: [walletAddress],
              blockNumber,
            }),
            ids.length === 0
              ? Promise.resolve<bigint[]>([])
              : publicClient.multicall({
                  allowFailure: false,
                  blockNumber,
                  contracts: ids.map((tokenId) => ({
                    address: addresses.ripEngine,
                    abi: ripEngineAbi,
                    functionName: "pendingOf" as const,
                    args: [tokenId] as const,
                  })),
                }),
          ]);
          return crystallized > 0n || pending.some((amount) => amount > 0n);
        },
      },
      setPhase,
      async () => {
        await refresh();
      },
      { storage: journalStorage, workflowKey }
    );
    journalStorage.remove(workflowKey);
  }

  useEffect(() => {
    if (recoveryStarted.current || !addresses || !walletReady) return;
    const workflow = listWorkflows(
      journalStorage,
      PAYMENT_CHAIN.id,
      walletAddress,
      "claim"
    )[0];
    if (!workflow) return;
    recoveryStarted.current = true;
    const raw = workflow.context.tokenIds;
    if (typeof raw !== "string") return;
    const tokenIds = (JSON.parse(raw) as string[]).map(BigInt);
    setIsBusy(true);
    void claimWithWorkflow(tokenIds, workflow.key)
      .catch((error) => {
        setPhase({
          kind: "error",
          message: errorMessage(
            error,
            "Acquisition Fee recovery needs attention"
          ),
          hash:
            error instanceof PendingTransactionError ? error.hash : undefined,
        });
      })
      .finally(() => setIsBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, journalStorage, walletAddress, walletReady]);

  async function onClaim() {
    if (!addresses || isBusy) return;
    setIsBusy(true);
    setPhase({ kind: "idle" });
    try {
      const existing = listWorkflows(
        journalStorage,
        PAYMENT_CHAIN.id,
        walletAddress,
        "claim"
      )[0];
      if (existing) {
        const raw = existing.context.tokenIds;
        if (typeof raw !== "string") {
          throw new Error("Saved Acquisition Fee claim is invalid");
        }
        await claimWithWorkflow(
          (JSON.parse(raw) as string[]).map(BigInt),
          existing.key
        );
        return;
      }
      const freshSnapshot = await refresh();
      if (
        !freshSnapshot ||
        (freshSnapshot.visibilityComplete
          ? freshSnapshot.total === 0n
          : freshSnapshot.crystallized === 0n)
      ) {
        throw new Error("No Acquisition Fees are currently claimable");
      }
      const tokenIds = freshSnapshot.visibilityComplete
        ? freshSnapshot.restingMakerTokenIds
        : [];
      const workflow = ensureWorkflow(journalStorage, {
        chainId: PAYMENT_CHAIN.id,
        wallet: walletAddress,
        kind: "claim",
        requestFingerprint: requestFingerprint(["acquisition-fees"]),
        context: { tokenIds: JSON.stringify(tokenIds.map(String)) },
      });
      await claimWithWorkflow(tokenIds, workflow.key);
    } catch (error) {
      setPhase({
        kind: "error",
        message: errorMessage(error, "Acquisition Fee claim failed"),
        hash: error instanceof PendingTransactionError ? error.hash : undefined,
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
