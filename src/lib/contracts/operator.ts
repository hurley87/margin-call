import "server-only";

import { createWalletClient, http, nonceManager } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS_CHAIN } from "./escrow";

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
    transport: http(),
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
