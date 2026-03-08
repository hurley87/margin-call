import { createPublicClient, http } from "viem";
import { CONTRACTS_CHAIN } from "./escrow";

function buildPublicClient() {
  return createPublicClient({
    chain: CONTRACTS_CHAIN,
    transport: http(),
  });
}

let cached: ReturnType<typeof buildPublicClient> | undefined;

export function makePublicClient() {
  if (!cached) {
    cached = buildPublicClient();
  }
  return cached;
}
