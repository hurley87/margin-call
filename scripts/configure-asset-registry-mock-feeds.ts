/**
 * Configure the committed Robinhood testnet MockPriceFeeds as static,
 * non-expiring test fixtures. Dry-run by default; pass --execute to write.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PAYMENT_CHAIN_ID,
  createRobinhoodPublicClient,
  createRobinhoodWalletClient,
  parsePrivateKey,
} from "@margin-call/shared";
import { getAddress, parseAbi, zeroHash, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  STATIC_TEST_FEED_STALE_AFTER,
  planMockFeedPolicy,
} from "./asset-registry-mock-feed-policy";
import { loadEnvLocal, ROOT } from "./deploy-utils";

const registryAbi = parseAbi([
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getAsset(address token) view returns (address feed, uint64 staleAfter, uint8 status, uint8 tokenDecimals, uint256 inventory)",
  "function setAssetFeed(address token, address feed, uint64 staleAfter)",
  "function quote(address token, uint256 amount) view returns (uint256)",
]);

const mockFeedAbi = parseAbi([
  "function IS_TEST_FEED() view returns (bool)",
  "function latestAnswer() view returns (uint256 price, uint256 updatedAt, bool paused, bool valid)",
]);

type DeploymentRecord = {
  chainId: number;
  address: Address;
  symbols: string[];
  tokens: Address[];
  feeds: Address[];
};

type PendingUpdate = {
  symbol: string;
  token: Address;
  feed: Address;
  tokenDecimals: number;
};

function readDeployment(): DeploymentRecord {
  const path = join(
    ROOT,
    "contracts/deployments/robinhood-testnet.asset-registry.json"
  );
  const record = JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
  if (record.chainId !== PAYMENT_CHAIN_ID) {
    throw new Error(`Deployment record chainId must be ${PAYMENT_CHAIN_ID}`);
  }
  if (
    record.symbols.length === 0 ||
    record.symbols.length !== record.tokens.length ||
    record.symbols.length !== record.feeds.length
  ) {
    throw new Error("Deployment record symbols, tokens, and feeds must align");
  }
  return record;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const deployment = readDeployment();
  const registry = getAddress(deployment.address);
  const publicClient = createRobinhoodPublicClient();

  const chainId = await publicClient.getChainId();
  if (chainId !== PAYMENT_CHAIN_ID) {
    throw new Error(`RPC chainId ${chainId} is not ${PAYMENT_CHAIN_ID}`);
  }
  if (!(await publicClient.getBytecode({ address: registry }))) {
    throw new Error(`AssetRegistry has no bytecode at ${registry}`);
  }

  const updates: PendingUpdate[] = [];
  for (let index = 0; index < deployment.symbols.length; index += 1) {
    const symbol = deployment.symbols[index]!;
    const token = getAddress(deployment.tokens[index]!);
    const expectedFeed = getAddress(deployment.feeds[index]!);
    const asset = await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getAsset",
      args: [token],
    });
    const configuredFeed = getAddress(asset[0]);
    if (!(await publicClient.getBytecode({ address: configuredFeed }))) {
      throw new Error(`${symbol}: configured feed has no bytecode`);
    }

    const [isTestFeed, answer] = await Promise.all([
      publicClient.readContract({
        address: configuredFeed,
        abi: mockFeedAbi,
        functionName: "IS_TEST_FEED",
      }),
      publicClient.readContract({
        address: configuredFeed,
        abi: mockFeedAbi,
        functionName: "latestAnswer",
      }),
    ]);
    const decision = planMockFeedPolicy({
      symbol,
      expectedFeed,
      configuredFeed,
      staleAfter: asset[1],
      isTestFeed,
      price: answer[0],
      paused: answer[2],
      valid: answer[3],
    });

    console.log(
      `${symbol}: ${decision === "skip" ? "already static" : "would set static policy"}`
    );
    if (decision === "update") {
      updates.push({
        symbol,
        token,
        feed: configuredFeed,
        tokenDecimals: asset[3],
      });
    }
  }

  if (updates.length === 0) {
    console.log("AssetRegistry mock-feed policy is already configured.");
    return;
  }
  if (!execute) {
    console.log(
      `Dry run complete: ${updates.length} update(s). Re-run with --execute after explicit approval.`
    );
    return;
  }

  const processPrivateKey =
    process.env.DEPLOYER_PRIVATE_KEY ?? process.env.OPERATOR_PRIVATE_KEY;
  const env = processPrivateKey ? null : loadEnvLocal();
  const rawPrivateKey =
    processPrivateKey ?? env?.DEPLOYER_PRIVATE_KEY ?? env?.OPERATOR_PRIVATE_KEY;
  if (!rawPrivateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY) missing");
  }
  const privateKey = parsePrivateKey(rawPrivateKey);
  const account = privateKeyToAccount(privateKey);
  const isAdmin = await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "hasRole",
    args: [zeroHash, account.address],
  });
  if (!isAdmin) {
    throw new Error(
      `${account.address} does not hold AssetRegistry admin role`
    );
  }
  const walletClient = createRobinhoodWalletClient(privateKey);

  for (const update of updates) {
    const simulation = await publicClient.simulateContract({
      account,
      address: registry,
      abi: registryAbi,
      functionName: "setAssetFeed",
      args: [update.token, update.feed, STATIC_TEST_FEED_STALE_AFTER],
    });
    const hash = await walletClient.writeContract(simulation.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${update.symbol}: setAssetFeed transaction reverted`);
    }

    const configured = await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getAsset",
      args: [update.token],
    });
    if (configured[1] !== STATIC_TEST_FEED_STALE_AFTER) {
      throw new Error(`${update.symbol}: post-write staleAfter mismatch`);
    }
    await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "quote",
      args: [update.token, 10n ** BigInt(update.tokenDecimals)],
    });
    console.log(`${update.symbol}: configured in ${hash}`);
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Configuration failed"
  );
  process.exitCode = 1;
});
