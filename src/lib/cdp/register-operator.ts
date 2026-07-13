import "server-only";

import { makeOperatorWalletClient } from "@/lib/contracts/operator";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";

/**
 * Register a Smart Account address as a settlement operator on the escrow contract.
 * Uses the existing OPERATOR_PRIVATE_KEY (contract owner) to call addSettlementOperator().
 * This is low-frequency (once per trader creation), so no nonce contention.
 */
export async function registerTraderAsOperator(
  smartAccountAddress: `0x${string}`
): Promise<`0x${string}`> {
  const walletClient = makeOperatorWalletClient();
  const publicClient = makePublicClient();

  const hash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "addSettlementOperator",
    args: [smartAccountAddress],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}
