import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  loadRobinhoodTestnetDependencies,
  type DependencyEntry,
  type RobinhoodTestnetDependencies,
} from "../../scripts/floor/dependencies";
import {
  assertAllowedChainId,
  checkBytecodeExpectation,
  checkInterfaceShape,
  checkLabelling,
  hasContractBytecode,
  isFeedStale,
  offlinePreflightHasErrors,
  runOfflinePreflight,
} from "../../scripts/floor/preflight-checks";

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

describe("hasContractBytecode", () => {
  it("rejects empty and null sentinels", () => {
    expect(hasContractBytecode(undefined)).toBe(false);
    expect(hasContractBytecode(null)).toBe(false);
    expect(hasContractBytecode("")).toBe(false);
    expect(hasContractBytecode("0x")).toBe(false);
    expect(hasContractBytecode("0x0")).toBe(false);
    expect(hasContractBytecode("0X")).toBe(false);
  });

  it("accepts non-empty bytecode", () => {
    expect(hasContractBytecode("0x60806040")).toBe(true);
  });
});

describe("checkLabelling", () => {
  it("errors when canonical uses a Test Asset label", () => {
    const finding = checkLabelling(
      entry({
        id: "bad-canonical",
        status: "canonical",
        label: "Margin Call Test Asset — fake",
        address: "0x000000006551c19487814612e58FE06813775758",
        expectedInterfaces: ["IERC6551Registry"],
      })
    );
    expect(finding?.code).toBe("label-canonical-mismatch");
  });

  it("errors when fallback omits Test Asset labelling", () => {
    const finding = checkLabelling(
      entry({
        id: "bad-fallback",
        status: "test-asset-fallback",
        label: "USDG",
      })
    );
    expect(finding?.code).toBe("label-fallback-mismatch");
  });

  it("accepts correctly labelled statuses", () => {
    expect(
      checkLabelling(
        entry({
          id: "ok-canonical",
          status: "canonical",
          label: "ERC-6551 Token Bound Account Registry",
          address: "0x000000006551c19487814612e58FE06813775758",
          expectedInterfaces: ["IERC6551Registry"],
        })
      )
    ).toBeNull();

    expect(
      checkLabelling(
        entry({
          id: "ok-fallback",
          status: "test-asset-fallback",
          label: "Margin Call Test Asset — test USDG",
        })
      )
    ).toBeNull();
  });
});

describe("checkInterfaceShape", () => {
  it("requires interfaces on addressed canonical entries", () => {
    const finding = checkInterfaceShape(
      entry({
        id: "no-ifaces",
        status: "canonical",
        label: "Something",
        address: "0x000000006551c19487814612e58FE06813775758",
        expectedInterfaces: [],
      })
    );
    expect(finding?.code).toBe("interfaces-missing");
  });
});

describe("isFeedStale", () => {
  const now = 1_700_000_000;

  it("treats zero and negative updatedAt as stale", () => {
    expect(
      isFeedStale({
        updatedAtSeconds: 0,
        nowSeconds: now,
        heartbeatSeconds: 3600,
      })
    ).toBe(true);
  });

  it("treats far-future updatedAt as stale", () => {
    expect(
      isFeedStale({
        updatedAtSeconds: now + 10_000,
        nowSeconds: now,
        heartbeatSeconds: 3600,
      })
    ).toBe(true);
  });

  it("treats age beyond heartbeat+grace as stale", () => {
    expect(
      isFeedStale({
        updatedAtSeconds: now - 4000,
        nowSeconds: now,
        heartbeatSeconds: 3600,
        graceSeconds: 0,
      })
    ).toBe(true);
    expect(
      isFeedStale({
        updatedAtSeconds: now - 100,
        nowSeconds: now,
        heartbeatSeconds: 3600,
      })
    ).toBe(false);
  });
});

describe("checkBytecodeExpectation", () => {
  it("errors when canonical bytecode is missing", () => {
    const finding = checkBytecodeExpectation({
      entry: entry({
        id: "reg",
        status: "canonical",
        label: "Registry",
        address: "0x000000006551c19487814612e58FE06813775758",
        expectedInterfaces: ["IERC6551Registry"],
      }),
      code: "0x",
    });
    expect(finding?.code).toBe("bytecode-missing");
  });

  it("ignores fallbacks without bytecode", () => {
    expect(
      checkBytecodeExpectation({
        entry: entry({
          id: "usdg",
          status: "test-asset-fallback",
          label: "Margin Call Test Asset — test USDG",
        }),
        code: "0x",
      })
    ).toBeNull();
  });
});

describe("assertAllowedChainId", () => {
  it("accepts Robinhood testnet", () => {
    expect(() =>
      assertAllowedChainId(ROBINHOOD_TESTNET_CHAIN_ID)
    ).not.toThrow();
    expect(() => assertAllowedChainId("eip155:46630")).not.toThrow();
  });

  it("rejects Robinhood mainnet", () => {
    expect(() =>
      assertAllowedChainId(FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID)
    ).toThrow(/Forbidden Robinhood Chain mainnet/);
  });

  it("rejects unrelated chains", () => {
    expect(() => assertAllowedChainId(84532)).toThrow(/Unexpected chainId/);
  });
});

describe("runOfflinePreflight against pinned matrix", () => {
  it("loads and passes the committed dependency matrix", () => {
    const deps = loadRobinhoodTestnetDependencies();
    const findings = runOfflinePreflight(deps);
    expect(offlinePreflightHasErrors(findings)).toBe(false);
    expect(deps.network.chainId).toBe(46630);
    expect(deps.forbidden.mainnetChainId).toBe(4663);
  });

  it("fails on a labelling mismatch injected into a copy", () => {
    const deps = loadRobinhoodTestnetDependencies();
    const broken: RobinhoodTestnetDependencies = {
      ...deps,
      dependencies: deps.dependencies.map((d) =>
        d.id === "usdg"
          ? { ...d, label: "USDG", status: "test-asset-fallback" as const }
          : d
      ),
    };
    const findings = runOfflinePreflight(broken);
    expect(findings.some((f) => f.code === "label-fallback-mismatch")).toBe(
      true
    );
    expect(offlinePreflightHasErrors(findings)).toBe(true);
  });
});
