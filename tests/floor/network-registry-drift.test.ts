import { describe, expect, it } from "vitest";
import { loadRobinhoodTestnetDependencies } from "../../scripts/floor/dependencies";
import {
  ROBINHOOD_TESTNET_NETWORK,
  ROBINHOOD_TESTNET_SLUG,
  getNetwork,
} from "../../convex/lib/networks";

describe("network registry / dependency packet drift", () => {
  const packet = loadRobinhoodTestnetDependencies();
  const network = getNetwork(ROBINHOOD_TESTNET_SLUG);

  it("matches packet chain identity", () => {
    expect(network.chainId).toBe(packet.network.chainId);
    expect(network.caip2).toBe(packet.network.caip2);
    expect(network.slug).toBe(packet.network.slug);
    expect(network.forbiddenMainnetChainId).toBe(
      packet.forbidden.mainnetChainId
    );
    expect(network.explorer.browserUrl).toBe(
      packet.network.explorer.browserUrl
    );
    expect(network.confirmation.recommendWaitBlocks).toBe(
      packet.network.confirmationAssumptions.recommendWaitBlocks
    );
    expect(network.confirmation.finalityModel).toBe(
      packet.network.confirmationAssumptions.finalityModel
    );
  });

  it("mirrors every packet dependency id, status, label, and address", () => {
    expect(ROBINHOOD_TESTNET_NETWORK.assets.length).toBe(
      packet.dependencies.length
    );
    for (const entry of packet.dependencies) {
      const asset = network.assets.find((a) => a.id === entry.id);
      expect(asset, `missing asset ${entry.id}`).toBeDefined();
      expect(asset!.status).toBe(entry.status);
      expect(asset!.label).toBe(entry.label);
      expect(asset!.address).toBe(entry.address);
    }
  });
});
