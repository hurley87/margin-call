import { isAddress, type Address } from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import { deskDollarsAbi, getDeskDollarsTokenAddress } from "./desk-dollars";

export const bankrollVaultAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "grossAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "assetsPerShare",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingObligations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "unrecognizedMargin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

export type BankrollVaultConfig = {
  tokenAddress: Address;
  vaultAddress: Address;
};

/** Public addresses only. Static access lets Next.js inline these in client builds. */
export function getBankrollVaultConfig(): BankrollVaultConfig | null {
  const tokenAddress = getDeskDollarsTokenAddress();
  const vaultAddress = process.env.NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS;
  if (!tokenAddress || !vaultAddress || !isAddress(vaultAddress)) {
    return null;
  }
  return { tokenAddress, vaultAddress };
}

type VaultViewName =
  | "grossAssets"
  | "totalAssets"
  | "totalSupply"
  | "assetsPerShare"
  | "pendingObligations"
  | "unrecognizedMargin";

export async function readBankrollVaultState(
  config: BankrollVaultConfig,
  walletAddress: Address
) {
  const readVault = (functionName: VaultViewName) =>
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName,
    });
  const [
    tUsdBalance,
    shareBalance,
    allowance,
    grossAssets,
    totalAssets,
    totalSupply,
    assetsPerShare,
    pendingObligations,
    unrecognizedMargin,
  ] = await Promise.all([
    baseSepoliaPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    baseSepoliaPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "allowance",
      args: [walletAddress, config.vaultAddress],
    }),
    readVault("grossAssets"),
    readVault("totalAssets"),
    readVault("totalSupply"),
    readVault("assetsPerShare"),
    readVault("pendingObligations"),
    readVault("unrecognizedMargin"),
  ]);
  return {
    tUsdBalance,
    shareBalance,
    allowance,
    grossAssets,
    totalAssets,
    totalSupply,
    assetsPerShare,
    pendingObligations,
    unrecognizedMargin,
  };
}
