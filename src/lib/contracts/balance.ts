import { makePublicClient } from "./client";
import { ESCROW_ADDRESS, escrowAbi } from "./escrow";

/** Read on-chain escrow balance for a trader (in USDC, human-readable). */
export async function getEscrowBalance(
  tokenId: number | bigint
): Promise<number> {
  const publicClient = makePublicClient();
  const balanceRaw = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: [BigInt(tokenId)],
  });
  return Number(balanceRaw) / 1_000_000;
}

/**
 * Legacy shim retained during Convex cutover.
 * Escrow persistence now lives in Convex cycle logic.
 */
export async function syncTraderEscrow(
  traderId: string,
  tokenId: number | bigint,
  context: string
): Promise<void> {
  console.warn("[syncTraderEscrow] deprecated no-op during Convex migration", {
    traderId,
    tokenId: String(tokenId),
    context,
  });
}
