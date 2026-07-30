/**
 * Contract addresses from Convex env (mirrors NEXT_PUBLIC_* in the Next app).
 * Address parsing lives in `@margin-call/shared`.
 */
import { requireEnvAddress } from "@margin-call/shared";

export type ConvexContractAddresses = {
  mockUsd: `0x${string}`;
  packCustody: `0x${string}`;
  assetRegistry: `0x${string}`;
  ripEngine: `0x${string}`;
};

function requireConvexAddress(envKey: string): `0x${string}` {
  try {
    return requireEnvAddress(envKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === `${envKey} is not set`) {
      throw new Error(`${envKey} is not set in Convex env`);
    }
    throw err;
  }
}

/** Addresses required for Starter Grant + pool indexing. */
export function requireIndexerAddresses(): ConvexContractAddresses {
  return {
    mockUsd: requireConvexAddress("MOCKUSD_ADDRESS"),
    packCustody: requireConvexAddress("PACKCUSTODY_ADDRESS"),
    assetRegistry: requireConvexAddress("ASSETREGISTRY_ADDRESS"),
    ripEngine: requireConvexAddress("RIPENGINE_ADDRESS"),
  };
}
