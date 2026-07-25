/**
 * Pure, offline preflight predicates for Robinhood Chain testnet (#248).
 * No RPC, no env reads — unit-testable fail-closed checks.
 */
import {
  DependencyEntry,
  DependencyStatus,
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  RobinhoodTestnetDependencies,
  isForbiddenRobinhoodMainnetChainId,
  isRobinhoodTestnetChainId,
} from "./dependencies";

export type PreflightFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  dependencyId?: string;
};

const TEST_ASSET_LABEL_RE = /Margin Call Test Asset/i;

/** Hex bytecode is present when non-empty and not the null-code sentinel. */
export function hasContractBytecode(code: string | null | undefined): boolean {
  if (code === null || code === undefined) return false;
  const normalized = code.trim().toLowerCase();
  return normalized !== "" && normalized !== "0x" && normalized !== "0x0";
}

/**
 * Canonical entries must not use Test Asset labels.
 * Test-asset-fallback entries must be visibly labelled as Margin Call Test Assets.
 * Unverified entries may use either until promoted.
 */
export function checkLabelling(
  entry: DependencyEntry
): PreflightFinding | null {
  const isTestAssetLabel = TEST_ASSET_LABEL_RE.test(entry.label);

  if (entry.status === "canonical" && isTestAssetLabel) {
    return {
      code: "label-canonical-mismatch",
      severity: "error",
      dependencyId: entry.id,
      message: `Dependency "${entry.id}" is status=canonical but label looks like a Test Asset: "${entry.label}"`,
    };
  }

  if (entry.status === "test-asset-fallback" && !isTestAssetLabel) {
    return {
      code: "label-fallback-mismatch",
      severity: "error",
      dependencyId: entry.id,
      message: `Dependency "${entry.id}" is status=test-asset-fallback but label is not visibly a Margin Call Test Asset: "${entry.label}"`,
    };
  }

  return null;
}

/**
 * Canonical entries with an address require a non-empty expectedInterfaces list
 * so live probes know what to verify. Fallbacks may declare interfaces for
 * doubles that will be deployed later.
 */
export function checkInterfaceShape(
  entry: DependencyEntry
): PreflightFinding | null {
  if (
    entry.status === "canonical" &&
    entry.address !== null &&
    entry.expectedInterfaces.length === 0
  ) {
    return {
      code: "interfaces-missing",
      severity: "error",
      dependencyId: entry.id,
      message: `Canonical dependency "${entry.id}" at ${entry.address} declares no expectedInterfaces`,
    };
  }
  return null;
}

/**
 * Canonical entries must pin an address. Fallbacks and unverified may be null
 * until a Test Asset or canonical address is known.
 */
export function checkAddressPresence(
  entry: DependencyEntry
): PreflightFinding | null {
  if (entry.status === "canonical" && entry.address === null) {
    return {
      code: "canonical-address-missing",
      severity: "error",
      dependencyId: entry.id,
      message: `Canonical dependency "${entry.id}" must pin a non-null address`,
    };
  }
  return null;
}

/**
 * Feed staleness: reject when updatedAt is zero, in the future beyond skew,
 * or older than heartbeat + grace.
 */
export function isFeedStale(opts: {
  updatedAtSeconds: number;
  nowSeconds: number;
  heartbeatSeconds: number;
  graceSeconds?: number;
  maxFutureSkewSeconds?: number;
}): boolean {
  const {
    updatedAtSeconds,
    nowSeconds,
    heartbeatSeconds,
    graceSeconds = 0,
    maxFutureSkewSeconds = 60,
  } = opts;

  if (!Number.isFinite(updatedAtSeconds) || updatedAtSeconds <= 0) {
    return true;
  }
  if (updatedAtSeconds > nowSeconds + maxFutureSkewSeconds) {
    return true;
  }
  const age = nowSeconds - updatedAtSeconds;
  return age > heartbeatSeconds + graceSeconds;
}

export function checkBytecodeExpectation(opts: {
  entry: DependencyEntry;
  code: string | null | undefined;
}): PreflightFinding | null {
  const { entry, code } = opts;
  if (entry.status !== "canonical") return null;
  if (!hasContractBytecode(code)) {
    return {
      code: "bytecode-missing",
      severity: "error",
      dependencyId: entry.id,
      message: `Canonical dependency "${entry.id}" expected bytecode at ${entry.address ?? "unknown"} but eth_getCode was empty`,
    };
  }
  return null;
}

export function assertAllowedChainId(chainId: string | number): void {
  if (isForbiddenRobinhoodMainnetChainId(chainId)) {
    throw new Error(
      `Forbidden Robinhood Chain mainnet chainId ${FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID} — issue #248 allows testnet ${ROBINHOOD_TESTNET_CHAIN_ID} only`
    );
  }
  if (!isRobinhoodTestnetChainId(chainId)) {
    throw new Error(
      `Unexpected chainId ${String(chainId)}; expected Robinhood Chain testnet ${ROBINHOOD_TESTNET_CHAIN_ID}`
    );
  }
}

/**
 * Run all offline matrix checks. Returns findings; caller decides fail policy.
 * By default, any error-severity finding means the matrix is not shippable.
 */
export function runOfflinePreflight(
  deps: RobinhoodTestnetDependencies
): PreflightFinding[] {
  const findings: PreflightFinding[] = [];

  if (deps.network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    findings.push({
      code: "network-chain-mismatch",
      severity: "error",
      message: `Matrix network.chainId ${deps.network.chainId} !== ${ROBINHOOD_TESTNET_CHAIN_ID}`,
    });
  }

  if (deps.forbidden.mainnetChainId !== FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID) {
    findings.push({
      code: "forbidden-mainnet-mismatch",
      severity: "error",
      message: `Matrix forbidden.mainnetChainId must be ${FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID}`,
    });
  }

  const seen = new Set<string>();
  for (const entry of deps.dependencies) {
    if (seen.has(entry.id)) {
      findings.push({
        code: "duplicate-dependency-id",
        severity: "error",
        dependencyId: entry.id,
        message: `Duplicate dependency id "${entry.id}"`,
      });
    }
    seen.add(entry.id);

    const labelFinding = checkLabelling(entry);
    if (labelFinding) findings.push(labelFinding);

    const interfaceFinding = checkInterfaceShape(entry);
    if (interfaceFinding) findings.push(interfaceFinding);

    const addressFinding = checkAddressPresence(entry);
    if (addressFinding) findings.push(addressFinding);
  }

  const registry = deps.dependencies.find((d) => d.id === "erc6551-registry");
  if (!registry || registry.status !== "canonical" || !registry.address) {
    findings.push({
      code: "registry-required",
      severity: "error",
      dependencyId: "erc6551-registry",
      message:
        "erc6551-registry must be present as a canonical dependency with an address",
    });
  }

  return findings;
}

export function offlinePreflightHasErrors(
  findings: PreflightFinding[]
): boolean {
  return findings.some((f) => f.severity === "error");
}

/** Statuses that are allowed to ship without live confirmation. */
export function isResolvedStatus(status: DependencyStatus): boolean {
  return status === "canonical" || status === "test-asset-fallback";
}
