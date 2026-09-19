import { formatEther, formatUnits } from "viem";
import { erc20Abi } from "@/lib/protocol/abi";

export type TokenSpec = {
  token: `0x${string}`;
  symbol: string;
  decimals: number;
};

export type TokenBalance = TokenSpec & {
  raw: bigint;
  formatted: string;
};

export type WalletBalances = {
  address: `0x${string}`;
  ethRaw: bigint;
  eth: string;
  tokens: TokenBalance[];
};

export type BalanceClient = {
  getBalance: (args: { address: `0x${string}` }) => Promise<bigint>;
  readContract: (args: {
    address: `0x${string}`;
    abi: typeof erc20Abi;
    functionName: "balanceOf";
    args: readonly [`0x${string}`];
  }) => Promise<unknown>;
};

/**
 * Read native ETH and ERC-20 balances. Wallet-agnostic — any address works.
 */
export async function readWalletBalances(
  client: BalanceClient,
  address: `0x${string}`,
  tokens: readonly TokenSpec[]
): Promise<WalletBalances> {
  const ethRaw = await client.getBalance({ address });
  const tokenBalances: TokenBalance[] = [];

  for (const spec of tokens) {
    const raw = (await client.readContract({
      address: spec.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
    tokenBalances.push({
      ...spec,
      raw,
      formatted: formatUnits(raw, spec.decimals),
    });
  }

  return {
    address,
    ethRaw,
    eth: formatEther(ethRaw),
    tokens: tokenBalances,
  };
}
