import { ACTIVE_BASE_SEPOLIA_DEPLOYMENT } from "../lib/activeDeployment";
import { resolveAddress } from "../lib/resolveAddress";
import { requireBaseSepoliaRpcUrl } from "../lib/requireBaseSepoliaRpcUrl";
import { SEAT_VAULT_CONFIRMATION_DEPTH } from "./policy";

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
    "SEAT_VAULT_ADDRESS"
  ).toLowerCase();
}

export function resolveRpcUrl(): string {
  return requireBaseSepoliaRpcUrl();
}

export function resolveConfirmationDepth(): number {
  const raw = process.env.SEAT_VAULT_CONFIRMATION_DEPTH;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return SEAT_VAULT_CONFIRMATION_DEPTH;
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
