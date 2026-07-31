import {
  isAddressEqual,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";

import { erc20Abi, mockUsdAbi, ripEngineAbi } from "@margin-call/shared";
import {
  executeMakerWrite,
  type LifecycleJournalRun,
} from "./transaction-journal";

const MULTICALL_CHUNK_SIZE = 100;
export const MAX_RESTING_PACK_SCAN = 500;
export const CLAIM_BATCH_SIZE = 25;

export type AcquisitionFeeAddresses = {
  ripEngine: Address;
  mockUsd: Address;
};

export type AcquisitionFeeSnapshot = {
  blockNumber: bigint;
  crystallized: bigint;
  pending: bigint | null;
  total: bigint | null;
  mockUsdBalance: bigint;
  stablecoinDecimals: number;
  restingMakerTokenIds: bigint[];
  restingCount: bigint;
  visibilityComplete: boolean;
  visibilityLimit: number;
};

export type AcquisitionFeeReadClient = Pick<
  PublicClient,
  "getBlockNumber" | "readContract" | "multicall"
>;

export type ClaimPhase =
  | { kind: "idle" }
  | { kind: "signing"; batch: number; totalBatches: number }
  | { kind: "pending"; hash: Hash; batch: number; totalBatches: number }
  | { kind: "complete"; batches: number }
  | { kind: "refresh-error"; message: string }
  | { kind: "error"; message: string; hash?: Hash };

export type AcquisitionFeeClaimAdapter = {
  claim: (tokenIds: bigint[]) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<{ status: "success" | "reverted" }>;
  hasClaimable?: (tokenIds: bigint[]) => Promise<boolean>;
};

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readChunkedContracts<T>(
  client: AcquisitionFeeReadClient,
  contracts: readonly {
    address: Address;
    abi: typeof ripEngineAbi;
    functionName: "makerOf" | "pendingOf";
    args: readonly [bigint];
  }[],
  blockNumber: bigint
): Promise<T[]> {
  const values: T[] = [];
  for (const contractChunk of chunks(contracts, MULTICALL_CHUNK_SIZE)) {
    const result = await client.multicall({
      contracts: contractChunk,
      allowFailure: false,
      blockNumber,
    });
    values.push(...(result as T[]));
  }
  return values;
}

export function acquisitionFeeTotal(
  crystallized: bigint,
  pendingAmounts: readonly bigint[]
): { pending: bigint; total: bigint } {
  const pending = pendingAmounts.reduce((sum, amount) => sum + amount, 0n);
  return { pending, total: crystallized + pending };
}

/**
 * Read one coherent, live Acquisition Fee snapshot directly from the chain.
 * The deployed full-array read is used only after a same-block count proves it
 * is within the hard cap; Maker and pending reads are explicitly chunked.
 */
export async function readAcquisitionFeeSnapshot(
  client: AcquisitionFeeReadClient,
  addresses: AcquisitionFeeAddresses,
  walletAddress: Address
): Promise<AcquisitionFeeSnapshot> {
  const blockNumber = await client.getBlockNumber();
  const [restingCount, crystallized, mockUsdBalance, stablecoinDecimals] =
    await Promise.all([
      client.readContract({
        address: addresses.ripEngine,
        abi: ripEngineAbi,
        functionName: "restingCount",
        blockNumber,
      }),
      client.readContract({
        address: addresses.ripEngine,
        abi: ripEngineAbi,
        functionName: "claimableFees",
        args: [walletAddress],
        blockNumber,
      }),
      client.readContract({
        address: addresses.mockUsd,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
        blockNumber,
      }),
      client.readContract({
        address: addresses.mockUsd,
        abi: mockUsdAbi,
        functionName: "decimals",
        blockNumber,
      }),
    ]);

  if (restingCount > BigInt(MAX_RESTING_PACK_SCAN)) {
    return {
      blockNumber,
      crystallized,
      pending: null,
      total: null,
      mockUsdBalance,
      stablecoinDecimals,
      restingMakerTokenIds: [],
      restingCount,
      visibilityComplete: false,
      visibilityLimit: MAX_RESTING_PACK_SCAN,
    };
  }

  // The deployed contract has no indexed/page read. Only call the unbounded ABI
  // after proving at this exact block that the response is within our hard cap.
  const restingPackIds = await client.readContract({
    address: addresses.ripEngine,
    abi: ripEngineAbi,
    functionName: "restingPackIds",
    blockNumber,
  });

  if (BigInt(restingPackIds.length) !== restingCount) {
    throw new Error(
      `Incomplete live resting set: expected ${restingCount.toString()} Packs, received ${restingPackIds.length}`
    );
  }

  const tokenIds = [...restingPackIds];
  const makers = await readChunkedContracts<Address>(
    client,
    tokenIds.map((tokenId) => ({
      address: addresses.ripEngine,
      abi: ripEngineAbi,
      functionName: "makerOf",
      args: [tokenId],
    })),
    blockNumber
  );
  const makerTokenIds = tokenIds.filter((_, index) =>
    isAddressEqual(makers[index], walletAddress)
  );
  const pendingAmounts = await readChunkedContracts<bigint>(
    client,
    makerTokenIds.map((tokenId) => ({
      address: addresses.ripEngine,
      abi: ripEngineAbi,
      functionName: "pendingOf",
      args: [tokenId],
    })),
    blockNumber
  );
  const totals = acquisitionFeeTotal(crystallized, pendingAmounts);
  const restingMakerTokenIds = makerTokenIds.filter(
    (_, index) => pendingAmounts[index]! > 0n
  );

  return {
    blockNumber,
    crystallized,
    pending: totals.pending,
    total: totals.total,
    mockUsdBalance,
    stablecoinDecimals,
    restingMakerTokenIds,
    restingCount,
    visibilityComplete: true,
    visibilityLimit: MAX_RESTING_PACK_SCAN,
  };
}

export async function claimAcquisitionFees(
  tokenIds: bigint[],
  adapter: AcquisitionFeeClaimAdapter,
  onPhase: (phase: ClaimPhase) => void,
  refreshAfterConfirmation: () => Promise<void>,
  journal?: LifecycleJournalRun
): Promise<void> {
  const batches = chunks(tokenIds, CLAIM_BATCH_SIZE);
  if (batches.length === 0) batches.push([]);
  let confirmedBatches = 0;

  for (let index = 0; index < batches.length; index += 1) {
    const batchNumber = index + 1;
    const step = `claim:${index}`;
    const saved = journal?.storage.get(journal.workflowKey);
    const mustReconcile = Boolean(
      saved?.completed[step] || saved?.current?.step === step
    );
    if (
      !mustReconcile &&
      adapter.hasClaimable &&
      !(await adapter.hasClaimable(batches[index]!))
    ) {
      continue;
    }
    onPhase({
      kind: "signing",
      batch: batchNumber,
      totalBatches: batches.length,
    });
    const receipt = await executeMakerWrite({
      journal,
      step,
      action: "claim",
      submit: () => adapter.claim(batches[index]!),
      reconcile: adapter.waitForReceipt,
      onAccepted: (hash) =>
        onPhase({
          kind: "pending",
          hash,
          batch: batchNumber,
          totalBatches: batches.length,
        }),
    });
    if (receipt.status !== "success") {
      throw new Error(`Acquisition Fee claim batch ${batchNumber} reverted`);
    }
    confirmedBatches += 1;
  }

  onPhase({ kind: "complete", batches: confirmedBatches });
  try {
    await refreshAfterConfirmation();
  } catch (error) {
    onPhase({
      kind: "refresh-error",
      message:
        error instanceof Error
          ? `Claim confirmed, but live balances could not refresh: ${error.message}`
          : "Claim confirmed, but live balances could not refresh",
    });
  }
}

export function claimPhaseMessage(phase: ClaimPhase): string {
  switch (phase.kind) {
    case "idle":
      return "Ready to claim Acquisition Fees";
    case "signing":
      return `Confirm claim batch ${phase.batch} of ${phase.totalBatches} in your wallet`;
    case "pending":
      return `Claim batch ${phase.batch} of ${phase.totalBatches} submitted — waiting for confirmation`;
    case "complete":
      return `${phase.batches} Acquisition Fee claim batch${phase.batches === 1 ? "" : "es"} confirmed`;
    case "refresh-error":
    case "error":
      return phase.message;
  }
}
