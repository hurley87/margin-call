import { describe, expect, it } from "vitest";
import {
  ERC6551_REGISTRY_ADDRESS,
  ROBINHOOD_TESTNET_CHAIN_ID,
  loadRobinhoodTestnetDependencies,
  type DependencyEntry,
  type RobinhoodTestnetDependencies,
} from "../../scripts/floor/dependencies";
import {
  TRADER_ACCOUNT_IMPLEMENTATION_ID,
  checkBytecodeExpectation,
  checkTraderDeploymentConsistency,
  offlinePreflightHasErrors,
  runOfflinePreflight,
} from "../../scripts/floor/preflight-checks";
import {
  loadActiveFloorTraderDeployment,
  loadFloorTraderDeployments,
  type FloorTraderDeployment,
} from "../../scripts/floor/trader-deployment";

const IDENTITY = "0x1111111111111111111111111111111111111111";
const ACCOUNT_IMPL = "0x2222222222222222222222222222222222222222";
const DELEGATION = "0x3333333333333333333333333333333333333333";

function deployment(
  overrides: Partial<FloorTraderDeployment> = {}
): FloorTraderDeployment {
  return {
    version: 1,
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
    identity: IDENTITY,
    accountImplementation: ACCOUNT_IMPL,
    delegation: DELEGATION,
    registry: ERC6551_REGISTRY_ADDRESS,
    name: "Margin Call Trader",
    symbol: "MCTRADER",
    baseUri: "https://margincall.test/api/floor/trader/",
    deployedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** The committed matrix with the account implementation address overridden. */
function depsWithAccountImplementation(
  address: string | null
): RobinhoodTestnetDependencies {
  const deps = loadRobinhoodTestnetDependencies();
  return {
    ...deps,
    dependencies: deps.dependencies.map((entry) =>
      entry.id === TRADER_ACCOUNT_IMPLEMENTATION_ID
        ? { ...entry, address }
        : entry
    ),
  };
}

function entry(
  overrides: Partial<DependencyEntry> & Pick<DependencyEntry, "id" | "status">
): DependencyEntry {
  return {
    kind: "test",
    label: "Margin Call Test Asset — fixture",
    address: null,
    expectedInterfaces: [],
    ...overrides,
  };
}

describe("loadFloorTraderDeployments", () => {
  it("treats a missing record file as no deployments", () => {
    expect(loadFloorTraderDeployments("/nonexistent/traders.json")).toEqual([]);
    expect(loadActiveFloorTraderDeployment("/nonexistent/traders.json")).toBe(
      null
    );
  });
});

describe("checkTraderDeploymentConsistency", () => {
  it("passes when nothing is deployed and nothing is pinned", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(null),
      deployment: null,
    });
    expect(findings).toEqual([]);
  });

  it("rejects a pinned implementation with no deployment record", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(ACCOUNT_IMPL),
      deployment: null,
    });
    expect(findings.map((f) => f.code)).toContain(
      "account-implementation-unrecorded"
    );
  });

  it("rejects a deployment the matrix never pinned", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(null),
      deployment: deployment(),
    });
    expect(findings.map((f) => f.code)).toContain(
      "account-implementation-address-missing"
    );
  });

  it("rejects a matrix pinned at a different implementation", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(
        "0x9999999999999999999999999999999999999999"
      ),
      deployment: deployment(),
    });
    expect(findings.map((f) => f.code)).toContain(
      "account-implementation-drift"
    );
  });

  it("accepts a matrix that matches the deployment", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(ACCOUNT_IMPL),
      deployment: deployment(),
    });
    expect(findings).toEqual([]);
  });

  it("matches addresses regardless of checksum casing", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(ACCOUNT_IMPL.toUpperCase()),
      deployment: deployment(),
    });
    expect(findings).toEqual([]);
  });

  it("rejects a deployment made against a different registry", () => {
    const findings = checkTraderDeploymentConsistency({
      deps: depsWithAccountImplementation(ACCOUNT_IMPL),
      deployment: deployment({
        registry: "0x4444444444444444444444444444444444444444",
      }),
    });
    expect(findings.map((f) => f.code)).toContain("registry-drift");
  });
});

describe("runOfflinePreflight with a trader deployment", () => {
  it("still passes for the committed matrix with no deployment", () => {
    const deps = loadRobinhoodTestnetDependencies();
    expect(offlinePreflightHasErrors(runOfflinePreflight(deps))).toBe(false);
  });

  it("fails when the deployment and matrix disagree", () => {
    const findings = runOfflinePreflight(depsWithAccountImplementation(null), {
      traderDeployment: deployment(),
    });
    expect(offlinePreflightHasErrors(findings)).toBe(true);
  });

  it("passes once the matrix pins the deployed implementation", () => {
    const findings = runOfflinePreflight(
      depsWithAccountImplementation(ACCOUNT_IMPL),
      { traderDeployment: deployment() }
    );
    expect(offlinePreflightHasErrors(findings)).toBe(false);
  });
});

describe("checkBytecodeExpectation covers Floor-deployed addresses", () => {
  it("errors when a pinned fallback address has no bytecode", () => {
    const finding = checkBytecodeExpectation({
      entry: entry({
        id: TRADER_ACCOUNT_IMPLEMENTATION_ID,
        status: "test-asset-fallback",
        address: ACCOUNT_IMPL,
      }),
      code: "0x",
    });
    expect(finding?.code).toBe("bytecode-missing");
  });

  it("stays quiet for a pinned fallback address that has bytecode", () => {
    expect(
      checkBytecodeExpectation({
        entry: entry({
          id: TRADER_ACCOUNT_IMPLEMENTATION_ID,
          status: "test-asset-fallback",
          address: ACCOUNT_IMPL,
        }),
        code: "0x6080604052",
      })
    ).toBeNull();
  });

  it("stays quiet for an unpinned fallback", () => {
    expect(
      checkBytecodeExpectation({
        entry: entry({ id: "usdg", status: "test-asset-fallback" }),
        code: "0x",
      })
    ).toBeNull();
  });
});
