/**
 * V1 Pack-rip contract addresses for Robinhood Chain testnet.
 *
 * Populated by deploy scripts into `.env.local` (`NEXT_PUBLIC_*`). Convex actions
 * mirror the same values via `npx convex env set <KEY> <addr>` (see `.env.example`).
 */
import { PAYMENT_CHAIN_SLUG, parseAddress } from "@margin-call/shared";

export type ContractAddresses = {
  mockUsd: `0x${string}`;
  packCustody: `0x${string}`;
  assetRegistry: `0x${string}`;
  ripEngine: `0x${string}`;
  gameToken: `0x${string}`;
  distributor: `0x${string}`;
};

function readAddress(envKey: string): `0x${string}` | undefined {
  try {
    return parseAddress(process.env[envKey]);
  } catch {
    throw new Error(`${envKey} must be a 0x-prefixed 20-byte address`);
  }
}

function requirePublicAddress(envKey: string): `0x${string}` {
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
    mockUsd: requirePublicAddress("NEXT_PUBLIC_MOCKUSD_ADDRESS"),
    packCustody: requirePublicAddress("NEXT_PUBLIC_PACKCUSTODY_ADDRESS"),
    assetRegistry: requirePublicAddress("NEXT_PUBLIC_ASSETREGISTRY_ADDRESS"),
    ripEngine: requirePublicAddress("NEXT_PUBLIC_RIPENGINE_ADDRESS"),
    gameToken: requirePublicAddress("NEXT_PUBLIC_GAMETOKEN_ADDRESS"),
    distributor: requirePublicAddress("NEXT_PUBLIC_DISTRIBUTOR_ADDRESS"),
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

/** Read a single optional public MockUSD address (UI balance reads). */
export function getMockUsdAddress(): `0x${string}` | undefined {
  try {
    return parseAddress(process.env.NEXT_PUBLIC_MOCKUSD_ADDRESS);
  } catch {
    return undefined;
  }
}
