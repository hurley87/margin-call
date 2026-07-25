import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const PACKET_PATH = join(
  process.cwd(),
  "docs/floor/robinhood-testnet-dependency-packet.md"
);

describe("Robinhood testnet packet / matrix drift", () => {
  const deps = loadRobinhoodTestnetDependencies();
  const packet = readFileSync(PACKET_PATH, "utf8");

  it("passes offline preflight", () => {
    const findings = runOfflinePreflight(deps);
    expect(offlinePreflightHasErrors(findings)).toBe(false);
  });

  it("documents the pinned chain identity", () => {
    expect(deps.network.chainId).toBe(ROBINHOOD_TESTNET_CHAIN_ID);
    expect(deps.network.caip2).toBe(ROBINHOOD_TESTNET_CAIP2);
    expect(deps.network.slug).toBe(ROBINHOOD_TESTNET_SLUG);
    expect(packet).toContain(String(ROBINHOOD_TESTNET_CHAIN_ID));
    expect(packet).toContain(ROBINHOOD_TESTNET_CAIP2);
    expect(packet).toContain(`\`${ROBINHOOD_TESTNET_SLUG}\``);
    expect(packet).toContain(String(FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID));
    expect(packet).toContain("ROBINHOOD_TESTNET_RPC_URL");
  });

  it("lists every matrix dependency id and status", () => {
    for (const entry of deps.dependencies) {
      expect(packet).toContain(`\`${entry.id}\``);
      expect(packet).toContain(entry.label);
      // Status appears in the matrix table row for this id.
      const idIndex = packet.indexOf(`\`${entry.id}\``);
      expect(idIndex).toBeGreaterThanOrEqual(0);
      const rowSlice = packet.slice(idIndex, idIndex + 400);
      expect(rowSlice).toContain(entry.status);
      if (entry.address) {
        expect(packet).toContain(entry.address);
      }
    }
  });

  it("does not present Test Asset fallbacks as canonical Robinhood assets", () => {
    for (const entry of deps.dependencies) {
      if (entry.status !== "test-asset-fallback") continue;
      expect(entry.label).toMatch(/Margin Call Test Asset/i);
    }
    expect(packet).toContain(
      "Mocks and fallbacks **must never** be presented as real Robinhood Stock Tokens or real USDG."
    );
  });

  it("forbids mainnet in the packet attestation", () => {
    expect(packet).toMatch(/No mainnet deployment/i);
    expect(deps.forbidden.mainnetChainId).toBe(
      FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID
    );
  });
});
