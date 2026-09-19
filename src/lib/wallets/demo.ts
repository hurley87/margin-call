import { USDC_DECIMALS } from "@/lib/protocol/constants";
import { baseDeployment } from "@/lib/protocol/deployment";
import {
  createUniswapTradingApi,
  readUniswapApiKey,
  type UniswapTradingApi,
} from "@/lib/uniswap/trading-api";
import type { TransactionReceiptSummary } from "@/lib/wallets/adapter";
import {
  acquireSupportedStock,
  parseAcquireCliArgs,
  type AcquireStockResult,
} from "@/lib/wallets/acquire-stock";
import {
  readWalletBalances,
  type BalanceClient,
  type WalletBalances,
} from "@/lib/wallets/balances";
import {
  readDynamicServerWalletEnv,
  type DynamicServerWalletEnv,
} from "@/lib/wallets/config";
import {
  createDynamicAgentWallet,
  provisionOrResolveDynamicWallet,
  type DynamicChainClient,
  type DynamicServerWalletApi,
  type ProvisionedDynamicWallet,
} from "@/lib/wallets/dynamic-server";
import { fileWalletMetadataStore } from "@/lib/wallets/metadata-store";
import { redactSecrets } from "@/lib/wallets/redact";

export type DemoPublicClient = BalanceClient & DynamicChainClient;

export type AgentWalletDemoDeps = {
  env: NodeJS.Dict<string>;
  argv: readonly string[];
  connect: (env: DynamicServerWalletEnv) => Promise<DynamicServerWalletApi>;
  createPublicClient: (rpcUrl: string) => DemoPublicClient;
  createTradingApi?: (apiKey: string) => UniswapTradingApi;
};

const SKIP_UNISWAP_NOTE =
  "Stock acquisition is not a Margin Call protocol step. An agent whose wallet already swaps (for example Bankr) should skip Uniswap, read the stock address from get_assets, and continue once that wallet holds the token.";

function formatDemoReport(args: {
  provisioned: ProvisionedDynamicWallet;
  balances: WalletBalances;
}): string[] {
  const usdc = args.balances.tokens[0];
  return [
    "Dynamic server wallet · reference integration",
    `Status    ${args.provisioned.created ? "created" : "resolved"}`,
    `Address   ${args.balances.address}`,
    "Network   Base (8453)",
    `ETH       ${args.balances.eth}`,
    `USDC      ${usdc?.formatted ?? "0"}`,
    "",
    "Any Base-capable wallet can use Margin Call. Dynamic is the reference integration for agents that start without a wallet. Fund this address manually with a small amount of ETH for gas and enough USDC to acquire tokenized stock.",
  ];
}

function formatPing(receipt: TransactionReceiptSummary): string[] {
  return [
    "",
    "Ping      0 ETH self-transfer",
    `Tx        ${receipt.hash}`,
    `Status    ${receipt.status}`,
  ];
}

function formatAcquire(result: AcquireStockResult): string[] {
  if (!result.ok) {
    return [
      "",
      `Acquire   failed (${result.code})`,
      result.message,
      "",
      SKIP_UNISWAP_NOTE,
    ];
  }
  return [
    "",
    `Acquire   USDC -> ${result.asset} via Uniswap (reference)`,
    `Spent     ${result.usdcAmountFormatted} USDC`,
    `Received  ${result.stockReceivedFormatted} ${result.asset}`,
    ...result.transactionHashes.map(
      (hash, index) => `Tx ${index + 1}     ${hash}`
    ),
    "Verified  onchain stock balance increased",
    "",
    SKIP_UNISWAP_NOTE,
  ];
}

/**
 * Walletless-agent demo: provision or resolve a Dynamic server wallet, print
 * Base balances, optionally ping or acquire a supported stock via Uniswap.
 */
export async function runAgentWalletDemo(
  deps: AgentWalletDemoDeps
): Promise<{ lines: string[]; exitCode: number }> {
  const config = readDynamicServerWalletEnv(deps.env);
  const client = await deps.connect(config);
  const store = fileWalletMetadataStore(config.storePath);
  const provisioned = await provisionOrResolveDynamicWallet({
    client,
    store,
    password: config.walletPassword,
  });
  const publicClient = deps.createPublicClient(config.rpcUrl);
  const wallet = createDynamicAgentWallet({
    client,
    publicClient,
    walletMetadata: provisioned.walletMetadata,
    password: config.walletPassword,
  });
  const balances = await readWalletBalances(publicClient, wallet.address, [
    {
      token: baseDeployment.usdc,
      symbol: "USDC",
      decimals: USDC_DECIMALS,
    },
  ]);
  const lines = formatDemoReport({ provisioned, balances });
  const secrets = [
    deps.env.DYNAMIC_API_TOKEN,
    deps.env.DYNAMIC_WALLET_PASSWORD,
    deps.env.UNISWAP_API_KEY,
  ];

  if (deps.argv.includes("--ping")) {
    if (balances.ethRaw === 0n) {
      lines.push(
        "",
        "Ping skipped: this address has 0 ETH. Fund it manually with a small amount of Base ETH for gas, then retry --ping."
      );
      return { lines, exitCode: 1 };
    }
    try {
      const hash = await wallet.sendTransaction({
        to: wallet.address,
        value: 0n,
      });
      const receipt = await wallet.waitForReceipt(hash);
      lines.push(...formatPing(receipt));
      if (receipt.status !== "success") {
        return { lines, exitCode: 1 };
      }
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
        secrets
      );
      lines.push("", message);
      return { lines, exitCode: 1 };
    }
  }

  const acquire = parseAcquireCliArgs(deps.argv);
  if (acquire.requested) {
    if (acquire.error) {
      lines.push("", acquire.error, "", SKIP_UNISWAP_NOTE);
      return { lines, exitCode: 1 };
    }
    try {
      const apiKey = readUniswapApiKey(deps.env);
      const trading = (
        deps.createTradingApi ??
        ((key: string) => createUniswapTradingApi({ apiKey: key }))
      )(apiKey);
      const result = await acquireSupportedStock({
        wallet,
        balances: publicClient,
        trading,
        asset: acquire.asset,
        usdcAmount: acquire.usdcAmount,
      });
      lines.push(...formatAcquire(result));
      return { lines, exitCode: result.ok ? 0 : 1 };
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
        secrets
      );
      lines.push("", message, "", SKIP_UNISWAP_NOTE);
      return { lines, exitCode: 1 };
    }
  }

  return { lines, exitCode: 0 };
}
