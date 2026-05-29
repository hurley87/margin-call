"use node";

import type { Doc } from "../_generated/dataModel";
import { normalizeAddress } from "./desks";

export function requireDeskWallet(
  dm: Pick<Doc<"deskManagers">, "walletAddress">
): `0x${string}` {
  if (!dm.walletAddress) {
    throw new Error(
      "Desk wallet not bound — call set_desk_wallet with your Base Account address (from Base MCP) before treasury operations"
    );
  }
  return normalizeAddress(dm.walletAddress) as `0x${string}`;
}

const TX_RECEIPT_TIMEOUT_MS = 60_000;

/** Build a Base Sepolia public client with the default HTTP transport. */
export async function getBaseSepoliaPublicClient() {
  const { createPublicClient, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  return createPublicClient({ chain: baseSepolia, transport: http() });
}

/**
 * Wait for a submitted tx to mine and assert it did not revert. Returns both
 * the receipt and the publicClient so callers can do follow-up reads without
 * re-instantiating viem. confirm is invoked immediately after Base MCP
 * `send_calls`, before the tx is reliably indexed, hence `waitForTransactionReceipt`.
 */
export async function verifyTxSucceeded(txHash: string): Promise<{
  receipt: import("viem").TransactionReceipt;
  publicClient: Awaited<ReturnType<typeof getBaseSepoliaPublicClient>>;
}> {
  const publicClient = await getBaseSepoliaPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: TX_RECEIPT_TIMEOUT_MS,
  });
  if (receipt.status === "reverted") {
    throw new Error("Transaction reverted on-chain");
  }
  return { receipt, publicClient };
}
