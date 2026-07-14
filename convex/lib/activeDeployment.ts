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
  version: 2,
  chainId: BASE_SEPOLIA_CHAIN_ID,
  escrow: "0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03",
  margincallToken: "0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7",
  seatVault: "0xA901DFC8C46faF3A24F4002849dE98dFE9722C95",
  deployedAt: "2026-07-14T01:20:34.822Z",
} as const satisfies ActiveBaseSepoliaDeployment;
