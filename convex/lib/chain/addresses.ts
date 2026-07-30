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

/** Addresses required for Starter Grant + pool indexing. */
export function requireIndexerAddresses(): ConvexContractAddresses {
  const req = (envKey: string) => requireEnvAddress(envKey, "Convex env");
  return {
    mockUsd: req("MOCKUSD_ADDRESS"),
    packCustody: req("PACKCUSTODY_ADDRESS"),
    assetRegistry: req("ASSETREGISTRY_ADDRESS"),
    ripEngine: req("RIPENGINE_ADDRESS"),
  };
}
