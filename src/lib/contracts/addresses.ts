/**
 * V1 Pack-rip contract addresses for Robinhood Chain testnet.
 *
 * Populated by deploy scripts into `.env.local` (`NEXT_PUBLIC_*`). Convex indexers
 * should mirror the same values via `npx convex env set <KEY> <addr>` when #305 lands.
 */
import { PAYMENT_CHAIN_SLUG } from "@/lib/privy/config";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type ContractAddresses = {
  mockUsd: `0x${string}`;
  packCustody: `0x${string}`;
  assetRegistry: `0x${string}`;
  ripEngine: `0x${string}`;
  gameToken: `0x${string}`;
  distributor: `0x${string}`;
};

function readAddress(envKey: string): `0x${string}` | undefined {
  const value = process.env[envKey]?.trim();
  if (!value) return undefined;
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`${envKey} must be a 0x-prefixed 20-byte address`);
  }
  return value as `0x${string}`;
}

function requireAddress(envKey: string): `0x${string}` {
  const address = readAddress(envKey);
  if (!address) {
    throw new Error(
      `${envKey} is required when NEXT_PUBLIC_MARGIN_CALL_NETWORK=${PAYMENT_CHAIN_SLUG}`
    );
  }
  return address;
}

/**
 * Resolve the V1 contract set from public env.
 * Returns `null` when the network is not Robinhood testnet (no addresses expected).
 * Throws when Robinhood testnet is selected but any required address is missing/invalid.
 */
export function getContractAddresses(): ContractAddresses | null {
  const network =
    process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK ??
    process.env.MARGIN_CALL_NETWORK;

  if (network !== PAYMENT_CHAIN_SLUG) {
    return null;
  }

  return {
    mockUsd: requireAddress("NEXT_PUBLIC_MOCKUSD_ADDRESS"),
    packCustody: requireAddress("NEXT_PUBLIC_PACKCUSTODY_ADDRESS"),
    assetRegistry: requireAddress("NEXT_PUBLIC_ASSETREGISTRY_ADDRESS"),
    ripEngine: requireAddress("NEXT_PUBLIC_RIPENGINE_ADDRESS"),
    gameToken: requireAddress("NEXT_PUBLIC_GAMETOKEN_ADDRESS"),
    distributor: requireAddress("NEXT_PUBLIC_DISTRIBUTOR_ADDRESS"),
  };
}

/** Convenience: non-null addresses for Robinhood testnet, or throw. */
export function requireContractAddresses(): ContractAddresses {
  const addresses = getContractAddresses();
  if (!addresses) {
    throw new Error(
      `Contract addresses only resolve when NEXT_PUBLIC_MARGIN_CALL_NETWORK=${PAYMENT_CHAIN_SLUG}`
    );
  }
  return addresses;
}
