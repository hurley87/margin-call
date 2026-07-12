import { SEAT_VAULT_CONFIRMATION_DEPTH, SEAT_VAULT_V1 } from "./policy";

/**
 * Resolve configured SeatVault address for Convex (no module-load throw).
 * Prefer ACTIVE_SEAT_VAULT_ADDRESS, then SEAT_VAULT_ADDRESS, then v1 deploy.
 */
export function resolveConfiguredSeatVaultAddress(): string {
  const fromEnv =
    process.env.ACTIVE_SEAT_VAULT_ADDRESS ?? process.env.SEAT_VAULT_ADDRESS;
  if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) {
    return fromEnv.toLowerCase();
  }
  return SEAT_VAULT_V1.address.toLowerCase();
}

export function resolveRpcUrl(): string | undefined {
  return (
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
  );
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
