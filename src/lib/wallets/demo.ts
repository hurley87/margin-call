import { USDC_DECIMALS } from "@/lib/protocol/constants";
import { baseDeployment } from "@/lib/protocol/deployment";
import type { TransactionReceiptSummary } from "@/lib/wallets/adapter";
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

export type DemoPublicClient = BalanceClient & DynamicChainClient;

export type AgentWalletDemoDeps = {
  env: NodeJS.Dict<string>;
  argv: readonly string[];
  connect: (env: DynamicServerWalletEnv) => Promise<DynamicServerWalletApi>;
  createPublicClient: (rpcUrl: string) => DemoPublicClient;
};

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

/**
 * Walletless-agent demo: provision or resolve a Dynamic server wallet, print
 * Base balances, optionally sign and broadcast a 0 ETH self-transfer.
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

  if (deps.argv.includes("--ping")) {
    if (balances.ethRaw === 0n) {
      lines.push(
        "",
        "Ping skipped: this address has 0 ETH. Fund it manually with a small amount of Base ETH for gas, then retry --ping."
      );
      return { lines, exitCode: 1 };
    }
    const hash = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
    });
    const receipt = await wallet.waitForReceipt(hash);
    lines.push(...formatPing(receipt));
  }

  return { lines, exitCode: 0 };
}
