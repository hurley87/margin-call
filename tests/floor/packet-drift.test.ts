import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CAIP2,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_SLUG,
  loadRobinhoodTestnetDependencies,
} from "../../scripts/floor/dependencies";
import {
  offlinePreflightHasErrors,
  runOfflinePreflight,
} from "../../scripts/floor/preflight-checks";

describe("Robinhood testnet dependency matrix", () => {
  const deps = loadRobinhoodTestnetDependencies();

  it("passes offline preflight", () => {
    const findings = runOfflinePreflight(deps);
    expect(offlinePreflightHasErrors(findings)).toBe(false);
  });

  it("pins the Robinhood testnet chain identity", () => {
    expect(deps.network.chainId).toBe(ROBINHOOD_TESTNET_CHAIN_ID);
    expect(deps.network.caip2).toBe(ROBINHOOD_TESTNET_CAIP2);
    expect(deps.network.slug).toBe(ROBINHOOD_TESTNET_SLUG);
    expect(deps.forbidden.mainnetChainId).toBe(
      FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID
    );
    expect(deps.network.rpc.envKey).toBe("ROBINHOOD_TESTNET_RPC_URL");
  });

  it("keeps every dependency id, status, and address well-formed", () => {
    expect(deps.dependencies.length).toBeGreaterThan(0);
    for (const entry of deps.dependencies) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(["canonical", "test-asset-fallback", "unverified"]).toContain(
        entry.status
      );
      if (entry.address !== null) {
        expect(entry.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    }
  });

  it("does not present Test Asset fallbacks as canonical Robinhood assets", () => {
    for (const entry of deps.dependencies) {
      if (entry.status !== "test-asset-fallback") continue;
      expect(entry.label).toMatch(/Margin Call Test Asset/i);
    }
  });

  it("forbids mainnet in the dependency matrix", () => {
    expect(deps.forbidden.mainnetChainId).toBe(
      FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID
    );
  });
});
