/**
 * Base Sepolia network config — legacy deal-game path (#249).
 * Removed at #262 cutover. Kept as an ordinary registry row so existing
 * escrow / SeatVault / agent consumers can resolve through the shared boundary.
 * Environment-free: no RPC, no env reads.
 */
import { baseSepolia } from "viem/chains";
import type { NetworkConfig } from "./types";

export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const BASE_SEPOLIA_CAIP2 = "eip155:84532" as const;
export const BASE_SEPOLIA_SLUG = "base-sepolia" as const;

/** Circle test USDC on Base Sepolia. */
export const USDC_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const IDENTITY_REGISTRY_ADDRESS =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

export const REPUTATION_REGISTRY_ADDRESS =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const ERC6551_REGISTRY_ADDRESS =
  "0x000000006551c19487814612e58FE06813775758" as const;

export const ERC6551_DEFAULT_IMPLEMENTATION =
  "0x55266d75D1a14E4572138116aF39863Ed6596E7F" as const;

/** Base mainnet chain ID — forbidden in active transaction paths. */
export const FORBIDDEN_MAINNET_CHAIN_ID = 8453 as const;

/** Base mainnet USDC — forbidden in active transaction paths. */
export const FORBIDDEN_MAINNET_USDC =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export const baseSepoliaChain = baseSepolia;

export const BASE_SEPOLIA_NETWORK = {
  slug: BASE_SEPOLIA_SLUG,
  name: "Base Sepolia",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  caip2: BASE_SEPOLIA_CAIP2,
  legacy: true,
  nativeGasAsset: {
    symbol: "ETH",
    decimals: 18,
    label: "test ETH (Base Sepolia)",
  },
  rpc: {
    primaryEnvKey: "BASE_SEPOLIA_RPC_URL",
    publicEnvKey: "NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL",
  },
  publicRpcUrl: "https://sepolia.base.org",
  explorer: {
    browserUrl: "https://sepolia.basescan.org",
    apiUrl: "https://api-sepolia.basescan.org/api",
    name: "Basescan",
  },
  confirmation: {
    recommendWaitBlocks: 2,
    finalityModel: "op-stack-l2",
    notes: "Legacy deal-game confirmation depth. Removed at #262.",
    seatVaultConfirmationDepth: 8,
  },
  forbiddenMainnetChainId: FORBIDDEN_MAINNET_CHAIN_ID,
  assets: [
    {
      id: "usdc",
      kind: "payment-token",
      status: "canonical",
      label: "Circle test USDC (Base Sepolia)",
      address: USDC_SEPOLIA_ADDRESS,
      decimalsHint: 6,
    },
    {
      id: "identity-registry",
      kind: "registry",
      status: "canonical",
      label: "ERC-8004 Identity Registry",
      address: IDENTITY_REGISTRY_ADDRESS,
    },
    {
      id: "reputation-registry",
      kind: "registry",
      status: "canonical",
      label: "ERC-8004 Reputation Registry",
      address: REPUTATION_REGISTRY_ADDRESS,
    },
    {
      id: "erc6551-registry",
      kind: "registry",
      status: "canonical",
      label: "ERC-6551 Token Bound Account Registry",
      address: ERC6551_REGISTRY_ADDRESS,
    },
    {
      id: "erc6551-account-implementation",
      kind: "account-implementation",
      status: "canonical",
      label: "Tokenbound AccountV3",
      address: ERC6551_DEFAULT_IMPLEMENTATION,
    },
  ],
} as const satisfies NetworkConfig;

/** True when `chainId` is Base Sepolia (numeric id, numeric string, or CAIP-2). */
export function isBaseSepoliaChainId(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === BASE_SEPOLIA_CHAIN_ID;
  return (
    chainId === BASE_SEPOLIA_CAIP2 || chainId === String(BASE_SEPOLIA_CHAIN_ID)
  );
}
