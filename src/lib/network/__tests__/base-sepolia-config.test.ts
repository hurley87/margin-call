import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_SLUG,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_MAINNET_USDC,
  USDC_SEPOLIA_ADDRESS,
  isBaseSepoliaChainId,
  requireBaseSepoliaRpcUrl,
  resolveAddress,
} from "@/lib/network";
import { SEAT_VAULT_V1 } from "../../../../convex/seatVault/policy";

const ACTIVE_JSON_PATH = join(
  process.cwd(),
  "contracts/deployments/base-sepolia.active.json"
);

describe("baseSepoliaNetwork", () => {
  it("exports Base Sepolia chain identity only", () => {
    expect(BASE_SEPOLIA_CHAIN_ID).toBe(84532);
    expect(BASE_SEPOLIA_CAIP2).toBe("eip155:84532");
    expect(BASE_SEPOLIA_SLUG).toBe("base-sepolia");
    expect(isBaseSepoliaChainId(84532)).toBe(true);
    expect(isBaseSepoliaChainId("84532")).toBe(true);
    expect(isBaseSepoliaChainId(BASE_SEPOLIA_CAIP2)).toBe(true);
    expect(isBaseSepoliaChainId(FORBIDDEN_MAINNET_CHAIN_ID)).toBe(false);
  });

  it("does not expose mainnet USDC as active USDC", () => {
    expect(USDC_SEPOLIA_ADDRESS.toLowerCase()).not.toBe(
      FORBIDDEN_MAINNET_USDC.toLowerCase()
    );
  });
});

describe("activeDeployment", () => {
  it("matches contracts/deployments/base-sepolia.active.json", () => {
    const json = JSON.parse(readFileSync(ACTIVE_JSON_PATH, "utf8")) as {
      version: number;
      chainId: number;
      escrow: string;
      margincallToken: string;
      seatVault: string;
      deployedAt: string;
    };

    expect(ACTIVE_BASE_SEPOLIA_DEPLOYMENT).toEqual(json);
    expect(ACTIVE_BASE_SEPOLIA_DEPLOYMENT.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
  });

  it("aligns SEAT_VAULT_V1 with the active record", () => {
    expect(SEAT_VAULT_V1.address).toBe(
      ACTIVE_BASE_SEPOLIA_DEPLOYMENT.seatVault
    );
    expect(SEAT_VAULT_V1.margincallToken).toBe(
      ACTIVE_BASE_SEPOLIA_DEPLOYMENT.margincallToken
    );
    expect(SEAT_VAULT_V1.escrow).toBe(ACTIVE_BASE_SEPOLIA_DEPLOYMENT.escrow);
  });
});

describe("resolveAddress", () => {
  const canonical =
    "0xa244550f0e35032E9c0b09DA4EB4933848d28d16" as `0x${string}`;

  it("returns canonical when env is unset", () => {
    expect(resolveAddress([undefined], canonical, "ESCROW_ADDRESS")).toBe(
      canonical
    );
  });

  it("returns canonical when env matches case-insensitively", () => {
    expect(
      resolveAddress([canonical.toLowerCase()], canonical, "ESCROW_ADDRESS")
    ).toBe(canonical);
  });

  it("throws when env mismatches canonical", () => {
    expect(() =>
      resolveAddress(
        ["0x0000000000000000000000000000000000000001"],
        canonical,
        "ESCROW_ADDRESS"
      )
    ).toThrow(/does not match active Base Sepolia deployment/);
  });
});

describe("requireBaseSepoliaRpcUrl", () => {
  const originalBase = process.env.BASE_SEPOLIA_RPC_URL;
  const originalPublic = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;

  afterEach(() => {
    if (originalBase === undefined) {
      delete process.env.BASE_SEPOLIA_RPC_URL;
    } else {
      process.env.BASE_SEPOLIA_RPC_URL = originalBase;
    }
    if (originalPublic === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL = originalPublic;
    }
  });

  it("throws when RPC URL is missing", () => {
    delete process.env.BASE_SEPOLIA_RPC_URL;
    delete process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
    expect(() => requireBaseSepoliaRpcUrl()).toThrow(
      /Base Sepolia RPC URL is required/
    );
  });

  it("prefers BASE_SEPOLIA_RPC_URL over NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL", () => {
    process.env.BASE_SEPOLIA_RPC_URL = "https://convex-rpc.example";
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL =
      "https://next-public-rpc.example";
    expect(requireBaseSepoliaRpcUrl()).toBe("https://convex-rpc.example");
  });
});

describe("MCP plugin drift", () => {
  it("matches canonical chain slug, escrow, and USDC", () => {
    const pluginPath = join(
      process.cwd(),
      "packages/mcp-server/base-plugin/margin-call.md"
    );
    const plugin = readFileSync(pluginPath, "utf8");

    expect(plugin).toContain(
      `**Chain:** Base Sepolia (\`${BASE_SEPOLIA_SLUG}\`)`
    );
    expect(plugin).toContain(ACTIVE_BASE_SEPOLIA_DEPLOYMENT.escrow);
    expect(plugin).toContain(USDC_SEPOLIA_ADDRESS);
    expect(plugin).not.toContain(String(FORBIDDEN_MAINNET_CHAIN_ID));
    expect(plugin).not.toContain(FORBIDDEN_MAINNET_USDC);
  });
});
