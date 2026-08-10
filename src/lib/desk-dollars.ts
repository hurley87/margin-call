import { erc20Abi, isAddress, type Address } from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";

export const TUSD_DECIMALS = 6;

// Desk Dollars is a plain ERC-20 to its consumers; the faucet ABI below is
// the only custom surface.
export const deskDollarsAbi = erc20Abi;

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

/** Public address only. The static env reference is required for client inlining. */
export function getDeskDollarsTokenAddress(): Address | null {
  const tokenAddress = process.env.NEXT_PUBLIC_DESK_DOLLARS_ADDRESS;
  return tokenAddress && isAddress(tokenAddress) ? tokenAddress : null;
}

/** Public addresses only. These static references are required for client inlining. */
export function getDeskDollarsConfig(): DeskDollarsConfig | null {
  const tokenAddress = getDeskDollarsTokenAddress();
  const faucetAddress = process.env.NEXT_PUBLIC_DESK_DOLLARS_FAUCET_ADDRESS;

  if (!tokenAddress || !faucetAddress || !isAddress(faucetAddress)) {
    return null;
  }

  return { tokenAddress, faucetAddress };
}

export async function readDeskDollarsState(
  config: DeskDollarsConfig,
  walletAddress: Address
) {
  const [balance, decimals, nextClaimAt] = await Promise.all([
    baseSepoliaPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    baseSepoliaPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "decimals",
    }),
    baseSepoliaPublicClient.readContract({
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

const TUSD_SCALE = 10n ** BigInt(TUSD_DECIMALS);
const TUSD_INPUT_PATTERN = new RegExp(`^\\d+(?:\\.\\d{0,${TUSD_DECIMALS}})?$`);

/** Parses a user-entered Desk Dollars amount without floating-point arithmetic. */
export function parseTUsdInput(input: string): bigint | null {
  if (!TUSD_INPUT_PATTERN.test(input)) return null;

  const [whole, fraction = ""] = input.split(".");
  return (
    BigInt(whole) * TUSD_SCALE + BigInt(fraction.padEnd(TUSD_DECIMALS, "0"))
  );
}
