import { formatEther } from "viem";
import { describe, expect, it, vi } from "vitest";
import { readWalletBalances } from "@/lib/wallets/balances";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

describe("readWalletBalances", () => {
  it("reads ETH and ERC-20 balances for a Base address", async () => {
    const ethRaw = 2_100_000_000_000_000n;
    const usdcRaw = 12_500_000n;

    const client = {
      getBalance: vi.fn(async () => ethRaw),
      readContract: vi.fn(async () => usdcRaw),
    };

    const balances = await readWalletBalances(client, ADDRESS, [
      { token: USDC, symbol: "USDC", decimals: 6 },
    ]);

    expect(client.getBalance).toHaveBeenCalledWith({ address: ADDRESS });
    expect(balances).toEqual({
      address: ADDRESS,
      ethRaw,
      eth: formatEther(ethRaw),
      tokens: [
        {
          token: USDC,
          symbol: "USDC",
          decimals: 6,
          raw: usdcRaw,
          formatted: "12.5",
        },
      ],
    });
  });
});
