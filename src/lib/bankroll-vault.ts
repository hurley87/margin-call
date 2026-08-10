import { erc4626Abi, isAddress, type Address } from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import { deskDollarsAbi, getDeskDollarsTokenAddress } from "./desk-dollars";

// Standard ERC-20/4626 entries come from viem; only the vault-specific
// accounting views need hand-written fragments.
export const bankrollVaultAbi = [
  ...erc4626Abi,
  {
    type: "function",
    name: "grossAssets",
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
    name: "reservedLiabilities",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "safetyBuffer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "freeLiquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
  | "unrecognizedMargin"
  | "reservedLiabilities"
  | "safetyBuffer"
  | "freeLiquidity";

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
  // The deposits-only vault deployed today predates these accounting views.
  // They degrade to undefined instead of failing the whole load, so the LP
  // Desk (and deposits) keep working until the contract redeploy and the
  // NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS cutover land.
  const readVaultIfDeployed = (functionName: VaultViewName) =>
    readVault(functionName).catch(() => undefined);
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
    reservedLiabilities,
    safetyBuffer,
    freeLiquidity,
    maxWithdraw,
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
    readVaultIfDeployed("reservedLiabilities"),
    readVaultIfDeployed("safetyBuffer"),
    readVaultIfDeployed("freeLiquidity"),
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName: "maxWithdraw",
      args: [walletAddress],
    }),
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
    reservedLiabilities,
    safetyBuffer,
    freeLiquidity,
    maxWithdraw,
  };
}
