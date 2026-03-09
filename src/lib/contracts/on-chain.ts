import "server-only";

import { makePublicClient } from "./client";
import {
  DEAL_STATUS_OPEN,
  ESCROW_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
  escrowAbi,
  identityRegistryAbi,
} from "./escrow";

export { DEAL_STATUS_OPEN };

export interface OnChainDeal {
  creator: `0x${string}`;
  prompt: string;
  potAmount: bigint;
  entryCost: bigint;
  fee: bigint;
  status: number;
  pendingEntries: bigint;
}

/**
 * Read deal state from the escrow contract.
 * Use this before operator writes to avoid stale DB state.
 */
export async function getOnChainDeal(
  dealId: bigint
): Promise<OnChainDeal | null> {
  const publicClient = makePublicClient();
  try {
    const deal = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getDeal",
      args: [dealId],
    });
    return deal as OnChainDeal;
  } catch {
    return null;
  }
}

/**
 * Read current NFT owner for a trader token from the identity registry.
 * Use this to ensure DB ownership matches chain before operator-signed entry.
 * Throws on RPC failure so callers can distinguish network errors from missing tokens.
 */
export async function getNftOwner(tokenId: bigint): Promise<`0x${string}`> {
  const publicClient = makePublicClient();
  const owner = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  return owner as `0x${string}`;
}
