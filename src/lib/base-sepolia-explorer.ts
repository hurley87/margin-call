import type { Address, Hash } from "viem";
import { baseSepolia } from "viem/chains";

const BASE_SEPOLIA_EXPLORER_URL = baseSepolia.blockExplorers.default.url;

export function getBaseSepoliaTransactionUrl(transactionHash: Hash) {
  return `${BASE_SEPOLIA_EXPLORER_URL}/tx/${transactionHash}`;
}

export function getBaseSepoliaAddressUrl(address: Address) {
  return `${BASE_SEPOLIA_EXPLORER_URL}/address/${address}`;
}

export function getBaseSepoliaContractCodeUrl(address: Address) {
  return `${getBaseSepoliaAddressUrl(address)}#code`;
}
