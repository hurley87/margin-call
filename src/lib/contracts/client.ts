import { createPublicClient, http } from "viem";
import { CONTRACTS_CHAIN } from "./escrow";

export function makePublicClient() {
  return createPublicClient({
    chain: CONTRACTS_CHAIN,
    transport: http(),
  });
}
