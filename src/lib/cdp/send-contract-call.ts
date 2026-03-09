import "server-only";

import { encodeFunctionData, type Abi } from "viem";
import type { TraderSmartAccount } from "./trader-wallet";

interface ContractCallParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * Send a contract call from a CDP Smart Account using a UserOperation.
 * Gas is automatically sponsored on Base Sepolia (no paymaster needed).
 * For mainnet, pass paymasterUrl in the sendUserOperation options.
 */
export async function sendContractCall(
  smartAccount: TraderSmartAccount,
  { address, abi, functionName, args }: ContractCallParams
): Promise<{ userOpHash: string; transactionHash: string }> {
  const data = encodeFunctionData({ abi, functionName, args });

  const { userOpHash } = await smartAccount.sendUserOperation({
    network: "base-sepolia",
    calls: [{ to: address, value: BigInt(0), data }],
  });

  const receipt = await smartAccount.waitForUserOperation({ userOpHash });
  if (receipt.status !== "complete") {
    throw new Error(`UserOp failed: ${receipt.status}`);
  }

  return { userOpHash, transactionHash: receipt.transactionHash };
}

/**
 * Batch multiple contract calls into a single UserOperation.
 * ERC-4337 smart accounts can execute multiple calls atomically,
 * avoiding inter-transaction race conditions with the bundler.
 */
export async function sendBatchContractCalls(
  smartAccount: TraderSmartAccount,
  calls: ContractCallParams[]
): Promise<{ userOpHash: string; transactionHash: string }> {
  const encoded = calls.map(({ address, abi, functionName, args }) => ({
    to: address,
    value: BigInt(0),
    data: encodeFunctionData({ abi, functionName, args }),
  }));

  const { userOpHash } = await smartAccount.sendUserOperation({
    network: "base-sepolia",
    calls: encoded,
  });

  const receipt = await smartAccount.waitForUserOperation({ userOpHash });
  if (receipt.status !== "complete") {
    throw new Error(`UserOp failed: ${receipt.status}`);
  }

  return { userOpHash, transactionHash: receipt.transactionHash };
}
