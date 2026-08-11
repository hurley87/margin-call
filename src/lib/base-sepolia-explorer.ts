import type { Address, Hash } from "viem";

const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia.basescan.org";

export function getBaseSepoliaAddressUrl(address: Address) {
  return `${BASE_SEPOLIA_EXPLORER_URL}/address/${address}`;
}

export function getBaseSepoliaTransactionUrl(transactionHash: Hash) {
  return `${BASE_SEPOLIA_EXPLORER_URL}/tx/${transactionHash}`;
}
