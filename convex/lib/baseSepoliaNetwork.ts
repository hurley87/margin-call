/**
 * Environment-free canonical Base Sepolia network configuration.
 * Every active financial, auth, MCP, agent, wallet, and SeatVault path
 * must resolve chain identity and protocol addresses from this module.
 */
import { baseSepolia } from "viem/chains";

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

export const CONTRACTS_CHAIN = baseSepolia;
export const CONTRACTS_CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;

/** True when `chainId` is Base Sepolia (numeric id, numeric string, or CAIP-2). */
export function isBaseSepoliaChainId(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === BASE_SEPOLIA_CHAIN_ID;
  return (
    chainId === BASE_SEPOLIA_CAIP2 || chainId === String(BASE_SEPOLIA_CHAIN_ID)
  );
}
