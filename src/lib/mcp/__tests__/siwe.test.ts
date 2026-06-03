import { describe, expect, it, vi, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { generateSiweNonce } from "viem/siwe";

vi.mock("server-only", () => ({}));

const mockConsume = vi.fn();
const mockIssue = vi.fn();

vi.mock("@/lib/siwa/nonce-store", () => ({
  createConvexNonceStore: () => ({
    issue: (...args: unknown[]) => mockIssue(...args),
    consume: (...args: unknown[]) => mockConsume(...args),
  }),
}));

const mockVerifySiweMessage = vi.fn();

vi.mock("viem/siwe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem/siwe")>();
  return {
    ...actual,
    verifySiweMessage: (...args: unknown[]) => mockVerifySiweMessage(...args),
  };
});

vi.mock("@/lib/contracts/client", () => ({
  makePublicClient: vi.fn(() => ({})),
}));

import {
  buildDeskSiweMessage,
  mcpBaseSubject,
  MCP_ISSUE_STATEMENT,
  verifyDeskSiwe,
} from "@/lib/mcp/siwe";
import { isMcpDeskSubject } from "@/lib/desk";

const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

describe("mcpBaseSubject", () => {
  it("returns lowercase mcp:base: address subject", () => {
    expect(mcpBaseSubject(TEST_ADDRESS)).toBe(
      `mcp:base:${TEST_ADDRESS.toLowerCase()}`
    );
  });
});

describe("isMcpDeskSubject", () => {
  it("recognizes mcp:cdp-wallet subjects", () => {
    expect(isMcpDeskSubject("mcp:cdp-wallet:abc123")).toBe(true);
  });

  it("recognizes mcp:base subjects", () => {
    expect(isMcpDeskSubject("mcp:base:0xabc")).toBe(true);
  });

  it("rejects Privy browser subjects", () => {
    expect(isMcpDeskSubject("did:privy:abc")).toBe(false);
  });
});

describe("buildDeskSiweMessage", () => {
  it("includes the MCP issuance statement and Base Sepolia chain", () => {
    const nonce = generateSiweNonce();
    const message = buildDeskSiweMessage({ address: TEST_ADDRESS, nonce });
    expect(message).toContain(MCP_ISSUE_STATEMENT);
    expect(message).toContain("Chain ID: 84532");
    expect(message).toContain(TEST_ADDRESS);
    expect(message).toContain(`Nonce: ${nonce}`);
  });
});

describe("verifyDeskSiwe", () => {
  it("rejects domain mismatch before on-chain verification", async () => {
    const nonce = generateSiweNonce();
    const message = buildDeskSiweMessage({
      address: TEST_ADDRESS,
      nonce,
      issuedAt: new Date(),
      expirationTime: new Date(Date.now() + 60_000),
    });

    process.env.NEXT_PUBLIC_APP_URL = "http://evil.example.com";

    const result = await verifyDeskSiwe({
      message,
      signature: "0x" + "ab".repeat(65),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Domain mismatch");
    }
    expect(mockVerifySiweMessage).not.toHaveBeenCalled();
  });

  it("rejects expired messages", async () => {
    const nonce = generateSiweNonce();
    const issuedAt = new Date(Date.now() - 10 * 60 * 1000);
    const expirationTime = new Date(Date.now() - 5 * 60 * 1000);
    const message = buildDeskSiweMessage({
      address: TEST_ADDRESS,
      nonce,
      issuedAt,
      expirationTime,
    });

    const result = await verifyDeskSiwe({
      message,
      signature: "0x" + "ab".repeat(65),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Message expired");
    }
    expect(mockVerifySiweMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures", async () => {
    mockVerifySiweMessage.mockResolvedValueOnce(false);
    const nonce = generateSiweNonce();
    const message = buildDeskSiweMessage({ address: TEST_ADDRESS, nonce });

    const result = await verifyDeskSiwe({
      message,
      signature: "0x" + "cd".repeat(65),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Invalid signature");
    }
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("rejects replayed nonces after a valid signature", async () => {
    mockVerifySiweMessage.mockResolvedValueOnce(true);
    mockConsume.mockResolvedValueOnce(false);
    const nonce = generateSiweNonce();
    const message = buildDeskSiweMessage({ address: TEST_ADDRESS, nonce });

    const result = await verifyDeskSiwe({
      message,
      signature: "0x" + "ef".repeat(65),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Invalid or already consumed nonce");
    }
  });

  it("accepts a valid signature and consumes the nonce", async () => {
    mockVerifySiweMessage.mockResolvedValueOnce(true);
    mockConsume.mockResolvedValueOnce(true);
    const nonce = generateSiweNonce();
    const message = buildDeskSiweMessage({ address: TEST_ADDRESS, nonce });

    const result = await verifyDeskSiwe({
      message,
      signature: "0x" + "12".repeat(65),
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.address).toBe(TEST_ADDRESS);
    }
    expect(mockConsume).toHaveBeenCalledWith(nonce);
  });

  it("verifies a real EOA signature end-to-end when mocked client defers to viem", async () => {
    const { verifySiweMessage: realVerify } =
      await vi.importActual<typeof import("viem/siwe")>("viem/siwe");
    const { makePublicClient: realMakeClient } = await vi.importActual<
      typeof import("@/lib/contracts/client")
    >("@/lib/contracts/client");

    mockVerifySiweMessage.mockImplementation(realVerify);
    vi.mocked(
      await import("@/lib/contracts/client")
    ).makePublicClient.mockImplementation(realMakeClient);

    mockConsume.mockResolvedValueOnce(true);
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efc0871742790799000"
    );
    const nonce = generateSiweNonce();
    const message = buildDeskSiweMessage({
      address: account.address,
      nonce,
    });
    const signature = await account.signMessage({ message });

    const result = await verifyDeskSiwe({ message, signature });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.address.toLowerCase()).toBe(account.address.toLowerCase());
    }
  });
});
