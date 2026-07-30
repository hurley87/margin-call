/**
 * Contract addresses from Convex env (mirrors NEXT_PUBLIC_* in the Next app).
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type ConvexContractAddresses = {
  mockUsd: `0x${string}`;
  packCustody: `0x${string}`;
  assetRegistry: `0x${string}`;
  ripEngine: `0x${string}`;
};

function requireAddress(envKey: string): `0x${string}` {
  const value = process.env[envKey]?.trim();
  if (!value) {
    throw new Error(`${envKey} is not set in Convex env`);
  }
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`${envKey} must be a 0x-prefixed 20-byte address`);
  }
  return value as `0x${string}`;
}

/** Addresses required for Starter Grant + pool indexing. */
export function requireIndexerAddresses(): ConvexContractAddresses {
  return {
    mockUsd: requireAddress("MOCKUSD_ADDRESS"),
    packCustody: requireAddress("PACKCUSTODY_ADDRESS"),
    assetRegistry: requireAddress("ASSETREGISTRY_ADDRESS"),
    ripEngine: requireAddress("RIPENGINE_ADDRESS"),
  };
}
