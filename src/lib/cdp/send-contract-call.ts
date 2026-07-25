import "server-only";

import { encodeFunctionData, type Abi } from "viem";
import { resolveActiveNetworkSlug } from "@/lib/network";
import type { TraderSmartAccount } from "./trader-wallet";

interface ContractCallParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * Send a contract call from a CDP Smart Account using a UserOperation.
 * Network follows the active Floor slug (Robinhood Chain testnet).
 * CDP may not yet support robinhood-testnet — mint/send will fail closed until it does.
 */
export async function sendContractCall(
  smartAccount: TraderSmartAccount,
  { address, abi, functionName, args }: ContractCallParams
): Promise<{ userOpHash: string; transactionHash: string }> {
  const data = encodeFunctionData({ abi, functionName, args });
  const network = resolveActiveNetworkSlug();

  const { userOpHash } = await smartAccount.sendUserOperation({
    // CDP typed networks are Base/Eth today; Floor passes the active slug.
    network: network as "base-sepolia",
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
  const network = resolveActiveNetworkSlug();

  const { userOpHash } = await smartAccount.sendUserOperation({
    network: network as "base-sepolia",
    calls: encoded,
  });

  const receipt = await smartAccount.waitForUserOperation({ userOpHash });
  if (receipt.status !== "complete") {
    throw new Error(`UserOp failed: ${receipt.status}`);
  }

  return { userOpHash, transactionHash: receipt.transactionHash };
}
