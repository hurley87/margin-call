import { BASE_SEPOLIA_CHAIN_ID } from "./baseSepoliaNetwork";

/**
 * Typed mirror of contracts/deployments/base-sepolia.active.json.
 *
 * Update this file and the JSON together when activating a new deployment
 * (requires human approval per #211). Env vars, if set, must match these
 * addresses or the app fails closed at startup.
 */
export type ActiveBaseSepoliaDeployment = {
  version: number;
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  escrow: `0x${string}`;
  margincallToken: `0x${string}`;
  seatVault: `0x${string}`;
  deployedAt: string;
};

export const ACTIVE_BASE_SEPOLIA_DEPLOYMENT = {
  version: 1,
  chainId: BASE_SEPOLIA_CHAIN_ID,
  escrow: "0xa244550f0e35032E9c0b09DA4EB4933848d28d16",
  margincallToken: "0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7",
  seatVault: "0xa8595b279Aeadc8a0d2ce779Dc8Ba4d978eA2f44",
  deployedAt: "2026-07-11T14:54:08.995Z",
} as const satisfies ActiveBaseSepoliaDeployment;
