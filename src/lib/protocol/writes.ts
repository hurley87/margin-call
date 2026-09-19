import {
  type Account,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { base } from "viem/chains";
import { erc20Abi, marginCallAbi } from "@/lib/protocol/abi";
import {
  decodePositionClosedTokenId,
  decodePositionOpenedTokenId,
} from "@/lib/protocol/decode";
import { baseDeployment } from "@/lib/protocol/deployment";
import {
  encodeApprove,
  encodeClosePosition,
  encodeOpenPosition,
  encodeRepay,
} from "@/lib/protocol/encode";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { repayCeiling } from "@/lib/protocol/repay";

/** Base-pinned wallet client — viem-only; callers resolve via Dynamic. */
export type ProtocolWalletClient = WalletClient<
  Transport,
  typeof base,
  Account
>;

export class ProtocolTxError extends Error {
  readonly hash?: `0x${string}`;

  constructor(message: string, hash?: `0x${string}`) {
    super(message);
    this.name = "ProtocolTxError";
    this.hash = hash;
  }
}

type SendArgs = {
  walletClient: ProtocolWalletClient;
  publicClient: BasePublicClient;
  to: `0x${string}`;
  data: `0x${string}`;
  label: string;
  onSubmitted?: (hash: `0x${string}`) => void;
};

/**
 * Send a contract tx, optionally report the hash, wait for receipt.
 * Throws ProtocolTxError (with hash when available) on revert or wait failure.
 */
export async function sendAndWait(args: SendArgs): Promise<TransactionReceipt> {
  const hash = await args.walletClient.sendTransaction({
    account: args.walletClient.account,
    chain: base,
    to: args.to,
    data: args.data,
  });
  args.onSubmitted?.(hash);

  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new ProtocolTxError(`${args.label} reverted`, hash);
  }
  return receipt;
}

export async function approveStock(args: {
  walletClient: ProtocolWalletClient;
  publicClient: BasePublicClient;
  token: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<TransactionReceipt> {
  return sendAndWait({
    walletClient: args.walletClient,
    publicClient: args.publicClient,
    to: args.token,
    data: encodeApprove({ spender: args.spender, amount: args.amount }),
    label: "Approve stock",
    onSubmitted: args.onSubmitted,
  });
}

export async function openPosition(args: {
  walletClient: ProtocolWalletClient;
  publicClient: BasePublicClient;
  assetId: bigint;
  stockAmount: bigint;
  targetLeverage: bigint;
  thesis: string;
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<{ receipt: TransactionReceipt; tokenId: bigint }> {
  const receipt = await sendAndWait({
    walletClient: args.walletClient,
    publicClient: args.publicClient,
    to: baseDeployment.marginCall,
    data: encodeOpenPosition({
      assetId: args.assetId,
      stockAmount: args.stockAmount,
      targetLeverage: args.targetLeverage,
      thesis: args.thesis,
    }),
    label: "Open position",
    onSubmitted: args.onSubmitted,
  });
  return {
    receipt,
    tokenId: decodePositionOpenedTokenId(receipt.logs),
  };
}

/**
 * Repay all debt: re-read currentDebt, approve USDC to ceiling if needed, repay.
 */
export async function repayAll(args: {
  walletClient: ProtocolWalletClient;
  publicClient: BasePublicClient;
  owner: `0x${string}`;
  tokenId: bigint;
  onSubmitted?: (hash: `0x${string}`, label: string) => void;
}): Promise<{ repaid: boolean; receipt: TransactionReceipt | null }> {
  const remaining = await args.publicClient.readContract({
    address: baseDeployment.marginCall,
    abi: marginCallAbi,
    functionName: "currentDebt",
    args: [args.tokenId],
  });

  if (remaining === 0n) {
    return { repaid: false, receipt: null };
  }

  const ceiling = repayCeiling(remaining);
  const allowance = await args.publicClient.readContract({
    address: baseDeployment.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [args.owner, baseDeployment.marginCall],
  });

  if (allowance < ceiling) {
    await sendAndWait({
      walletClient: args.walletClient,
      publicClient: args.publicClient,
      to: baseDeployment.usdc,
      data: encodeApprove({
        spender: baseDeployment.marginCall,
        amount: ceiling,
      }),
      label: "Approve USDC",
      onSubmitted: (hash) => args.onSubmitted?.(hash, "Approve USDC"),
    });
  }

  const receipt = await sendAndWait({
    walletClient: args.walletClient,
    publicClient: args.publicClient,
    to: baseDeployment.marginCall,
    data: encodeRepay({ tokenId: args.tokenId, amount: ceiling }),
    label: "Repay all",
    onSubmitted: (hash) => args.onSubmitted?.(hash, "Repay all"),
  });

  return { repaid: true, receipt };
}

export async function closePosition(args: {
  walletClient: ProtocolWalletClient;
  publicClient: BasePublicClient;
  tokenId: bigint;
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<{ receipt: TransactionReceipt; tokenId: bigint }> {
  const receipt = await sendAndWait({
    walletClient: args.walletClient,
    publicClient: args.publicClient,
    to: baseDeployment.marginCall,
    data: encodeClosePosition(args.tokenId),
    label: "Close position",
    onSubmitted: args.onSubmitted,
  });
  const closedTokenId = decodePositionClosedTokenId(receipt.logs);
  return { receipt, tokenId: closedTokenId };
}
