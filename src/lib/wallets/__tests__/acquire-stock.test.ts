import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { getAssets } from "@/lib/agent/assets";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";
import type { TypedDataAgentWallet } from "@/lib/wallets/adapter";
import {
  acquireSupportedStock,
  parseAcquireCliArgs,
} from "@/lib/wallets/acquire-stock";
import type {
  ClassicSwapQuote,
  UniswapTradingApi,
} from "@/lib/uniswap/trading-api";

const ADDRESS = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c" as const;
const USDC = baseDeployment.usdc;
const NVDAC = getAssetByName("NVDAc").stock;
const WETH = "0x4200000000000000000000000000000000000006" as const;
const HASH_CANCEL =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const HASH_APPROVE =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_SWAP =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const PERMIT_SIG =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

const APPROVE_TX = {
  to: USDC,
  data: "0x095ea7b30000000000000000000000000000000000000001" as `0x${string}`,
  value: 0n,
};
const SWAP_TX = {
  to: "0x2626664c2603336E57B271c5C0b26F421741e481" as const,
  data: "0x3593564c0000000000000000000000000000000000000001" as `0x${string}`,
  value: 0n,
};

function classicQuote(
  outputToken: `0x${string}` = NVDAC,
  permit = false
): ClassicSwapQuote {
  return {
    routing: "CLASSIC",
    outputToken: getAddress(outputToken),
    amountOut: 1_100_000n,
    minimumAmountOut: 1_089_000n,
    permitData: permit
      ? {
          domain: { name: "Permit2", chainId: 8453 },
          types: { PermitSingle: [{ name: "spender", type: "address" }] },
          values: { spender: ADDRESS },
        }
      : null,
    quote: {
      output: {
        token: outputToken,
        amount: "1100000",
        minimumAmount: "1089000",
      },
    },
  };
}

function fakeWallet(): TypedDataAgentWallet & {
  sendTransaction: ReturnType<typeof vi.fn>;
  waitForReceipt: ReturnType<typeof vi.fn>;
  signTypedData: ReturnType<typeof vi.fn>;
} {
  const sendTransaction = vi.fn(async (tx: { data?: string }) => {
    if (tx.data === APPROVE_TX.data) return HASH_APPROVE;
    if (tx.data === SWAP_TX.data) return HASH_SWAP;
    return HASH_CANCEL;
  });
  return {
    address: ADDRESS,
    sendTransaction,
    waitForReceipt: vi.fn(async (hash: `0x${string}`) => ({
      hash,
      status: "success" as const,
      blockNumber: 99n,
    })),
    signTypedData: vi.fn(async () => PERMIT_SIG),
  };
}

function fakeBalances(args: { eth: bigint; usdc: bigint; stock: bigint[] }) {
  const stock = [...args.stock];
  return {
    getBalance: vi.fn(async () => args.eth),
    readContract: vi.fn(async ({ address }: { address: `0x${string}` }) => {
      if (getAddress(address) === getAddress(USDC)) return args.usdc;
      if (getAddress(address) === getAddress(NVDAC)) {
        return stock.shift() ?? 0n;
      }
      return 0n;
    }),
  };
}

function fakeTrading(
  overrides: Partial<{
    checkApproval: UniswapTradingApi["checkApproval"];
    quote: UniswapTradingApi["quote"];
    createSwap: UniswapTradingApi["createSwap"];
  }> = {}
): UniswapTradingApi & {
  checkApproval: ReturnType<typeof vi.fn>;
  quote: ReturnType<typeof vi.fn>;
  createSwap: ReturnType<typeof vi.fn>;
} {
  return {
    checkApproval: vi.fn(
      overrides.checkApproval ??
        (async () => ({
          ok: true as const,
          approval: APPROVE_TX,
          cancel: null,
        }))
    ),
    quote: vi.fn(
      overrides.quote ??
        (async () => ({ ok: true as const, ...classicQuote(NVDAC, true) }))
    ),
    createSwap: vi.fn(
      overrides.createSwap ?? (async () => ({ ok: true as const, ...SWAP_TX }))
    ),
  };
}

describe("parseAcquireCliArgs", () => {
  it("defaults to 2 USDC of NVDAc", () => {
    expect(parseAcquireCliArgs(["--acquire"])).toEqual({
      requested: true,
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });
  });

  it("parses a human USDC amount", () => {
    expect(
      parseAcquireCliArgs(["--acquire", "--asset", "AAPLc", "--usdc", "1.5"])
    ).toEqual({
      requested: true,
      asset: "AAPLc",
      usdcAmount: 1_500_000n,
    });
  });
});

describe("acquireSupportedStock", () => {
  it("swaps USDC for the canonical NVDAc, signs Permit2, and verifies the onchain balance", async () => {
    const wallet = fakeWallet();
    const balances = fakeBalances({
      eth: 1_000_000_000_000_000n,
      usdc: 5_000_000n,
      stock: [0n, 1_100_000n],
    });
    const trading = fakeTrading();
    const nvda = getAssets().assets.find((asset) => asset.name === "NVDAc");
    expect(nvda?.stock).toBe(NVDAC);

    const result = await acquireSupportedStock({
      wallet,
      balances,
      trading,
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({
      ok: true,
      asset: "NVDAc",
      stock: getAddress(NVDAC),
      usdcAmount: "2000000",
      stockReceived: "1100000",
    });
    if (!result.ok) throw new Error("expected success");
    expect(result.transactionHashes).toEqual([HASH_APPROVE, HASH_SWAP]);
    expect(trading.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: getAddress(USDC),
        tokenOut: getAddress(NVDAC),
        amount: 2_000_000n,
        swapper: ADDRESS,
      })
    );
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1);
    expect(trading.createSwap).toHaveBeenCalledWith(
      expect.objectContaining({ signature: PERMIT_SIG })
    );
    expect(wallet.sendTransaction).toHaveBeenCalledWith(SWAP_TX);
    expect(result.stockReceivedFormatted).toBe("0.011");
  });

  it("swaps without signing typed data when the quote has no Permit2 payload", async () => {
    const wallet = fakeWallet();
    const trading = fakeTrading({
      quote: async () => ({ ok: true, ...classicQuote(NVDAC, false) }),
    });

    const result = await acquireSupportedStock({
      wallet,
      balances: fakeBalances({
        eth: 1_000_000_000_000_000n,
        usdc: 5_000_000n,
        stock: [0n, 1_100_000n],
      }),
      trading,
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({
      ok: true,
      asset: "NVDAc",
      stockReceived: "1100000",
    });
    expect(wallet.signTypedData).not.toHaveBeenCalled();
    expect(trading.createSwap).toHaveBeenCalledTimes(1);
    const swapArgs = trading.createSwap.mock.calls.at(0)?.at(0) as
      { signature?: unknown } | undefined;
    expect(swapArgs).not.toHaveProperty("signature");
    expect(wallet.sendTransaction).toHaveBeenCalledWith(SWAP_TX);
  });

  it("refuses to swap when the wallet has no USDC", async () => {
    const wallet = fakeWallet();
    const trading = fakeTrading();
    const result = await acquireSupportedStock({
      wallet,
      balances: fakeBalances({ eth: 1n, usdc: 0n, stock: [0n] }),
      trading,
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_USDC" });
    expect(trading.quote).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses to swap when the wallet has no ETH for gas", async () => {
    const wallet = fakeWallet();
    const trading = fakeTrading();
    const result = await acquireSupportedStock({
      wallet,
      balances: fakeBalances({ eth: 0n, usdc: 5_000_000n, stock: [0n] }),
      trading,
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_GAS" });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("fails clearly when Uniswap has no route", async () => {
    const result = await acquireSupportedStock({
      wallet: fakeWallet(),
      balances: fakeBalances({
        eth: 1n,
        usdc: 5_000_000n,
        stock: [0n],
      }),
      trading: fakeTrading({
        checkApproval: async () => ({
          ok: true,
          approval: null,
          cancel: null,
        }),
        quote: async () => ({
          ok: false,
          code: "NO_ROUTE",
          message: "Uniswap has no route from USDC to NVDAc.",
        }),
      }),
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({ ok: false, code: "NO_ROUTE" });
  });

  it("does not send a swap when the quoted output token is not the selected stock", async () => {
    const wallet = fakeWallet();
    const trading = fakeTrading({
      checkApproval: async () => ({
        ok: true,
        approval: null,
        cancel: null,
      }),
      quote: async () => ({ ok: true, ...classicQuote(WETH) }),
    });

    const result = await acquireSupportedStock({
      wallet,
      balances: fakeBalances({
        eth: 1n,
        usdc: 5_000_000n,
        stock: [0n],
      }),
      trading,
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({ ok: false, code: "OUTPUT_MISMATCH" });
    expect(trading.createSwap).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("fails when the swap receipt reverts", async () => {
    const wallet = fakeWallet();
    wallet.waitForReceipt.mockImplementation(async (hash: `0x${string}`) => ({
      hash,
      status: "reverted" as const,
      blockNumber: 99n,
    }));

    const result = await acquireSupportedStock({
      wallet,
      balances: fakeBalances({
        eth: 1n,
        usdc: 5_000_000n,
        stock: [0n],
      }),
      trading: fakeTrading({
        checkApproval: async () => ({
          ok: true,
          approval: null,
          cancel: null,
        }),
        quote: async () => ({ ok: true, ...classicQuote(NVDAC, false) }),
      }),
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({ ok: false, code: "SWAP_FAILED" });
  });

  it("fails when the stock balance does not increase after confirmation", async () => {
    const result = await acquireSupportedStock({
      wallet: fakeWallet(),
      balances: fakeBalances({
        eth: 1n,
        usdc: 5_000_000n,
        stock: [1_000_000n, 1_000_000n],
      }),
      trading: fakeTrading({
        checkApproval: async () => ({
          ok: true,
          approval: null,
          cancel: null,
        }),
        quote: async () => ({ ok: true, ...classicQuote(NVDAC, false) }),
      }),
      asset: "NVDAc",
      usdcAmount: 2_000_000n,
    });

    expect(result).toMatchObject({ ok: false, code: "BALANCE_UNCHANGED" });
  });
});
