import {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  LEGACY_SEAT_VAULT_CONFIRMATION_DEPTH,
} from "../lib/legacy";
import { requireRpcUrl, resolveActiveNetworkSlug } from "../lib/networks";
import { resolveAddress } from "../lib/resolveAddress";

/**
 * Resolve configured SeatVault address from the legacy deployment record.
 * Env vars, if set, must match. SeatVault itself is retired at #262.
 */
export function resolveConfiguredSeatVaultAddress(): string {
  return resolveAddress(
    [
      process.env.ACTIVE_SEAT_VAULT_ADDRESS,
      process.env.SEAT_VAULT_ADDRESS,
      process.env.NEXT_PUBLIC_SEAT_VAULT_ADDRESS,
    ],
    ACTIVE_BASE_SEPOLIA_DEPLOYMENT.seatVault,
    "SEAT_VAULT_ADDRESS",
    "legacy Base Sepolia deployment"
  ).toLowerCase();
}

export function resolveRpcUrl(): string {
  return requireRpcUrl(resolveActiveNetworkSlug());
}

export function resolveConfirmationDepth(): number {
  const raw = process.env.SEAT_VAULT_CONFIRMATION_DEPTH;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return LEGACY_SEAT_VAULT_CONFIRMATION_DEPTH;
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
