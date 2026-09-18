import { normalizeWalletAddress } from "@margin-call/shared/address";
import { zeroAddress } from "viem";

function normalizeOptional(address: string | null | undefined): string | null {
  if (address == null) return null;
  try {
    return normalizeWalletAddress(address);
  } catch {
    return null;
  }
}

/** Current NFT owner may close (and repay). Case-insensitive. */
export function isPositionOwner(
  wallet: string | null | undefined,
  owner: string
): boolean {
  const walletAddr = normalizeOptional(wallet);
  const ownerAddr = normalizeOptional(owner);
  return walletAddr != null && ownerAddr != null && walletAddr === ownerAddr;
}

/**
 * Owner or appointed executor may repay. A zero executor is not a manager.
 * Authority is derived from live Base state, not list-page provenance.
 */
export function isPositionManager(
  wallet: string | null | undefined,
  owner: string,
  executor: string
): boolean {
  if (isPositionOwner(wallet, owner)) return true;
  const walletAddr = normalizeOptional(wallet);
  const executorAddr = normalizeOptional(executor);
  if (walletAddr == null || executorAddr == null) return false;
  if (executorAddr === zeroAddress) return false;
  return walletAddr === executorAddr;
}
