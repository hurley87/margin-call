import { makePublicClient } from "./client";
import { ESCROW_ADDRESS, escrowAbi } from "./escrow";
import { createServerClient } from "@/lib/supabase/client";

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

/** Fetch on-chain escrow balance and sync it to the traders table. */
export async function syncTraderEscrow(
  traderId: string,
  tokenId: number | bigint,
  context: string
): Promise<void> {
  const latestEscrowUsdc = await getEscrowBalance(tokenId);
  const supabase = createServerClient();
  const { error } = await supabase
    .from("traders")
    .update({ escrow_balance_usdc: latestEscrowUsdc })
    .eq("id", traderId);
  if (error) {
    console.error(`Failed to sync trader escrow (${context}):`, {
      traderId,
      tokenId: String(tokenId),
      latestEscrowUsdc,
      error: error.message,
    });
  }
}
