import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAssets } from "@/lib/agent/assets";
import { baseDeployment } from "@/lib/protocol/deployment";
import { runAgentWalletDemo } from "@/lib/wallets/demo";
import type { UniswapTradingApi } from "@/lib/uniswap/trading-api";

const ADDRESS = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c" as const;
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const SIGNED =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

const walletMetadata = {
  walletId: "wallet-1",
  accountAddress: ADDRESS,
  chainName: "EVM",
  thresholdSignatureScheme: "TWO_OF_TWO",
  externalServerKeySharesBackupInfo: { location: "dynamic" },
};

const ENV = {
  DYNAMIC_API_TOKEN: "dyn_token_must_not_print",
  DYNAMIC_WALLET_PASSWORD: "backup-password-must-not-print",
  DYNAMIC_ENVIRONMENT_ID: "env_abc",
};

describe("runAgentWalletDemo", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true }))
    );
  });

  async function envWithStore() {
    const dir = await mkdtemp(path.join(tmpdir(), "mc-wallet-"));
    dirs.push(dir);
    return {
      ...ENV,
      DYNAMIC_AGENT_WALLET_STORE: path.join(dir, "wallet.json"),
    };
  }

  function fakeConnect() {
    return vi.fn(async () => ({
      createWalletAccount: vi.fn(async () => ({
        walletMetadata,
        externalServerKeyShares: [{ share: "secret" }],
      })),
      signTransaction: vi.fn(async () => SIGNED),
      signTypedData: vi.fn(async () => SIGNED),
    }));
  }

  function fakePublicClient() {
    return {
      getBalance: vi.fn(async () => 1_000_000_000_000_000n),
      readContract: vi.fn(async ({ address }: { address: `0x${string}` }) => {
        void address;
        return 2_500_000n;
      }),
      prepareTransactionRequest: vi.fn(async () => ({
        to: ADDRESS,
        value: 0n,
        chainId: 8453,
      })),
      sendRawTransaction: vi.fn(async () => HASH),
      waitForTransactionReceipt: vi.fn(async () => ({
        status: "success" as "success" | "reverted",
        blockNumber: 99n,
        transactionHash: HASH,
      })),
    };
  }

  it("provisions a Dynamic wallet and prints the Base address and balances", async () => {
    const env = await envWithStore();
    const connect = fakeConnect();
    const publicClient = fakePublicClient();

    const result = await runAgentWalletDemo({
      env,
      argv: [],
      connect,
      createPublicClient: () => publicClient,
    });

    expect(result.exitCode).toBe(0);
    const output = result.lines.join("\n");
    expect(output).toContain(ADDRESS);
    expect(output).toMatch(/created/i);
    expect(output).toContain("0.001");
    expect(output).toContain("2.5");
    expect(output).toMatch(/USDC/);
    expect(output).toMatch(/reference/);
    expect(output).not.toContain("dyn_token_must_not_print");
    expect(output).not.toContain("backup-password-must-not-print");
    expect(output).not.toContain("secret");
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: baseDeployment.usdc })
    );
  });

  it("signs and broadcasts a 0 ETH self-transfer with --ping", async () => {
    const env = await envWithStore();
    const connect = fakeConnect();
    const publicClient = fakePublicClient();

    const result = await runAgentWalletDemo({
      env,
      argv: ["--ping"],
      connect,
      createPublicClient: () => publicClient,
    });

    expect(result.exitCode).toBe(0);
    expect(publicClient.sendRawTransaction).toHaveBeenCalled();
    expect(result.lines.join("\n")).toContain(HASH);
  });

  it("fails --ping when the receipt is not success", async () => {
    const env = await envWithStore();
    const publicClient = fakePublicClient();
    publicClient.waitForTransactionReceipt.mockResolvedValue({
      status: "reverted",
      blockNumber: 99n,
      transactionHash: HASH,
    });

    const result = await runAgentWalletDemo({
      env,
      argv: ["--ping"],
      connect: fakeConnect(),
      createPublicClient: () => publicClient,
    });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain(HASH);
    expect(result.lines.join("\n")).toMatch(/reverted/i);
  });

  it("surfaces Dynamic signing failures without leaking credentials", async () => {
    const env = await envWithStore();
    const connect = vi.fn(async () => ({
      createWalletAccount: vi.fn(async () => ({ walletMetadata })),
      signTransaction: vi.fn(async () => {
        throw new Error(
          `ceremony failed token=${ENV.DYNAMIC_API_TOKEN} password=${ENV.DYNAMIC_WALLET_PASSWORD}`
        );
      }),
      signTypedData: vi.fn(async () => SIGNED),
    }));

    const result = await runAgentWalletDemo({
      env,
      argv: ["--ping"],
      connect,
      createPublicClient: fakePublicClient,
    });

    expect(result.exitCode).toBe(1);
    const output = result.lines.join("\n");
    expect(output).toContain(ADDRESS);
    expect(output).not.toContain(ENV.DYNAMIC_API_TOKEN);
    expect(output).not.toContain(ENV.DYNAMIC_WALLET_PASSWORD);
    expect(output).toContain("[redacted]");
  });

  it("refuses --ping when the wallet has no ETH for gas", async () => {
    const env = await envWithStore();
    const publicClient = fakePublicClient();
    publicClient.getBalance = vi.fn(async () => 0n);

    const result = await runAgentWalletDemo({
      env,
      argv: ["--ping"],
      connect: fakeConnect(),
      createPublicClient: () => publicClient,
    });

    expect(result.exitCode).toBe(1);
    expect(publicClient.sendRawTransaction).not.toHaveBeenCalled();
    expect(result.lines.join("\n")).toMatch(/0 ETH/);
  });

  it("acquires NVDAc via Uniswap and prints hashes plus the verified amount", async () => {
    const env = { ...(await envWithStore()), UNISWAP_API_KEY: "uni-key" };
    const nvda = getAssets().assets.find((asset) => asset.name === "NVDAc");
    if (!nvda) throw new Error("NVDAc missing from get_assets");
    const stockReads = [0n, 1_100_000n];
    const publicClient = fakePublicClient();
    publicClient.readContract.mockImplementation(
      async (args: { address: `0x${string}` }) => {
        if (args.address.toLowerCase() === baseDeployment.usdc.toLowerCase()) {
          return 5_000_000n;
        }
        if (args.address.toLowerCase() === nvda.stock.toLowerCase()) {
          return stockReads.shift() ?? 0n;
        }
        return 0n;
      }
    );

    const approveData =
      "0x095ea7b30000000000000000000000000000000000000001" as const;
    const swapData =
      "0x3593564c0000000000000000000000000000000000000001" as const;
    publicClient.sendRawTransaction = vi.fn(async () => HASH);

    const trading: UniswapTradingApi = {
      checkApproval: vi.fn(async () => ({
        ok: true as const,
        approval: {
          to: baseDeployment.usdc,
          data: approveData,
          value: 0n,
        },
        cancel: null,
      })),
      quote: vi.fn(async (args) => ({
        ok: true as const,
        routing: "CLASSIC" as const,
        outputToken: nvda.stock,
        amountOut: 1_100_000n,
        minimumAmountOut: 1_089_000n,
        permitData: null,
        quote: { output: { token: args.tokenOut } },
      })),
      createSwap: vi.fn(async () => ({
        ok: true as const,
        to: "0x2626664c2603336E57B271c5C0b26F421741e481" as const,
        data: swapData,
        value: 0n,
      })),
    };

    const result = await runAgentWalletDemo({
      env,
      argv: ["--acquire", "--asset", "NVDAc", "--usdc", "2"],
      connect: fakeConnect(),
      createPublicClient: () => publicClient,
      createTradingApi: () => trading,
    });

    expect(result.exitCode).toBe(0);
    const output = result.lines.join("\n");
    expect(output).toContain(HASH);
    expect(output).toMatch(/0\.011/);
    expect(output).toMatch(/NVDAc/);
    expect(output).toMatch(/Bankr/);
    expect(output).toMatch(/skip Uniswap/i);
    expect(trading.quote).toHaveBeenCalledWith(
      expect.objectContaining({ tokenOut: nvda.stock, amount: 2_000_000n })
    );
    expect(publicClient.sendRawTransaction).toHaveBeenCalled();
  });

  it("tells a swap-capable agent to skip Uniswap when the API key is missing", async () => {
    const env = await envWithStore();
    const result = await runAgentWalletDemo({
      env,
      argv: ["--acquire"],
      connect: fakeConnect(),
      createPublicClient: fakePublicClient,
    });

    expect(result.exitCode).toBe(1);
    const output = result.lines.join("\n");
    expect(output).toMatch(/UNISWAP_API_KEY/);
    expect(output).toMatch(/Bankr/);
    expect(output).toMatch(/skip/i);
  });
});
