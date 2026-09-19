import { createBasePublicClient } from "@/lib/protocol/public-client";
import { connectDynamicServerWallet } from "@/lib/wallets/connect";
import { runAgentWalletDemo, type DemoPublicClient } from "@/lib/wallets/demo";
import { loadLocalEnv } from "@/lib/wallets/load-env";
import { redactSecrets } from "@/lib/wallets/redact";

async function main(): Promise<void> {
  await loadLocalEnv();
  const result = await runAgentWalletDemo({
    env: process.env,
    argv: process.argv.slice(2),
    connect: connectDynamicServerWallet,
    createPublicClient: (rpcUrl) =>
      createBasePublicClient(rpcUrl) as unknown as DemoPublicClient,
  });
  for (const line of result.lines) {
    console.log(line);
  }
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  const message = redactSecrets(
    error instanceof Error ? error.message : String(error),
    [
      process.env.DYNAMIC_API_TOKEN,
      process.env.DYNAMIC_WALLET_PASSWORD,
      process.env.UNISWAP_API_KEY,
    ]
  );
  console.error(message);
  process.exitCode = 1;
});
