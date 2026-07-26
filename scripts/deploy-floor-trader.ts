/**
 * Deploy the Floor Trader identity set to Robinhood Chain testnet.
 *
 * Deploys TraderIdentity, the TraderAccount ERC-6551 implementation, and
 * TraderDelegation in one broadcast, records the result, and repoints the
 * dependency matrix at the freshly deployed account implementation.
 *
 * Requires in .env.local or the shell:
 *   OPERATOR_PRIVATE_KEY
 *   ROBINHOOD_TESTNET_RPC_URL
 *   TRADER_BASE_URI
 *   MARGIN_CALL_FLOOR_DEPLOY_APPROVED=1
 *
 * Optional: TRADER_NAME, TRADER_SYMBOL
 *
 * Usage: pnpm deploy:floor-trader
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import {
  appendDeploymentRecord,
  broadcastRecordFields,
  loadEnvLocal,
  readLatestBroadcastCreate,
  requireFloorDeployApproval,
  runForgeDeployMany,
} from "./deploy-utils";
import {
  DEPENDENCIES_JSON_PATH,
  ERC6551_REGISTRY_ADDRESS,
  ROBINHOOD_TESTNET_CHAIN_ID,
} from "./floor/dependencies";
import { assertAllowedChainId } from "./floor/preflight-checks";
import { TRADER_DEPLOYMENTS_FILENAME } from "./floor/trader-deployment";

const DEFAULT_NAME = "Margin Call Trader";
const DEFAULT_SYMBOL = "MCTRADER";

function requireRpcUrl(env: Record<string, string>): string {
  const url = env.ROBINHOOD_TESTNET_RPC_URL?.trim();
  if (!url) {
    throw new Error(
      "ROBINHOOD_TESTNET_RPC_URL missing — set it in .env.local or the shell (no silent public fallback)"
    );
  }
  if (/mainnet\.chain\.robinhood\.com/i.test(url)) {
    throw new Error(
      "ROBINHOOD_TESTNET_RPC_URL points at Robinhood mainnet — refusing to deploy"
    );
  }
  return url;
}

/**
 * Point the dependency matrix at the implementation we just deployed. Left
 * unpinned, every Trader account would resolve against a null implementation.
 */
function pinAccountImplementation(address: string): void {
  const raw = readFileSync(DEPENDENCIES_JSON_PATH, "utf8");
  const packet = JSON.parse(raw) as {
    dependencies: Array<{ id: string; address: string | null; label: string }>;
  };

  const entry = packet.dependencies.find(
    (d) => d.id === "erc6551-account-implementation"
  );
  if (!entry) {
    throw new Error(
      "erc6551-account-implementation missing from the dependency matrix"
    );
  }

  entry.address = address;
  entry.label = "Margin Call Test Asset — TBA account implementation";
  writeFileSync(DEPENDENCIES_JSON_PATH, `${JSON.stringify(packet, null, 2)}\n`);
}

async function main() {
  const env = loadEnvLocal();
  requireFloorDeployApproval(env);

  const rpcUrl = requireRpcUrl(env);
  const operatorKey = env.OPERATOR_PRIVATE_KEY;
  if (!operatorKey) {
    throw new Error("OPERATOR_PRIVATE_KEY missing in .env.local");
  }

  const baseUri = env.TRADER_BASE_URI?.trim();
  if (!baseUri) {
    throw new Error(
      "TRADER_BASE_URI missing — the Trader collection needs a stable metadata endpoint"
    );
  }
  if (!baseUri.endsWith("/")) {
    throw new Error(
      "TRADER_BASE_URI must end with a slash — tokenURI appends the token id directly"
    );
  }

  // Confirm the endpoint before broadcasting rather than discovering after the
  // fact that the collection was deployed against the wrong chain.
  const client = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  assertAllowedChainId(chainId);

  const name = env.TRADER_NAME ?? DEFAULT_NAME;
  const symbol = env.TRADER_SYMBOL ?? DEFAULT_SYMBOL;

  console.log(`Deploying Floor Trader identity set to chain ${chainId}…`);

  const { addresses } = runForgeDeployMany({
    scriptTarget: "script/DeployFloorTrader.s.sol:DeployFloorTrader",
    rpcUrl,
    privateKey: operatorKey,
    addressLabels: ["TraderIdentity", "TraderAccount", "TraderDelegation"],
    env: {
      TRADER_NAME: name,
      TRADER_SYMBOL: symbol,
      TRADER_BASE_URI: baseUri,
    },
  });

  const identity = addresses.TraderIdentity as string;
  const accountImplementation = addresses.TraderAccount as string;
  const delegation = addresses.TraderDelegation as string;

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployFloorTrader.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const version = appendDeploymentRecord(TRADER_DEPLOYMENTS_FILENAME, {
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
    identity,
    accountImplementation,
    delegation,
    registry: ERC6551_REGISTRY_ADDRESS,
    name,
    symbol,
    baseUri,
    deployedAt: new Date().toISOString(),
    ...broadcastRecordFields(broadcast),
  });

  pinAccountImplementation(accountImplementation);

  console.log(`\nRecorded deployment v${version}:`);
  console.log(`  TraderIdentity   ${identity}`);
  console.log(`  TraderAccount    ${accountImplementation}`);
  console.log(`  TraderDelegation ${delegation}`);
  console.log(
    `\nPinned erc6551-account-implementation in the dependency matrix.`
  );
  console.log(
    `Next: record the address in docs/floor/robinhood-testnet-dependency-packet.md (pnpm test enforces it), then run pnpm floor:preflight:live.`
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Floor Trader deploy failed: ${message}`);
  process.exitCode = 1;
});
