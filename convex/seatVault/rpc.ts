"use node";

import { createPublicClient, http, type Log } from "viem";
import { baseSepolia } from "viem/chains";
import {
  seatTierNameFromOnChain,
  seatVaultAbi,
  type SeatTierName,
  type SeatVaultEventName,
} from "./policy";
import { resolveRpcUrl } from "./config";

export type SeatVaultStakeInfo = {
  staker: string;
  activeWei: string;
  pendingWei: string;
  unlockTime: number;
};

export type DecodedSeatVaultLog = {
  eventName: SeatVaultEventName;
  onChainTraderId: number;
  staker: string;
  amountWei: string;
  unlockTime?: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
};

export function createSeatVaultPublicClient(
  rpcUrl: string | undefined = resolveRpcUrl()
) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

/** Concrete public-client type returned by the factory above. */
export type SeatVaultClient = ReturnType<typeof createSeatVaultPublicClient>;

export async function readStakeOf(
  client: SeatVaultClient,
  vaultAddress: `0x${string}`,
  onChainTraderId: number
): Promise<SeatVaultStakeInfo> {
  const result = await client.readContract({
    address: vaultAddress,
    abi: seatVaultAbi,
    functionName: "stakeOf",
    args: [BigInt(onChainTraderId)],
  });

  return {
    staker: result.staker.toLowerCase(),
    activeWei: result.active.toString(),
    pendingWei: result.pending.toString(),
    unlockTime: Number(result.unlockTime),
  };
}

export async function readTierOf(
  client: SeatVaultClient,
  vaultAddress: `0x${string}`,
  onChainTraderId: number
): Promise<SeatTierName> {
  const tier = await client.readContract({
    address: vaultAddress,
    abi: seatVaultAbi,
    functionName: "tierOf",
    args: [BigInt(onChainTraderId)],
  });
  return seatTierNameFromOnChain(Number(tier));
}

/**
 * Fetch confirmed SeatVault logs in [fromBlock, toBlock] inclusive.
 * Caller applies confirmation depth before choosing toBlock.
 */
export async function fetchSeatVaultLogs(
  client: SeatVaultClient,
  vaultAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<DecodedSeatVaultLog[]> {
  if (toBlock < fromBlock) return [];

  const logs = await client.getContractEvents({
    address: vaultAddress,
    abi: seatVaultAbi,
    fromBlock,
    toBlock,
    strict: true,
  });

  const decoded: DecodedSeatVaultLog[] = [];
  for (const log of logs) {
    const row = decodeSeatVaultLog(log);
    if (row) decoded.push(row);
  }

  decoded.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber - b.blockNumber
  );
  return decoded;
}

type DecodedContractLog = Log & {
  eventName?: string;
  args?: {
    traderId?: bigint;
    staker?: `0x${string}`;
    amount?: bigint;
    unlockTime?: bigint;
  };
};

export function decodeSeatVaultLog(
  log: DecodedContractLog
): DecodedSeatVaultLog | null {
  if (
    log.blockNumber == null ||
    log.logIndex == null ||
    log.transactionHash == null
  ) {
    return null;
  }

  const eventName = log.eventName;
  const args = log.args;
  if (!eventName || !args) return null;
  if (
    eventName !== "Staked" &&
    eventName !== "UnstakeInitiated" &&
    eventName !== "Unstaked"
  ) {
    return null;
  }

  if (
    args.traderId === undefined ||
    args.staker === undefined ||
    args.amount === undefined
  ) {
    return null;
  }

  return {
    eventName,
    onChainTraderId: Number(args.traderId),
    staker: args.staker.toLowerCase(),
    amountWei: args.amount.toString(),
    unlockTime:
      args.unlockTime === undefined ? undefined : Number(args.unlockTime),
    blockNumber: Number(log.blockNumber),
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash.toLowerCase(),
  };
}
