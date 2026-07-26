/**
 * Live Robinhood Chain testnet dependency probe (#248).
 *
 * Requires ROBINHOOD_TESTNET_RPC_URL. Hard-refuses mainnet chainId 4663.
 * Fails closed on missing bytecode for canonical entries, unsupported
 * interfaces, stale feeds (when a feed address is set), or labelling mismatches.
 *
 * Usage:
 *   ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com \
 *     pnpm exec tsx scripts/floor/preflight-robinhood-testnet.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  DEPENDENCIES_JSON_PATH,
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  loadRobinhoodTestnetDependencies,
  type DependencyEntry,
} from "./dependencies";
import {
  assertAllowedChainId,
  checkBytecodeExpectation,
  hasContractBytecode,
  isFeedStale,
  offlinePreflightHasErrors,
  runOfflinePreflight,
  type PreflightFinding,
} from "./preflight-checks";
import { loadFloorEnvLocal } from "./load-env";
import { loadActiveFloorTraderDeployment } from "./trader-deployment";

const ROOT = join(import.meta.dirname, "../..");
const EVIDENCE_DIR = join(ROOT, ".floor-evidence");

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

const aggregatorV3Abi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const erc8056Abi = [
  {
    type: "function",
    name: "uiMultiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const erc6551RegistryAbi = [
  {
    type: "function",
    name: "account",
    stateMutability: "view",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

type ProbeResult = {
  id: string;
  status: DependencyEntry["status"];
  address: string | null;
  bytecodePresent: boolean | null;
  interfaceResults: Record<string, "ok" | "fail" | "skipped">;
  feed?: {
    answer: string;
    updatedAt: number;
    stale: boolean;
  };
  findings: PreflightFinding[];
  recommendedStatus: DependencyEntry["status"];
};

function requireRpcUrl(): string {
  loadFloorEnvLocal();
  const url = process.env.ROBINHOOD_TESTNET_RPC_URL?.trim();
  if (!url) {
    throw new Error(
      "ROBINHOOD_TESTNET_RPC_URL is required — set it in .env.local or the shell (no silent public fallback)"
    );
  }
  if (/mainnet\.chain\.robinhood\.com/i.test(url)) {
    throw new Error(
      "ROBINHOOD_TESTNET_RPC_URL points at Robinhood mainnet — refusing to probe"
    );
  }
  return url;
}

async function getCode(
  client: PublicClient,
  address: Address
): Promise<Hex | undefined> {
  return client.getCode({ address });
}

async function probeInterfaces(
  client: PublicClient,
  entry: DependencyEntry,
  address: Address
): Promise<Record<string, "ok" | "fail" | "skipped">> {
  const results: Record<string, "ok" | "fail" | "skipped"> = {};

  for (const iface of entry.expectedInterfaces) {
    try {
      switch (iface) {
        case "IERC20":
        case "IERC20Metadata": {
          await client.readContract({
            address,
            abi: erc20Abi,
            functionName: "decimals",
          });
          results[iface] = "ok";
          break;
        }
        case "AggregatorV3Interface": {
          await client.readContract({
            address,
            abi: aggregatorV3Abi,
            functionName: "latestRoundData",
          });
          results[iface] = "ok";
          break;
        }
        case "IERC8056": {
          await client.readContract({
            address,
            abi: erc8056Abi,
            functionName: "uiMultiplier",
          });
          results[iface] = "ok";
          break;
        }
        case "IERC6551Registry": {
          await client.readContract({
            address,
            abi: erc6551RegistryAbi,
            functionName: "account",
            args: [
              "0x0000000000000000000000000000000000000001",
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              BigInt(ROBINHOOD_TESTNET_CHAIN_ID),
              "0x0000000000000000000000000000000000000001",
              0n,
            ],
          });
          results[iface] = "ok";
          break;
        }
        case "IERC6551Account":
        case "IERC6551Executable":
        case "oraclePaused": {
          // Account-level / optional flags verified after Floor contracts deploy.
          results[iface] = "skipped";
          break;
        }
        default: {
          results[iface] = "skipped";
        }
      }
    } catch {
      results[iface] = "fail";
    }
  }

  return results;
}

async function probeFeed(
  client: PublicClient,
  entry: DependencyEntry,
  address: Address,
  nowSeconds: number
): Promise<ProbeResult["feed"] | undefined> {
  if (!entry.expectedInterfaces.includes("AggregatorV3Interface")) {
    return undefined;
  }
  try {
    const [, answer, , updatedAt] = await client.readContract({
      address,
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
    });
    const updatedAtSeconds = Number(updatedAt);
    const heartbeat = entry.heartbeatSecondsHint ?? 86_400;
    return {
      answer: answer.toString(),
      updatedAt: updatedAtSeconds,
      stale: isFeedStale({
        updatedAtSeconds,
        nowSeconds,
        heartbeatSeconds: heartbeat,
      }),
    };
  } catch {
    return undefined;
  }
}

function recommendStatus(
  entry: DependencyEntry,
  bytecodePresent: boolean | null
): DependencyEntry["status"] {
  if (entry.status === "canonical") return "canonical";
  if (bytecodePresent === true && entry.address) {
    return "canonical";
  }
  if (entry.status === "test-asset-fallback") return "test-asset-fallback";
  if (bytecodePresent === false) return "test-asset-fallback";
  return entry.status;
}

async function probeEntry(
  client: PublicClient,
  entry: DependencyEntry,
  nowSeconds: number
): Promise<ProbeResult> {
  const findings: PreflightFinding[] = [];
  let bytecodePresent: boolean | null = null;
  let interfaceResults: Record<string, "ok" | "fail" | "skipped"> = {};
  let feed: ProbeResult["feed"] | undefined;

  if (entry.address) {
    const code = await getCode(client, entry.address as Address);
    bytecodePresent = hasContractBytecode(code);
    const bytecodeFinding = checkBytecodeExpectation({ entry, code });
    if (bytecodeFinding) findings.push(bytecodeFinding);

    if (bytecodePresent) {
      interfaceResults = await probeInterfaces(
        client,
        entry,
        entry.address as Address
      );
      for (const [iface, result] of Object.entries(interfaceResults)) {
        if (result === "fail") {
          findings.push({
            code: "interface-unsupported",
            severity: "error",
            dependencyId: entry.id,
            message: `Dependency "${entry.id}" failed interface probe for ${iface}`,
          });
        }
      }
      feed = await probeFeed(
        client,
        entry,
        entry.address as Address,
        nowSeconds
      );
      if (feed?.stale) {
        findings.push({
          code: "feed-stale",
          severity: "error",
          dependencyId: entry.id,
          message: `Dependency "${entry.id}" price feed is stale (updatedAt=${feed.updatedAt})`,
        });
      }
    } else if (entry.status === "canonical") {
      // already recorded by checkBytecodeExpectation
    }
  }

  return {
    id: entry.id,
    status: entry.status,
    address: entry.address,
    bytecodePresent,
    interfaceResults,
    feed,
    findings,
    recommendedStatus: recommendStatus(entry, bytecodePresent),
  };
}

async function main() {
  const rpcUrl = requireRpcUrl();
  const deps = loadRobinhoodTestnetDependencies();

  const offlineFindings = runOfflinePreflight(deps, {
    traderDeployment: loadActiveFloorTraderDeployment(),
  });
  if (offlinePreflightHasErrors(offlineFindings)) {
    console.error("Offline preflight failed:");
    for (const f of offlineFindings) {
      console.error(`  [${f.severity}] ${f.code}: ${f.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const chainId = await client.getChainId();
  assertAllowedChainId(chainId);

  if (chainId === FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID) {
    throw new Error("unreachable: mainnet guard");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const results: ProbeResult[] = [];
  const allFindings: PreflightFinding[] = [...offlineFindings];

  for (const entry of deps.dependencies) {
    const result = await probeEntry(client, entry, nowSeconds);
    results.push(result);
    allFindings.push(...result.findings);
  }

  const report = {
    probedAt: new Date().toISOString(),
    rpcUrlHost: new URL(rpcUrl).host,
    chainId,
    expectedChainId: ROBINHOOD_TESTNET_CHAIN_ID,
    matrixPath: DEPENDENCIES_JSON_PATH,
    matrixVersion: deps.version,
    results,
    findings: allFindings,
    ok: !allFindings.some((f) => f.severity === "error"),
  };

  if (!existsSync(EVIDENCE_DIR)) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  const reportPath = join(EVIDENCE_DIR, "preflight-live-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        chainId,
        reportPath,
        summary: results.map((r) => ({
          id: r.id,
          status: r.status,
          recommendedStatus: r.recommendedStatus,
          bytecodePresent: r.bytecodePresent,
          interfaceFails: Object.entries(r.interfaceResults)
            .filter(([, v]) => v === "fail")
            .map(([k]) => k),
          feedStale: r.feed?.stale ?? null,
        })),
        errors: allFindings.filter((f) => f.severity === "error"),
      },
      null,
      2
    )
  );

  // Keep matrix shape available for operators reviewing promotions.
  const promotionSuggestions = results.filter(
    (r) => r.recommendedStatus !== r.status
  );
  if (promotionSuggestions.length > 0) {
    console.error("\nStatus promotion suggestions (manual matrix edit):");
    for (const s of promotionSuggestions) {
      console.error(
        `  ${s.id}: ${s.status} -> ${s.recommendedStatus} (bytecode=${String(s.bytecodePresent)})`
      );
    }
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Live preflight failed: ${message}`);
  process.exitCode = 1;
});
