import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_NETWORK_ENV_KEY,
  DEFAULT_ACTIVE_NETWORK_SLUG,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_SLUG,
  addressUrl,
  assertNotForbiddenMainnet,
  assetLabel,
  blockUrl,
  getActiveNetwork,
  getConfirmationPolicy,
  getNetwork,
  isForbiddenMainnetChainId,
  isNetworkSlug,
  isTestAsset,
  listNetworks,
  listTestAssets,
  recommendWaitBlocks,
  requireRpcUrl,
  resolveActiveNetworkSlug,
  seatVaultConfirmationDepth,
  txUrl,
} from "../../convex/lib/networks";
import { BASE_SEPOLIA_CHAIN_ID } from "../../convex/lib/legacy";

describe("network registry", () => {
  it("lists only robinhood-testnet", () => {
    const slugs = listNetworks().map((n) => n.slug);
    expect(slugs).toEqual([ROBINHOOD_TESTNET_SLUG]);
  });

  it("resolves robinhood-testnet identity", () => {
    const network = getNetwork(ROBINHOOD_TESTNET_SLUG);
    expect(network.chainId).toBe(ROBINHOOD_TESTNET_CHAIN_ID);
    expect(network.caip2).toBe("eip155:46630");
    expect(network.legacy).toBe(false);
    expect(network.explorer.browserUrl).toBe(
      "https://explorer.testnet.chain.robinhood.com"
    );
  });

  it("rejects base-sepolia as a Floor network", () => {
    expect(() => getNetwork("base-sepolia")).toThrow(/Unknown network slug/);
  });

  it("throws on unknown slug", () => {
    expect(() => getNetwork("ethereum-mainnet")).toThrow(
      /Unknown network slug/
    );
  });

  it("isNetworkSlug narrows correctly", () => {
    expect(isNetworkSlug("robinhood-testnet")).toBe(true);
    expect(isNetworkSlug("base-sepolia")).toBe(false);
    expect(isNetworkSlug("mainnet")).toBe(false);
  });
});

describe("active network selection", () => {
  const original = process.env[ACTIVE_NETWORK_ENV_KEY];
  const originalPublic = process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK;

  afterEach(() => {
    if (original === undefined) delete process.env[ACTIVE_NETWORK_ENV_KEY];
    else process.env[ACTIVE_NETWORK_ENV_KEY] = original;
    if (originalPublic === undefined) {
      delete process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK;
    } else {
      process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK = originalPublic;
    }
  });

  it("defaults to robinhood-testnet", () => {
    delete process.env[ACTIVE_NETWORK_ENV_KEY];
    delete process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK;
    expect(resolveActiveNetworkSlug()).toBe(DEFAULT_ACTIVE_NETWORK_SLUG);
    expect(getActiveNetwork().slug).toBe(ROBINHOOD_TESTNET_SLUG);
  });

  it("rejects MARGIN_CALL_NETWORK=base-sepolia", () => {
    process.env[ACTIVE_NETWORK_ENV_KEY] = "base-sepolia";
    expect(() => resolveActiveNetworkSlug()).toThrow(
      /Floor supports only robinhood-testnet/
    );
  });

  it("throws on unsupported configuration", () => {
    process.env[ACTIVE_NETWORK_ENV_KEY] = "ethereum-mainnet";
    expect(() => resolveActiveNetworkSlug()).toThrow(
      /Unsupported MARGIN_CALL_NETWORK/
    );
  });
});

describe("forbidden mainnet refusal", () => {
  it("refuses Base mainnet 8453", () => {
    expect(isForbiddenMainnetChainId(FORBIDDEN_MAINNET_CHAIN_ID)).toBe(true);
    expect(() => assertNotForbiddenMainnet(8453)).toThrow(/Forbidden mainnet/);
  });

  it("refuses Robinhood mainnet 4663", () => {
    expect(
      isForbiddenMainnetChainId(FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID)
    ).toBe(true);
    expect(() => assertNotForbiddenMainnet("eip155:4663")).toThrow(
      /Forbidden mainnet/
    );
  });

  it("allows Floor and legacy testnet chain IDs", () => {
    expect(isForbiddenMainnetChainId(ROBINHOOD_TESTNET_CHAIN_ID)).toBe(false);
    expect(isForbiddenMainnetChainId(BASE_SEPOLIA_CHAIN_ID)).toBe(false);
  });
});

describe("requireRpcUrl", () => {
  const keys = [
    "ROBINHOOD_TESTNET_RPC_URL",
    "NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL",
  ] as const;
  const originals: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  });

  for (const key of keys) {
    originals[key] = process.env[key];
  }

  it("throws when RPC URL is missing", () => {
    for (const key of keys) delete process.env[key];
    expect(() => requireRpcUrl(ROBINHOOD_TESTNET_SLUG)).toThrow(
      /Robinhood Chain Testnet RPC URL is required/
    );
  });

  it("prefers primary env over public env", () => {
    process.env.ROBINHOOD_TESTNET_RPC_URL = "https://primary.example";
    process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL =
      "https://public.example";
    expect(requireRpcUrl(ROBINHOOD_TESTNET_SLUG)).toBe(
      "https://primary.example"
    );
  });

  it("rejects malformed URLs", () => {
    process.env.ROBINHOOD_TESTNET_RPC_URL = "not-a-url";
    expect(() => requireRpcUrl(ROBINHOOD_TESTNET_SLUG)).toThrow(
      /Malformed Robinhood Chain Testnet RPC URL/
    );
  });
});

describe("explorer URLs", () => {
  it("builds robinhood explorer links", () => {
    expect(txUrl(ROBINHOOD_TESTNET_SLUG, "0xabc")).toBe(
      "https://explorer.testnet.chain.robinhood.com/tx/0xabc"
    );
    expect(addressUrl(ROBINHOOD_TESTNET_SLUG, "0xdef")).toBe(
      "https://explorer.testnet.chain.robinhood.com/address/0xdef"
    );
    expect(blockUrl(ROBINHOOD_TESTNET_SLUG, 42)).toBe(
      "https://explorer.testnet.chain.robinhood.com/block/42"
    );
  });
});

describe("asset labels", () => {
  it("labels Test Asset fallbacks with Margin Call Test Asset", () => {
    expect(assetLabel(ROBINHOOD_TESTNET_SLUG, "usdg")).toMatch(
      /Margin Call Test Asset/
    );
    expect(isTestAsset(ROBINHOOD_TESTNET_SLUG, "usdg")).toBe(true);
  });

  it("does not label canonical assets as Test Assets", () => {
    expect(isTestAsset(ROBINHOOD_TESTNET_SLUG, "erc6551-registry")).toBe(false);
    expect(assetLabel(ROBINHOOD_TESTNET_SLUG, "erc6551-registry")).not.toMatch(
      /Margin Call Test Asset/
    );
  });

  it("lists all Test Asset fallbacks on robinhood-testnet", () => {
    const fallbacks = listTestAssets(ROBINHOOD_TESTNET_SLUG);
    expect(fallbacks.length).toBeGreaterThan(0);
    for (const asset of fallbacks) {
      expect(asset.label).toMatch(/Margin Call Test Asset/);
    }
  });
});

describe("confirmation policy", () => {
  it("uses 1 confirmation for robinhood-testnet", () => {
    expect(recommendWaitBlocks(ROBINHOOD_TESTNET_SLUG)).toBe(1);
    expect(getConfirmationPolicy(ROBINHOOD_TESTNET_SLUG).finalityModel).toBe(
      "arbitrum-nitro-l2"
    );
  });

  it("throws SeatVault depth on robinhood-testnet", () => {
    expect(() => seatVaultConfirmationDepth(ROBINHOOD_TESTNET_SLUG)).toThrow(
      /no SeatVault confirmation depth/
    );
  });
});
