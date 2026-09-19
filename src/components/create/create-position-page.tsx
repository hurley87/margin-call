"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useGetActiveNetworkId,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import {
  MAX_THESIS_BYTES,
  isThesisWithinLimit,
  thesisByteLength,
} from "@margin-call/shared/thesis";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CreatePositionView,
  type CreateDraft,
} from "@/components/create/create-position-view";
import { runManagedTx } from "@/components/protocol/run-managed-tx";
import {
  useWalletSession,
  type WalletSession,
} from "@/components/wallet/wallet-providers";
import { useSyncPositionTransaction } from "@/lib/convex/use-sync-position-transaction";
import { parseNetworkIdToChainId } from "@/lib/dynamic/resolve-wallet-client";
import { parseStockAmount } from "@/lib/protocol/amounts";
import { DEFAULT_LEVERAGE } from "@/lib/protocol/constants";
import { getAssetByName } from "@/lib/protocol/deployment";
import { runOpenPositionFlow } from "@/lib/protocol/open-flow";
import { createBasePublicClient } from "@/lib/protocol/public-client";
import { openReadiness } from "@/lib/protocol/readiness";
import { loadOpenSnapshot, type OpenSnapshot } from "@/lib/protocol/reads";
import { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";

const INITIAL_DRAFT: CreateDraft = {
  assetName: "NVDAc",
  amountInput: "0.01",
  thesis: "",
  leverage: DEFAULT_LEVERAGE,
};

/** Why the form is read-only, for every session that cannot sign. */
function browseMessage(
  session: Exclude<WalletSession, { kind: "connected" }>
): string {
  switch (session.kind) {
    case "hydrating":
      return "Connecting wallet…";
    case "failed":
      return session.message;
    case "unset":
      return "Wallet connection is currently unavailable.";
    case "disconnected":
      return "Connect a wallet to open a Position NFT.";
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

/** A browsable draft; wallet hooks and Base reads mount only after connection. */
export function CreatePositionPage() {
  const session = useWalletSession();
  const [draft, setDraft] = useState<CreateDraft>(INITIAL_DRAFT);

  if (session.kind === "connected") {
    return (
      <CreatePositionConnected
        key={session.address}
        address={session.address}
        draft={draft}
        onDraftChange={setDraft}
      />
    );
  }

  return (
    <CreatePositionView
      mode="browse"
      draft={draft}
      onDraftChange={setDraft}
      statusMessage={browseMessage(session)}
    />
  );
}

type DraftProps = {
  draft: CreateDraft;
  onDraftChange: (next: CreateDraft) => void;
};

function CreatePositionConnected({
  address,
  draft,
  onDraftChange,
}: DraftProps & { address: `0x${string}` }) {
  const { data: accounts = [] } = useGetWalletAccounts();
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;
  if (!evmAccount) {
    return (
      <CreatePositionView
        mode="browse"
        draft={draft}
        onDraftChange={onDraftChange}
        statusMessage="Connect an EVM wallet on Base to open a Position NFT."
      />
    );
  }
  return (
    <CreatePositionForm
      address={address}
      evmAccount={evmAccount}
      draft={draft}
      onDraftChange={onDraftChange}
    />
  );
}

function CreatePositionForm(
  props: DraftProps & {
    address: `0x${string}`;
    evmAccount: WalletAccount;
  }
) {
  const { address, evmAccount, draft, onDraftChange } = props;
  const { assetName, amountInput, thesis, leverage } = draft;
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
  const [snapshotResult, setSnapshotResult] = useState<{
    key: string;
    value: OpenSnapshot;
  } | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>({ status: "idle" });
  const [readError, setReadError] = useState<string | null>(null);
  const snapshotGen = useRef(0);

  const asset = getAssetByName(assetName);
  const stockAmount = parseStockAmount(amountInput);
  const pending = isTxPending(txPhase);
  const snapshotKey = `${address}:${assetName}:${leverage}:${stockAmount}`;
  const snapshot =
    snapshotResult?.key === snapshotKey ? snapshotResult.value : null;
  const thesisFits = isThesisWithinLimit(thesis);

  const refreshSnapshot = useCallback(async () => {
    const gen = ++snapshotGen.current;
    setSnapshotResult(null);
    setReadError(null);
    try {
      const next = await loadOpenSnapshot(publicClient, {
        address,
        asset,
        leverage,
        stockAmount,
      });
      if (gen !== snapshotGen.current) return;
      setSnapshotResult({ key: snapshotKey, value: next });
    } catch (error) {
      if (gen !== snapshotGen.current) return;
      setSnapshotResult(null);
      setReadError(
        error instanceof Error ? error.message : "Failed to read Base state"
      );
    }
  }, [address, asset, leverage, publicClient, stockAmount, snapshotKey]);

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
    if (!thesisFits) {
      setTxPhase({
        status: "error",
        label: "Open",
        message: `Thesis is ${thesisByteLength(thesis)} bytes; the limit is ${MAX_THESIS_BYTES}.`,
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
    <CreatePositionView
      mode="live"
      draft={draft}
      onDraftChange={onDraftChange}
      snapshot={snapshot}
      pending={pending}
      ready={
        readiness.ok && stockAmount != null && stockAmount > 0n && thesisFits
      }
      statusMessage={
        readError
          ? "Couldn't refresh your balance and quote."
          : snapshot == null
            ? "Reading your balance and quote…"
            : readiness.ok
              ? null
              : readiness.reason
      }
      readError={readError}
      onRefresh={() => void refreshSnapshot()}
      onCreate={() => void handleOpen()}
      txPhase={txPhase}
    />
  );
}
