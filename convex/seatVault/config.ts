import {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  BASE_SEPOLIA_SLUG,
  requireRpcUrl,
  seatVaultConfirmationDepth,
} from "../lib/networks";
import { resolveAddress } from "../lib/resolveAddress";

/**
 * Resolve configured SeatVault address from the canonical active deployment.
 * Env vars, if set, must match the active record.
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
    "active Base Sepolia deployment"
  ).toLowerCase();
}

export function resolveRpcUrl(): string {
  return requireRpcUrl(BASE_SEPOLIA_SLUG);
}

export function resolveConfirmationDepth(): number {
  const raw = process.env.SEAT_VAULT_CONFIRMATION_DEPTH;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return seatVaultConfirmationDepth(BASE_SEPOLIA_SLUG);
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
