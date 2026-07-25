/**
 * Legacy Base Sepolia constants — deal-game path only (#262 deletes this).
 * Outside the Floor network registry. Floor runtime must not activate this chain.
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

/** Base mainnet chain ID — forbidden in Floor and deal-game active paths. */
export const FORBIDDEN_MAINNET_CHAIN_ID = 8453 as const;

/** Base mainnet USDC — forbidden in active transaction paths. */
export const FORBIDDEN_MAINNET_USDC =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** Legacy SeatVault indexer confirmation depth (Base-only). */
export const LEGACY_SEAT_VAULT_CONFIRMATION_DEPTH = 8 as const;

export const LEGACY_BASE_SEPOLIA_RECOMMEND_WAIT_BLOCKS = 2 as const;

export const baseSepoliaChain = baseSepolia;

/** True when `chainId` is Base Sepolia (numeric id, numeric string, or CAIP-2). */
export function isBaseSepoliaChainId(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === BASE_SEPOLIA_CHAIN_ID;
  return (
    chainId === BASE_SEPOLIA_CAIP2 || chainId === String(BASE_SEPOLIA_CHAIN_ID)
  );
}

/**
 * Fail-closed Base Sepolia RPC for legacy deploy scripts / historical tests.
 * Floor runtime must use `requireRpcUrl` from `convex/lib/networks` instead.
 */
export function requireBaseSepoliaRpcUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const url =
    env.BASE_SEPOLIA_RPC_URL?.trim() ||
    env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim();

  if (!url) {
    throw new Error(
      "Base Sepolia RPC URL is required. Set BASE_SEPOLIA_RPC_URL or NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL."
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error(`Malformed Base Sepolia RPC URL: ${url}`);
  }

  return url;
}
