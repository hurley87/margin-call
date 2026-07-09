"use node";

import type { Doc } from "../_generated/dataModel";
import { normalizeAddress } from "./desks";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  USDC_DECIMALS,
  USDC_SEPOLIA_ADDRESS,
  erc20Abi,
} from "./escrowConstants";

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

function decodeEscrowEvent(
  log: import("viem").Log,
  decodeEventLog: typeof import("viem").decodeEventLog
) {
  if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
    return null;
  }
  try {
    return decodeEventLog({
      abi: escrowAbi,
      data: log.data,
      topics: log.topics,
    });
  } catch {
    return null;
  }
}

export type DecodedDealCreated = {
  dealId: bigint;
  creator: string;
  prompt: string;
  pot: bigint;
  entryCost: bigint;
};

/**
 * Extract the DealCreated event emitted by the escrow contract from a receipt.
 * Binds the tx to a desk by requiring the on-chain creator to match
 * `expected.creator`, and (when given) that the event's dealId matches
 * `expected.onChainDealId`. The event carries prompt/pot/entryCost so callers
 * record what the chain actually escrowed without a follow-up read.
 */
export async function verifyDealCreatedInReceipt(
  receipt: import("viem").TransactionReceipt,
  expected: { creator: string; onChainDealId?: number }
): Promise<DecodedDealCreated> {
  const { decodeEventLog } = await import("viem");
  let dealEvent: DecodedDealCreated | undefined;
  for (const log of receipt.logs) {
    const decoded = decodeEscrowEvent(log, decodeEventLog);
    if (!decoded || decoded.eventName !== "DealCreated") continue;
    dealEvent = decoded.args as DecodedDealCreated;
    break;
  }
  if (!dealEvent) {
    throw new Error(
      "Transaction succeeded but no DealCreated event from the escrow contract was found — txHash does not match this deal"
    );
  }
  if (
    expected.onChainDealId !== undefined &&
    Number(dealEvent.dealId) !== expected.onChainDealId
  ) {
    throw new Error("onChainDealId does not match the DealCreated event");
  }
  if (dealEvent.creator.toLowerCase() !== expected.creator.toLowerCase()) {
    throw new Error("Deal creator does not match the expected desk wallet");
  }
  return dealEvent;
}

/** Require a Deposit event matching fund_trader intent payload. */
export async function verifyEscrowDepositInReceipt(
  receipt: import("viem").TransactionReceipt,
  expected: { tokenId: number; amountAtomic: bigint }
): Promise<void> {
  const { decodeEventLog } = await import("viem");
  for (const log of receipt.logs) {
    const decoded = decodeEscrowEvent(log, decodeEventLog);
    if (!decoded || decoded.eventName !== "Deposit") continue;
    const args = decoded.args as { traderId: bigint; amount: bigint };
    if (
      args.traderId === BigInt(expected.tokenId) &&
      args.amount === expected.amountAtomic
    ) {
      return;
    }
  }
  throw new Error(
    "Transaction succeeded but no matching Deposit event from the escrow contract was found — txHash does not match this fund intent"
  );
}

/** Require a Withdrawal event matching withdraw_from_trader intent payload. */
export async function verifyEscrowWithdrawalInReceipt(
  receipt: import("viem").TransactionReceipt,
  expected: { tokenId: number; amountAtomic: bigint }
): Promise<void> {
  const { decodeEventLog } = await import("viem");
  for (const log of receipt.logs) {
    const decoded = decodeEscrowEvent(log, decodeEventLog);
    if (!decoded || decoded.eventName !== "Withdrawal") continue;
    const args = decoded.args as { traderId: bigint; amount: bigint };
    if (
      args.traderId === BigInt(expected.tokenId) &&
      args.amount === expected.amountAtomic
    ) {
      return;
    }
  }
  throw new Error(
    "Transaction succeeded but no matching Withdrawal event from the escrow contract was found — txHash does not match this withdraw intent"
  );
}

/** Authoritative on-chain USDC balance for a desk wallet (Base Sepolia). */
export async function readDeskUsdcBalance(
  walletAddress: string
): Promise<number> {
  const publicClient = await getBaseSepoliaPublicClient();
  const raw = await publicClient.readContract({
    address: USDC_SEPOLIA_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [normalizeAddress(walletAddress) as `0x${string}`],
  });
  return Number(raw) / USDC_DECIMALS;
}
