import { createPublicClient, http, isAddress, type Address } from "viem";
import { baseSepolia } from "viem/chains";

export const deskDollarsAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const deskDollarsFaucetAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "nextClaimAt",
    stateMutability: "view",
    inputs: [{ name: "claimant", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type DeskDollarsConfig = {
  tokenAddress: Address;
  faucetAddress: Address;
};

/** Public addresses only. These static references are required for client inlining. */
export function getDeskDollarsConfig(): DeskDollarsConfig | null {
  const tokenAddress = process.env.NEXT_PUBLIC_DESK_DOLLARS_ADDRESS;
  const faucetAddress = process.env.NEXT_PUBLIC_DESK_DOLLARS_FAUCET_ADDRESS;

  if (
    !tokenAddress ||
    !faucetAddress ||
    !isAddress(tokenAddress) ||
    !isAddress(faucetAddress)
  ) {
    return null;
  }

  return { tokenAddress, faucetAddress };
}

export const deskDollarsPublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || undefined),
});

export async function readDeskDollarsState(
  config: DeskDollarsConfig,
  walletAddress: Address
) {
  const [balance, decimals, nextClaimAt] = await Promise.all([
    deskDollarsPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    deskDollarsPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "decimals",
    }),
    deskDollarsPublicClient.readContract({
      address: config.faucetAddress,
      abi: deskDollarsFaucetAbi,
      functionName: "nextClaimAt",
      args: [walletAddress],
    }),
  ]);

  return { balance, decimals, nextClaimAt };
}

export function formatDeskDollars(value: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
