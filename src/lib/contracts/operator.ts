import "server-only";

import { createWalletClient, http, nonceManager, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS_CHAIN } from "./escrow";
import { baseSepoliaRpcUrl, makePublicClient } from "./client";

interface OperatorContractCallParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

function buildOperatorClient() {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) {
    throw new Error("OPERATOR_PRIVATE_KEY env var is not set");
  }
  const account = privateKeyToAccount(key as `0x${string}`, {
    nonceManager,
  });
  return createWalletClient({
    account,
    chain: CONTRACTS_CHAIN,
    transport: http(baseSepoliaRpcUrl),
  });
}

let cached: ReturnType<typeof buildOperatorClient> | null = null;

/**
 * Get the operator wallet client (cached singleton).
 * The operator is the server-side signer authorized to call
 * enterDeal() and resolveEntry() on the escrow contract.
 *
 * This module is server-only — it must never be imported from client code.
 */
export function makeOperatorWalletClient() {
  if (!cached) {
    cached = buildOperatorClient();
  }
  return cached;
}

/**
 * Send an operator-authorized contract call and wait for confirmation.
 */
export async function sendOperatorContractCall({
  address,
  abi,
  functionName,
  args,
}: OperatorContractCallParams): Promise<{ transactionHash: `0x${string}` }> {
  const walletClient = makeOperatorWalletClient();
  const publicClient = makePublicClient();

  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName,
    args,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { transactionHash: receipt.transactionHash };
}
