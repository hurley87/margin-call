import {
  isAddressEqual,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";

import { erc20Abi, mockUsdAbi, ripEngineAbi } from "@margin-call/shared";

const MULTICALL_CHUNK_SIZE = 100;

export type AcquisitionFeeAddresses = {
  ripEngine: Address;
  mockUsd: Address;
};

export type AcquisitionFeeSnapshot = {
  blockNumber: bigint;
  crystallized: bigint;
  pending: bigint;
  total: bigint;
  mockUsdBalance: bigint;
  stablecoinDecimals: number;
  restingMakerTokenIds: bigint[];
};

export type AcquisitionFeeReadClient = Pick<
  PublicClient,
  "getBlockNumber" | "readContract" | "multicall"
>;

export type ClaimPhase =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "pending"; hash: Hash }
  | { kind: "complete" }
  | { kind: "refresh-error"; message: string }
  | { kind: "error"; message: string };

export type AcquisitionFeeClaimAdapter = {
  claim: (tokenIds: bigint[]) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<{ status: "success" | "reverted" }>;
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
 * The full resting set is discovered first; Maker and pending reads are then
 * explicitly chunked to bound each Multicall3 payload.
 */
export async function readAcquisitionFeeSnapshot(
  client: AcquisitionFeeReadClient,
  addresses: AcquisitionFeeAddresses,
  walletAddress: Address
): Promise<AcquisitionFeeSnapshot> {
  const blockNumber = await client.getBlockNumber();
  const [
    restingPackIds,
    restingCount,
    crystallized,
    mockUsdBalance,
    stablecoinDecimals,
  ] = await Promise.all([
    client.readContract({
      address: addresses.ripEngine,
      abi: ripEngineAbi,
      functionName: "restingPackIds",
      blockNumber,
    }),
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
  const restingMakerTokenIds = tokenIds.filter((_, index) =>
    isAddressEqual(makers[index], walletAddress)
  );
  const pendingAmounts = await readChunkedContracts<bigint>(
    client,
    restingMakerTokenIds.map((tokenId) => ({
      address: addresses.ripEngine,
      abi: ripEngineAbi,
      functionName: "pendingOf",
      args: [tokenId],
    })),
    blockNumber
  );
  const totals = acquisitionFeeTotal(crystallized, pendingAmounts);

  return {
    blockNumber,
    crystallized,
    pending: totals.pending,
    total: totals.total,
    mockUsdBalance,
    stablecoinDecimals,
    restingMakerTokenIds,
  };
}

export async function claimAcquisitionFees(
  tokenIds: bigint[],
  adapter: AcquisitionFeeClaimAdapter,
  onPhase: (phase: ClaimPhase) => void,
  refreshAfterConfirmation: () => Promise<void>
): Promise<void> {
  onPhase({ kind: "signing" });
  const hash = await adapter.claim(tokenIds);
  onPhase({ kind: "pending", hash });
  const receipt = await adapter.waitForReceipt(hash);
  if (receipt.status !== "success") {
    throw new Error("Acquisition Fee claim transaction reverted");
  }

  onPhase({ kind: "complete" });
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
      return "Confirm the Acquisition Fee claim in your wallet";
    case "pending":
      return "Claim submitted — waiting for confirmation";
    case "complete":
      return "Acquisition Fee claim confirmed";
    case "refresh-error":
    case "error":
      return phase.message;
  }
}
